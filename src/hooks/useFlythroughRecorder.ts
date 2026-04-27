import { useCallback, useRef, useState } from 'react';

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

  const isSupported = typeof MediaRecorder !== 'undefined' && !!pickMimeType();

  const startRecording = useCallback(
    (canvas: HTMLCanvasElement, fps = 30): boolean => {
      const mimeType = pickMimeType();
      if (!mimeType) return false;

      try {
        // @ts-ignore — captureStream is standard but TS lib may lag
        const stream: MediaStream = canvas.captureStream(fps);
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
          // stop tracks
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        };

        recorder.start(250);
        recorderRef.current = recorder;
        setIsRecording(true);
        return true;
      } catch (err) {
        console.error('startRecording failed', err);
        return false;
      }
    },
    []
  );

  const stopRecording = useCallback(() => {
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
