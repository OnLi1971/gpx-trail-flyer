import { useCallback, useRef, useState, MutableRefObject, useEffect } from 'react';
import { Map, LngLatBounds } from 'maplibre-gl';
import { GPXData } from '@/types/gpx';
import { StageSegment } from '@/utils/stages';

/**
 * Postupné vykreslování etap: každá etapa se "nakreslí" za nastavený čas,
 * kamera se u toho pomalu otáčí kolem dané etapy.
 */
export function useStageShow(
  map: MutableRefObject<Map | null>,
  gpxData: GPXData | null,
  segments: StageSegment[]
) {
  const [isShowPlaying, setIsShowPlaying] = useState(false);
  const [showDrawIndex, setShowDrawIndex] = useState<number | null>(null);
  const [activeStageIndex, setActiveStageIndex] = useState<number | null>(null);

  const [stageDrawSec, setStageDrawSec] = useState(10);
  const [stagePauseSec, setStagePauseSec] = useState(1.5);
  const [showOrbitDeg, setShowOrbitDeg] = useState(60);
  const [showPitch, setShowPitch] = useState(55);
  const [showPadding, setShowPadding] = useState(80);

  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const stopStageShow = useCallback(() => {
    cancelledRef.current = true;
    cleanup();
    setIsShowPlaying(false);
    setShowDrawIndex(null);
    setActiveStageIndex(null);
    const m = map.current;
    const track = gpxData?.tracks[0];
    if (m && track?.points.length) {
      const b = new LngLatBounds();
      track.points.forEach((p) => b.extend([p.lon, p.lat]));
      m.fitBounds(b, { padding: 60, pitch: 0, bearing: 0, duration: 1200 });
    }
  }, [cleanup, map, gpxData]);

  const startStageShow = useCallback(() => {
    const m = map.current;
    const track = gpxData?.tracks[0];
    if (!m || !track?.points.length) return;

    const segs = segments.length
      ? segments
      : [{ startIdx: 0, endIdx: track.points.length, color: '#ff0000', name: track.name || 'Trasa' }];

    cancelledRef.current = false;
    cleanup();
    setIsShowPlaying(true);
    setShowDrawIndex(0);

    const runSegment = (i: number) => {
      if (cancelledRef.current || !map.current) return;
      if (i >= segs.length) {
        // závěr — celá trasa a oddálení
        setShowDrawIndex(track.points.length);
        setActiveStageIndex(null);
        const b = new LngLatBounds();
        track.points.forEach((p) => b.extend([p.lon, p.lat]));
        map.current.fitBounds(b, { padding: 70, pitch: showPitch, bearing: 0, duration: 2500 });
        timeoutRef.current = setTimeout(() => {
          setIsShowPlaying(false);
        }, 2600);
        return;
      }

      const seg = segs[i];
      setActiveStageIndex(i);
      const pts = track.points.slice(seg.startIdx, seg.endIdx);
      if (pts.length < 2) {
        runSegment(i + 1);
        return;
      }

      const bounds = new LngLatBounds();
      pts.forEach((p) => bounds.extend([p.lon, p.lat]));

      const startBearing = ((map.current.getBearing() % 360) + 360) % 360;
      map.current.fitBounds(bounds, {
        padding: showPadding,
        pitch: showPitch,
        bearing: startBearing,
        duration: 1500,
        essential: true,
      });

      timeoutRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        const t0 = performance.now();
        const durMs = Math.max(1000, stageDrawSec * 1000);
        const totalDeg = showOrbitDeg;

        const tick = (now: number) => {
          if (cancelledRef.current || !map.current) return;
          const t = Math.min(1, (now - t0) / durMs);
          const idx = seg.startIdx + Math.round(t * (seg.endIdx - seg.startIdx));
          setShowDrawIndex(idx);
          map.current.setBearing((startBearing + t * totalDeg) % 360);
          if (t < 1) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            rafRef.current = null;
            timeoutRef.current = setTimeout(
              () => runSegment(i + 1),
              Math.max(0, stagePauseSec * 1000)
            );
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      }, 1600);
    };

    runSegment(0);
  }, [map, gpxData, segments, cleanup, stageDrawSec, stagePauseSec, showOrbitDeg, showPitch, showPadding]);

  useEffect(() => () => {
    cancelledRef.current = true;
    cleanup();
  }, [cleanup]);

  return {
    isShowPlaying,
    showDrawIndex,
    activeStageIndex,
    startStageShow,
    stopStageShow,
    stageDrawSec,
    setStageDrawSec,
    stagePauseSec,
    setStagePauseSec,
    showOrbitDeg,
    setShowOrbitDeg,
    showPitch,
    setShowPitch,
    showPadding,
    setShowPadding,
  };
}
