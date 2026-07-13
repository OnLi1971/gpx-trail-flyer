import { useCallback, useRef, useState } from 'react';
import { toCanvas } from 'html-to-image';

function pickMimeType(): string | null {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return null;
}

export interface RecordedVideo {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: string;
}

export function useFlythroughRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recorded, setRecorded] = useState<RecordedVideo | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const renderingRef = useRef(false);

  const isSupported = typeof MediaRecorder !== 'undefined' && !!pickMimeType();

  /**
   * Spustí kompozitní nahrávání:
   *  - mapCanvas: WebGL canvas mapy (zachycuje terén/cesty)
   *  - overlayContainer: DOM kontejner s markery (POI, fotky, cyklista) — překresluje se přes html-to-image
   * Výsledek je MediaStream z offscreen canvasu, který obsahuje vše.
   */
  const startRecording = useCallback(
    (mapCanvas: HTMLCanvasElement, overlayContainer: HTMLElement, fps = 25): boolean => {
      const mimeType = pickMimeType();
      if (!mimeType) return false;

      try {
        const rect = overlayContainer.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.round(rect.width * dpr);
        const height = Math.round(rect.height * dpr);

        const composite = document.createElement('canvas');
        composite.width = width;
        composite.height = height;
        const ctx = composite.getContext('2d');
        if (!ctx) return false;
        compositeCanvasRef.current = composite;
        compositeCtxRef.current = ctx;

        // První frame — ať stream není prázdný
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        try {
          ctx.drawImage(mapCanvas, 0, 0, width, height);
        } catch {}

        // @ts-ignore — captureStream is standard but TS lib may lag
        const stream: MediaStream = composite.captureStream(fps);
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
          setRecorded({ blob, url, mimeType, extension });
          setIsRecording(false);
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };

        recorder.start(250);
        recorderRef.current = recorder;
        stoppedRef.current = false;
        setIsRecording(true);

        // Render loop: každý ~1/fps s znovu vykreslíme mapu + overlay markery do composite canvasu.
        // Markery (DOM) renderujeme přes html-to-image — pomalejší, proto throttluje sám sebe.
        const targetInterval = 1000 / fps;
        let lastOverlayDraw = 0;
        const overlayCanvasCache: { canvas: HTMLCanvasElement | null } = { canvas: null };

        const renderFrame = async (now: number) => {
          if (stoppedRef.current) return;
          const c = compositeCtxRef.current;
          const cv = compositeCanvasRef.current;
          if (!c || !cv) return;

          // 1) Mapa
          try {
            c.clearRect(0, 0, cv.width, cv.height);
            c.drawImage(mapCanvas, 0, 0, cv.width, cv.height);
          } catch {}

          // 2) Overlay s markery — re-render maximálně každých ~150 ms (drahé)
          if (!renderingRef.current && now - lastOverlayDraw > 150) {
            renderingRef.current = true;
            lastOverlayDraw = now;
            toCanvas(overlayContainer, {
              pixelRatio: dpr,
              cacheBust: false,
              skipFonts: true,
              filter: (node) => {
                // Vynech samotný mapový canvas (už je nakreslený) a UI ovládací prvky mimo mapu
                if (node instanceof HTMLCanvasElement) return false;
                if (node instanceof HTMLElement) {
                  if (node.classList?.contains('maplibregl-control-container')) return false;
                  if (node.classList?.contains('maplibregl-canvas-container')) {
                    // necháme container (obsahuje markery), ale jeho canvas vyfiltruje výše
                    return true;
                  }
                  // UI prvky označené jako no-video-capture se do videa nedostanou
                  if (node.classList?.contains('no-video-capture')) return false;
                  if (node.closest?.('.no-video-capture')) return false;
                }
                return true;
              },
            })
              .then((overlay) => {
                overlayCanvasCache.canvas = overlay;
              })
              .catch(() => {})
              .finally(() => {
                renderingRef.current = false;
              });
          }

          // Nakresli poslední overlay (pokud je)
          if (overlayCanvasCache.canvas) {
            try {
              c.drawImage(overlayCanvasCache.canvas, 0, 0, cv.width, cv.height);
            } catch {}
          }

          rafRef.current = window.setTimeout(
            () => requestAnimationFrame((t) => renderFrame(t)),
            targetInterval,
          ) as unknown as number;
        };

        requestAnimationFrame((t) => renderFrame(t));
        return true;
      } catch (err) {
        console.error('startRecording failed', err);
        return false;
      }
    },
    [],
  );

  const stopRecording = useCallback(() => {
    stoppedRef.current = true;
    if (rafRef.current) {
      clearTimeout(rafRef.current);
      rafRef.current = null;
    }
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      r.stop();
    }
    recorderRef.current = null;
  }, []);

  const clearRecorded = useCallback(() => {
    if (recorded?.url) URL.revokeObjectURL(recorded.url);
    setRecorded(null);
  }, [recorded]);

  return { isSupported, isRecording, recorded, startRecording, stopRecording, clearRecorded };
}
