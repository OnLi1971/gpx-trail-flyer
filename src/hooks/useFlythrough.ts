import { useState, useRef, useCallback, MutableRefObject } from 'react';
import { Map, Marker, LngLatBounds } from 'maplibre-gl';
import { GPXData } from '@/types/gpx';

export type MarkerIcon = 'bike' | 'walk' | 'car';

const MARKER_ICON_SVGS: Record<MarkerIcon, string> = {
  // bike (původní)
  bike: `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18.5" cy="17.5" r="3.5"/>
      <circle cx="5.5" cy="17.5" r="3.5"/>
      <circle cx="15" cy="5" r="1"/>
      <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
    </svg>`,
  // chodec (lucide PersonStanding)
  walk: `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="5" r="1"/>
      <path d="M9 20l3-6 3 6"/>
      <path d="M6 8l6 2 6-2"/>
      <path d="M12 10v4"/>
    </svg>`,
  // auto (lucide Car)
  car: `
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/>
      <circle cx="17" cy="17" r="2"/>
    </svg>`,
};

function calculateBearing(start: { lat: number; lon: number }, end: { lat: number; lon: number }) {
  const startLat = start.lat * Math.PI / 180;
  const startLon = start.lon * Math.PI / 180;
  const endLat = end.lat * Math.PI / 180;
  const endLon = end.lon * Math.PI / 180;

  const dLon = endLon - startLon;
  const y = Math.sin(dLon) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLon);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

function calculateGrade(start: { lat: number; lon: number; ele?: number }, end: { lat: number; lon: number; ele?: number }) {
  if (start.ele === undefined || end.ele === undefined) return null;

  const R = 6371000;
  const dLat = (end.lat - start.lat) * Math.PI / 180;
  const dLon = (end.lon - start.lon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const horizontalDistance = R * c;

  if (horizontalDistance < 1) return null;

  const elevationDiff = end.ele - start.ele;
  const grade = (elevationDiff / horizontalDistance) * 100;

  return Math.round(grade * 10) / 10;
}

export function useFlythrough(
  map: MutableRefObject<Map | null>,
  gpxData: GPXData | null,
  onComplete?: (reason: 'finished' | 'stopped') => void
) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [isFlying, setIsFlying] = useState(false);
  const [flySpeed, setFlySpeedState] = useState(82);
  const [flyRotation, setFlyRotationState] = useState(32);
  const [flyZoom, setFlyZoomState] = useState(12.5);
  const [elevationExaggeration, setElevationExaggerationState] = useState(1.9);
  const [flyingIndex, setFlyingIndex] = useState<number | null>(null);
  const [currentGrade, setCurrentGrade] = useState<number | null>(null);
  const [mapPitch, setMapPitchState] = useState(73);
  const [flyStartTimestamp, setFlyStartTimestamp] = useState<number | null>(null);

  const flyAnimationRef = useRef<number | null>(null);
  const flyStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flySpeedRef = useRef(82);
  const flyRotationRef = useRef(32);
  const flyZoomRef = useRef(12.5);
  const elevationExaggerationRef = useRef(1.9);
  const lastBearingRef = useRef(0);
  const flyMarkerRef = useRef<Marker | null>(null);
  const [markerIcon, setMarkerIconState] = useState<MarkerIcon>('bike');
  const markerIconRef = useRef<MarkerIcon>('bike');

  const setMarkerIcon = useCallback((icon: MarkerIcon) => {
    setMarkerIconState(icon);
    markerIconRef.current = icon;
    if (flyMarkerRef.current) {
      const el = flyMarkerRef.current.getElement();
      el.innerHTML = MARKER_ICON_SVGS[icon];
    }
  }, []);

  // Vypočítaná délka průletu (sekundy) — odvozeno přesně podle vzorce v animateStep:
  //   step = max(1, floor(speed/10))
  //   duration_ms = max(16, 800 - speed*7.7)
  //   čekání mezi kroky = duration_ms * 0.8 → reálný čas na krok ≈ duration_ms (easeTo + setTimeout 0.8d běží paralelně)
  // V praxi se používá duration jako čas na jeden krok.
  const flyDurationSec = (() => {
    if (!gpxData || gpxData.tracks.length === 0) return 60;
    const totalPoints = gpxData.tracks[0].points.length;
    if (totalPoints < 2) return 60;
    const speed = flySpeed;
    const step = Math.max(1, Math.floor(speed / 10));
    const duration = Math.max(16, 800 - speed * 7.7);
    const numSteps = Math.ceil((totalPoints - 1) / step);
    // 2 s úvodní flyTo + numSteps * duration
    return Math.max(5, Math.round((2000 + numSteps * duration) / 1000));
  })();

  const setFlySpeed = useCallback((value: number) => {
    setFlySpeedState(value);
    flySpeedRef.current = value;
  }, []);

  const setFlyRotation = useCallback((value: number) => {
    setFlyRotationState(value);
    flyRotationRef.current = value;
  }, []);

  const setFlyZoom = useCallback((value: number) => {
    setFlyZoomState(value);
    flyZoomRef.current = value;
  }, []);

  const setElevationExaggeration = useCallback((value: number) => {
    setElevationExaggerationState(value);
    elevationExaggerationRef.current = value;
    if (map.current) {
      map.current.setTerrain({ source: 'terrain-dem', exaggeration: value });
    }
  }, [map]);

  const setMapPitch = useCallback((value: number) => {
    setMapPitchState(value);
    if (map.current) {
      map.current.easeTo({ pitch: value, duration: 300 });
    }
  }, [map]);

  const stopFlythrough = useCallback((reason: 'finished' | 'stopped' = 'stopped') => {
    if (flyAnimationRef.current) {
      cancelAnimationFrame(flyAnimationRef.current);
      flyAnimationRef.current = null;
    }
    if (flyStartTimeoutRef.current) {
      clearTimeout(flyStartTimeoutRef.current);
      flyStartTimeoutRef.current = null;
    }
    if (flyStepTimeoutRef.current) {
      clearTimeout(flyStepTimeoutRef.current);
      flyStepTimeoutRef.current = null;
    }
    setIsFlying(false);
    setFlyingIndex(null);
    setCurrentGrade(null);
    setFlyStartTimestamp(null);

    if (flyMarkerRef.current) {
      flyMarkerRef.current.remove();
      flyMarkerRef.current = null;
    }

    if (map.current && gpxData && gpxData.tracks.length > 0) {
      const track = gpxData.tracks[0];
      const bounds = new LngLatBounds();
      track.points.forEach((point) => {
        bounds.extend([point.lon, point.lat]);
      });

      map.current.flyTo({
        center: bounds.getCenter(),
        zoom: 12,
        pitch: mapPitch,
        bearing: 0,
        duration: 1500,
      });
    }

    onCompleteRef.current?.(reason);
  }, [map, gpxData, mapPitch]);

  const startFlythrough = useCallback(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    if (track.points.length < 2) return;

    setIsFlying(true);
    setFlyingIndex(0);
    setFlyStartTimestamp(null); // nastaví se až po úvodním 2 s flyTo
    let currentIndex = 0;
    const totalPoints = track.points.length;

    const animateStep = () => {
      if (!map.current || currentIndex >= totalPoints - 1) {
        stopFlythrough('finished');
        return;
      }

      const speed = flySpeedRef.current;
      // 3x faster max: bigger steps and shorter duration
      const step = Math.max(1, Math.floor(speed / 10));
      const duration = Math.max(16, 800 - (speed * 7.7));

      const currentPoint = track.points[currentIndex];
      const nextIndex = Math.min(currentIndex + step, totalPoints - 1);
      const nextPoint = track.points[nextIndex];

      const targetBearing = calculateBearing(currentPoint, nextPoint);

      const rotationFactor = flyRotationRef.current / 100;
      let smoothBearing = lastBearingRef.current;

      if (rotationFactor > 0) {
        let diff = targetBearing - lastBearingRef.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        smoothBearing = lastBearingRef.current + diff * rotationFactor * 0.3;
        smoothBearing = ((smoothBearing % 360) + 360) % 360;
      }
      lastBearingRef.current = smoothBearing;

      map.current.easeTo({
        center: [currentPoint.lon, currentPoint.lat],
        bearing: smoothBearing,
        pitch: mapPitch,
        zoom: flyZoomRef.current,
        duration: duration,
        easing: (t: number) => t,
      });

      currentIndex = nextIndex;
      setFlyingIndex(currentIndex);

      const grade = calculateGrade(currentPoint, nextPoint);
      setCurrentGrade(grade);

      if (flyMarkerRef.current) {
        flyMarkerRef.current.setLngLat([currentPoint.lon, currentPoint.lat]);
      } else {
        const markerElement = document.createElement('div');
        markerElement.innerHTML = MARKER_ICON_SVGS[markerIconRef.current];
        markerElement.style.color = '#ef4444';
        markerElement.style.filter = 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))';
        flyMarkerRef.current = new Marker({ element: markerElement })
          .setLngLat([currentPoint.lon, currentPoint.lat])
          .addTo(map.current!);
      }

      flyStepTimeoutRef.current = setTimeout(() => {
        flyAnimationRef.current = requestAnimationFrame(animateStep);
      }, duration * 0.8);
    };

    const startPoint = track.points[0];
    const initialStep = Math.max(1, Math.floor(flySpeedRef.current / 10));
    const secondPoint = track.points[Math.min(initialStep, totalPoints - 1)];
    const initialBearing = calculateBearing(startPoint, secondPoint);

    // Use current pitch (don't force 60)
    const startPitch = mapPitch > 0 ? mapPitch : 60;

    map.current.flyTo({
      center: [startPoint.lon, startPoint.lat],
      zoom: 15,
      pitch: startPitch,
      bearing: initialBearing,
      duration: 2000,
      essential: true,
    });

    setMapPitchState(startPitch);

    flyStartTimeoutRef.current = setTimeout(() => {
      setFlyStartTimestamp(Date.now());
      flyAnimationRef.current = requestAnimationFrame(animateStep);
    }, 2000);
  }, [map, gpxData, mapPitch, stopFlythrough]);

  return {
    isFlying,
    flyingIndex,
    currentGrade,
    mapPitch,
    flySpeed,
    flyRotation,
    flyZoom,
    elevationExaggeration,
    setFlySpeed,
    setFlyRotation,
    setFlyZoom,
    setElevationExaggeration,
    setMapPitch,
    startFlythrough,
    stopFlythrough,
    flyDurationSec,
    flyStartTimestamp,
    markerIcon,
    setMarkerIcon,
  };
}
