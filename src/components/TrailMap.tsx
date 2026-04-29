import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, AnimationSettings } from '@/types/gpx';

import { ElevationChart } from './ElevationChart';
import { Mountain, Play, Square, RotateCcw, ZoomIn, TrendingUp, ArrowUp, ArrowDown, Minus, MapPin, X, Bug, ListChecks, Search, RefreshCw, Plus, Crosshair, Video, CircleDot, Maximize2, Minimize2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { fetchPeaksAndPlaces, filterPOIsNearTrack } from '@/utils/overpassApi';
import { useFlythrough } from '@/hooks/useFlythrough';
import { useElevationData } from '@/hooks/useElevationData';
import { useFlythroughRecorder } from '@/hooks/useFlythroughRecorder';
import { VideoPreviewDialog } from './VideoPreviewDialog';
import { toast } from 'sonner';

export interface PoiSettings {
  peakLimit: number;
  placeLimit: number;
  peakSelectionMode: 'auto' | 'manual';
  selectedPeakKeys: string[];
}

interface TrailMapProps {
  gpxData: GPXData | null;
  currentPosition: number;
  animationSettings: AnimationSettings;
  readOnly?: boolean;
  initialPoiSettings?: PoiSettings | null;
  onPoiSettingsChange?: (settings: PoiSettings) => void;
  /** Předem uložená POI z DB — pokud jsou, Overpass se nevolá */
  cachedPois?: import('@/utils/overpassApi').POIPoint[] | null;
  /** Zavolá se po úspěšném (znovu)načtení POI z Overpassu — vlastník je může uložit */
  onPoisFetched?: (pois: import('@/utils/overpassApi').POIPoint[]) => void;
  /** Notifikace o stavu průletu — pro nadřazenou komponentu */
  onFlyStateChange?: (state: { isFlying: boolean; flyDurationSec: number; flyStartTimestamp: number | null }) => void;
}

export const TrailMap: React.FC<TrailMapProps> = ({
  gpxData,
  currentPosition,
  animationSettings,
  readOnly = false,
  initialPoiSettings = null,
  onPoiSettingsChange,
  cachedPois = null,
  onPoisFetched,
  onFlyStateChange,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const poiMarkersRef = useRef<Marker[]>([]);

  // POI debug state (visible on mobile)
  const [poiStatus, setPoiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [poiCounts, setPoiCounts] = useState({ peaks: 0, places: 0, raw: 0, filtered: 0 });
  const [poiError, setPoiError] = useState<string | null>(null);
  const [poiPanelExpanded, setPoiPanelExpanded] = useState(false);

  // POI density — separate limits for peaks (hory) and places (města)
  const [peakLimit, setPeakLimit] = useState(initialPoiSettings?.peakLimit ?? 25);
  const [placeLimit, setPlaceLimit] = useState(initialPoiSettings?.placeLimit ?? 15);
  // Manual peak selection
  const [peakSelectionMode, setPeakSelectionMode] = useState<'auto' | 'manual'>(initialPoiSettings?.peakSelectionMode ?? 'auto');
  const [selectedPeakKeys, setSelectedPeakKeys] = useState<Set<string>>(
    new Set(initialPoiSettings?.selectedPeakKeys ?? [])
  );
  const [peakSearch, setPeakSearch] = useState('');
  const allNearbyPoisRef = useRef<import('@/utils/overpassApi').POIPoint[]>([]);
  const hasInitialPoiRef = useRef<boolean>(!!initialPoiSettings);

  // Custom peak (přidaný uživatelem)
  const [customPeakName, setCustomPeakName] = useState('');
  const [customPeakEle, setCustomPeakEle] = useState('');
  const [customPeakLat, setCustomPeakLat] = useState('');
  const [customPeakLon, setCustomPeakLon] = useState('');
  const [pickingPeakOnMap, setPickingPeakOnMap] = useState(false);
  const [customPeakError, setCustomPeakError] = useState<string | null>(null);
  // Tick pro re-render po mutaci allNearbyPoisRef (přidání custom vrcholu)
  const [poiVersion, setPoiVersion] = useState(0);

  // Pokud initialPoiSettings dorazí asynchronně (po mountu), aplikuj je jednou
  const initialAppliedRef = useRef<boolean>(!!initialPoiSettings);
  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (!initialPoiSettings) return;
    initialAppliedRef.current = true;
    hasInitialPoiRef.current = true;
    setPeakLimit(initialPoiSettings.peakLimit);
    setPlaceLimit(initialPoiSettings.placeLimit);
    setPeakSelectionMode(initialPoiSettings.peakSelectionMode);
    setSelectedPeakKeys(new Set(initialPoiSettings.selectedPeakKeys));
  }, [initialPoiSettings]);

  // Emit POI settings to parent when they change
  useEffect(() => {
    if (!onPoiSettingsChange) return;
    onPoiSettingsChange({
      peakLimit,
      placeLimit,
      peakSelectionMode,
      selectedPeakKeys: [...selectedPeakKeys],
    });
  }, [peakLimit, placeLimit, peakSelectionMode, selectedPeakKeys, onPoiSettingsChange]);

  // Helper: stable key per peak
  const peakKey = (p: import('@/utils/overpassApi').POIPoint) =>
    `${p.name}@${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

  // Hooks — order matters: flythrough first (produces flyingIndex)
  const recorder = useFlythroughRecorder();
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const isRecordingRef = useRef(false);

  // Resize mapy + ESC pro ukončení prezentačního módu
  useEffect(() => {
    if (!map.current) return;
    const t = setTimeout(() => map.current?.resize(), 60);
    return () => clearTimeout(t);
  }, [presentationMode]);

  useEffect(() => {
    if (!presentationMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresentationMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presentationMode]);

  const flythrough = useFlythrough(map, gpxData, (reason) => {
    // Pokud nahráváme, zastav nahrávání a otevři dialog s náhledem
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      recorder.stopRecording();
      // dialog otevřeme po onstop callbacku — ten naplní recorded
      setTimeout(() => setVideoDialogOpen(true), 300);
    }
  });
  

  const handleStartRecording = useCallback(() => {
    if (!map.current) return;
    if (!recorder.isSupported) {
      toast.error('Tvůj prohlížeč nepodporuje nahrávání videa. Zkus Chrome, Firefox nebo Edge na desktopu.');
      return;
    }
    if (flythrough.isFlying) {
      toast.error('Nejdřív zastav probíhající průlet.');
      return;
    }
    const canvas = map.current.getCanvas();
    const overlay = mapContainer.current;
    if (!overlay) return;
    const ok = recorder.startRecording(canvas, overlay, 25);
    if (!ok) {
      toast.error('Nahrávání se nepodařilo spustit.');
      return;
    }
    isRecordingRef.current = true;
    toast.info('Nahrávám průlet — nepřepínej záložku!', { duration: 4000 });
    // krátká prodleva, ať recorder dostane první frame
    setTimeout(() => flythrough.startFlythrough(), 200);
  }, [recorder, flythrough]);

  const handleStopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (flythrough.isFlying) {
      flythrough.stopFlythrough('stopped');
    } else {
      recorder.stopRecording();
      setTimeout(() => setVideoDialogOpen(true), 300);
    }
  }, [flythrough, recorder]);

  // Notify parent o stavu průletu (pro PhotoTimeEditor)
  useEffect(() => {
    if (!onFlyStateChange) return;
    onFlyStateChange({
      isFlying: flythrough.isFlying,
      flyDurationSec: flythrough.flyDurationSec,
      flyStartTimestamp: flythrough.flyStartTimestamp,
    });
  }, [flythrough.isFlying, flythrough.flyDurationSec, flythrough.flyStartTimestamp, onFlyStateChange]);
  const elevationData = useElevationData(
    gpxData, currentPosition,
    flythrough.flyingIndex,
    flythrough.elevationExaggeration,
  );

  // Map initialization
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'cyclosm-tiles': {
            type: 'raster',
            tiles: [
              'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
              'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
              'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© CycloOSM contributors',
          },
          'terrain-dem': {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 15,
            encoding: 'terrarium',
          },
        },
        layers: [
          {
            id: 'cyclosm-layer',
            type: 'raster',
            source: 'cyclosm-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
        terrain: {
          source: 'terrain-dem',
          exaggeration: 1.5,
        },
      },
      zoom: 10,
      center: [14.4, 50.1],
      maxPitch: 85,
      // @ts-expect-error — supported by maplibre-gl at runtime; needed for canvas captureStream
      preserveDrawingBuffer: true,
    });

    map.current.addControl(
      new NavigationControl({ visualizePitch: true }),
      'top-right',
    );

    return () => {
      map.current?.remove();
    };
  }, []);

  // Trail layer rendering
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: track.points.map((point) => [point.lon, point.lat]),
          },
        },
      ],
    };

    const ensureTrailLayers = () => {
      if (!map.current) return;

      if (map.current.getLayer('trail-glow')) map.current.removeLayer('trail-glow');
      if (map.current.getLayer('trail-line')) map.current.removeLayer('trail-line');
      if (map.current.getSource('trail')) map.current.removeSource('trail');

      map.current.addSource('trail', { type: 'geojson', data: geojson });

      map.current.addLayer({
        id: 'trail-glow',
        type: 'line',
        source: 'trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#059669', 'line-width': 8, 'line-opacity': 0.3, 'line-blur': 2 },
      });

      map.current.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#059669', 'line-width': 4, 'line-opacity': 0.8 },
      });

      const bounds = new LngLatBounds();
      track.points.forEach((point) => bounds.extend([point.lon, point.lat]));
      map.current.fitBounds(bounds, { padding: 50 });
    };

    if (map.current.isStyleLoaded()) {
      ensureTrailLayers();
      return;
    }

    map.current.once('load', ensureTrailLayers);
  }, [gpxData]);

  // Slider position marker
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    const pointIndex = Math.floor((currentPosition / 100) * (track.points.length - 1));
    const point = track.points[pointIndex];

    if (!point) return;

    if (markerRef.current) {
      markerRef.current.remove();
    }

    const markerElement = document.createElement('div');
    markerElement.className = 'w-3 h-3 bg-trail-active rounded-full shadow-lg';

    markerRef.current = new Marker(markerElement)
      .setLngLat([point.lon, point.lat])
      .addTo(map.current);
  }, [currentPosition, gpxData]);

  // POI markers — render helper using current limit
  const renderPoiMarkers = React.useCallback((pois: import('@/utils/overpassApi').POIPoint[]) => {
    if (!map.current) return;

    // Split into peaks and places
    const peaks = pois.filter(p => p.type === 'peak');
    const places = pois.filter(p => p.type !== 'peak');

    // Sort peaks by elevation desc
    peaks.sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0));

    // Sort places by importance (city > town > village > hamlet)
    const placeRank: Record<string, number> = { city: 0, town: 1, village: 2, hamlet: 3 };
    places.sort((a, b) =>
      (placeRank[a.placeType ?? 'hamlet'] ?? 9) - (placeRank[b.placeType ?? 'hamlet'] ?? 9)
    );

    // Peaks: auto = top N by elevation; manual = explicit selection
    const limitedPeaks = peakSelectionMode === 'manual'
      ? peaks.filter(p => selectedPeakKeys.has(peakKey(p)))
      : peaks.slice(0, peakLimit);

    const limited = [...limitedPeaks, ...places.slice(0, placeLimit)];

    poiMarkersRef.current.forEach(m => m.remove());
    poiMarkersRef.current = [];

    limited.forEach(poi => {
      const el = document.createElement('div');
      el.style.display = 'flex';
      el.style.flexDirection = 'column';
      el.style.alignItems = 'center';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '5';

      if (poi.type === 'peak') {
        el.innerHTML = `
          <div style="
            background: rgba(255,255,255,0.97);
            border: 2px solid #b45309;
            border-radius: 8px;
            padding: 3px 8px;
            font-size: 12px;
            font-weight: 700;
            color: #78350f;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            gap: 4px;
            pointer-events: auto;
          ">
            <span style="font-size:16px;line-height:1;">⛰️</span>
            ${poi.name}${poi.ele ? ` ${poi.ele}\u202Fm` : ''}
          </div>
          <div style="width: 2px; height: 28px; background: linear-gradient(to bottom, #b45309, #78350f);"></div>
          <div style="width: 8px; height: 8px; border-radius: 50%; background: #78350f; box-shadow: 0 1px 3px rgba(0,0,0,0.4);"></div>
        `;
      } else {
        el.innerHTML = `
          <div style="
            background: rgba(255,255,255,0.95);
            border: 1px solid #6b7280;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 11px;
            font-weight: 500;
            color: #374151;
            white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2);
            pointer-events: auto;
          ">
            ${poi.name}
          </div>
          <div style="width: 1.5px; height: 12px; background: #6b7280; opacity: 0.7;"></div>
          <div style="width: 4px; height: 4px; border-radius: 50%; background: #6b7280;"></div>
        `;
      }

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([poi.lon, poi.lat])
        .addTo(map.current!);

      poiMarkersRef.current.push(marker);
    });
  }, [peakLimit, placeLimit, peakSelectionMode, selectedPeakKeys]);

  // POI fetch — extrahováno, aby šlo zavolat i ručně přes tlačítko reload
  const poiCancelRef = useRef<{ cancelled: boolean } | null>(null);
  const cachedPoisRef = useRef(cachedPois);
  useEffect(() => { cachedPoisRef.current = cachedPois; }, [cachedPois]);
  // Stabilní reference na render & callback, aby loadPOIs neměl měnící se deps
  const renderPoiMarkersRef = useRef(renderPoiMarkers);
  useEffect(() => { renderPoiMarkersRef.current = renderPoiMarkers; }, [renderPoiMarkers]);
  const onPoisFetchedRef = useRef(onPoisFetched);
  useEffect(() => { onPoisFetchedRef.current = onPoisFetched; }, [onPoisFetched]);

  const loadPOIs = useCallback(async (forceRefresh = false) => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;
    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    // zruš případný předchozí běh
    if (poiCancelRef.current) poiCancelRef.current.cancelled = true;
    const token = { cancelled: false };
    poiCancelRef.current = token;

    // Pokud máme cache z DB a nejde o vynucené obnovení, použij ji a vůbec nevolat Overpass
    const cached = cachedPoisRef.current;
    if (!forceRefresh && cached && cached.length > 0) {
      const nearbyPois = cached;
      allNearbyPoisRef.current = nearbyPois;
      const peakList = nearbyPois.filter(p => p.type === 'peak');
      const placeList = nearbyPois.filter(p => p.type === 'place');
      setPoiCounts({ peaks: peakList.length, places: placeList.length, raw: nearbyPois.length, filtered: nearbyPois.length });
      setPoiStatus('success');

      if (!hasInitialPoiRef.current) {
        const sortedPeaks = [...peakList].sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0));
        setSelectedPeakKeys(new Set(sortedPeaks.slice(0, 25).map(peakKey)));
        setPeakSelectionMode('auto');
      }
      hasInitialPoiRef.current = false;
      renderPoiMarkersRef.current(nearbyPois);
      return;
    }

    setPoiStatus('loading');
    setPoiError(null);
    try {
      const pois = await fetchPeaksAndPlaces(gpxData.bounds);
      if (token.cancelled || !map.current) return;

      const nearbyPois = filterPOIsNearTrack(pois, track.points, 2);
      allNearbyPoisRef.current = nearbyPois;

      const peakList = nearbyPois.filter(p => p.type === 'peak');
      const placeList = nearbyPois.filter(p => p.type === 'place');
      setPoiCounts({ peaks: peakList.length, places: placeList.length, raw: pois.length, filtered: nearbyPois.length });
      setPoiStatus('success');

      if (!hasInitialPoiRef.current) {
        const sortedPeaks = [...peakList].sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0));
        setSelectedPeakKeys(new Set(sortedPeaks.slice(0, 25).map(peakKey)));
        setPeakSelectionMode('auto');
      }
      hasInitialPoiRef.current = false;

      renderPoiMarkersRef.current(nearbyPois);
      // Předat rodiči k uložení do DB (vlastník)
      onPoisFetchedRef.current?.(nearbyPois);
    } catch (err) {
      if (token.cancelled) return;
      setPoiStatus('error');
      setPoiError(err instanceof Error ? err.message : 'Neznámá chyba');
    }
  }, [gpxData]);

  // POI fetch — only on gpx change
  useEffect(() => {
    if (!map.current || !gpxData) return;

    const run = () => loadPOIs(false);
    if (map.current.isStyleLoaded()) {
      run();
    } else {
      map.current.once('load', run);
    }

    return () => {
      if (poiCancelRef.current) poiCancelRef.current.cancelled = true;
      poiMarkersRef.current.forEach(m => m.remove());
      poiMarkersRef.current = [];
    };
  }, [gpxData, loadPOIs]);

  // Re-render markers when limits change (without re-fetching)
  useEffect(() => {
    if (allNearbyPoisRef.current.length > 0) {
      renderPoiMarkers(allNearbyPoisRef.current);
    }
  }, [peakLimit, placeLimit, peakSelectionMode, selectedPeakKeys, renderPoiMarkers]);


  // Click-to-pick custom peak coords
  useEffect(() => {
    if (!map.current || !pickingPeakOnMap) return;
    const m = map.current;
    const canvas = m.getCanvas();
    canvas.style.cursor = 'crosshair';

    const handleClick = (e: MapMouseEvent) => {
      setCustomPeakLat(e.lngLat.lat.toFixed(6));
      setCustomPeakLon(e.lngLat.lng.toFixed(6));
      setPickingPeakOnMap(false);
    };

    m.on('click', handleClick);
    return () => {
      m.off('click', handleClick);
      canvas.style.cursor = '';
    };
  }, [pickingPeakOnMap]);

  const addCustomPeak = useCallback(() => {
    setCustomPeakError(null);
    const name = customPeakName.trim();
    const lat = parseFloat(customPeakLat);
    const lon = parseFloat(customPeakLon);
    const eleNum = customPeakEle.trim() ? parseFloat(customPeakEle) : undefined;

    if (!name) { setCustomPeakError('Zadej název vrcholu'); return; }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) { setCustomPeakError('Neplatná zeměpisná šířka'); return; }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) { setCustomPeakError('Neplatná zeměpisná délka'); return; }
    if (eleNum !== undefined && !Number.isFinite(eleNum)) { setCustomPeakError('Neplatná nadmořská výška'); return; }

    const newPeak: import('@/utils/overpassApi').POIPoint = {
      name,
      lat,
      lon,
      ele: eleNum !== undefined ? Math.round(eleNum) : undefined,
      type: 'peak',
    };
    const k = `${newPeak.name}@${newPeak.lat.toFixed(5)},${newPeak.lon.toFixed(5)}`;

    // Přidat do seznamu (vyhnout se duplicitě podle key)
    const exists = allNearbyPoisRef.current.some(p => p.type === 'peak' && `${p.name}@${p.lat.toFixed(5)},${p.lon.toFixed(5)}` === k);
    const updated = exists ? allNearbyPoisRef.current : [...allNearbyPoisRef.current, newPeak];
    allNearbyPoisRef.current = updated;

    // Aktualizovat čítače a vybrat ho
    const peakList = updated.filter(p => p.type === 'peak');
    const placeList = updated.filter(p => p.type === 'place');
    setPoiCounts({ peaks: peakList.length, places: placeList.length, raw: updated.length, filtered: updated.length });
    setSelectedPeakKeys(prev => {
      const next = new Set(prev);
      next.add(k);
      return next;
    });
    setPeakSelectionMode('manual');
    setPoiVersion(v => v + 1);

    // Persist do DB cache (vlastník)
    onPoisFetched?.(updated);

    // Reset formuláře
    setCustomPeakName('');
    setCustomPeakEle('');
    setCustomPeakLat('');
    setCustomPeakLon('');
  }, [customPeakName, customPeakEle, customPeakLat, customPeakLon, onPoisFetched]);


  return (
    <>
      <div className={presentationMode
        ? "fixed inset-0 z-[100] bg-background overflow-hidden"
        : "relative w-full rounded-lg overflow-hidden shadow-lg"}>
        {/* Main map container */}
        <div className={`relative w-full ${presentationMode ? 'h-screen' : 'h-[500px]'}`}>
          <div ref={mapContainer} className="absolute inset-0" />

          {/* Elevation chart overlay */}
          {gpxData && (
            <div className={`absolute z-10 pointer-events-none ${presentationMode ? 'bottom-4 left-4 right-4' : 'bottom-2 left-2 right-2'}`}>
              <div className="pointer-events-auto">
                <ElevationChart
                  chartData={elevationData.chartData}
                  currentChartPoint={elevationData.currentChartPoint}
                  variant="overlay"
                />
              </div>
            </div>
          )}

          {/* Fullscreen / Presentation toggle */}
          {gpxData && (
            <div className="absolute top-2 right-2 z-20">
              <Button
                size="sm"
                variant="secondary"
                className="gap-2 shadow-md"
                onClick={() => setPresentationMode((v) => !v)}
                title={presentationMode ? 'Ukončit prezentaci (Esc)' : 'Prezentační mód'}
              >
                {presentationMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {presentationMode ? 'Ukončit' : 'Prezentace'}
              </Button>
            </div>
          )}

          {/* Presentation-mode controls: start flythrough + record */}
          {presentationMode && gpxData && (
            <div className="absolute top-2 left-2 z-20 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-2 shadow-md"
                onClick={() => flythrough.isFlying ? flythrough.stopFlythrough('stopped') : flythrough.startFlythrough()}
              >
                {flythrough.isFlying ? (
                  <><Square className="w-4 h-4" /> Zastavit průlet</>
                ) : (
                  <><Play className="w-4 h-4" /> Spustit průlet</>
                )}
              </Button>
              <Button
                size="sm"
                variant={recorder.isRecording ? 'destructive' : 'secondary'}
                className="gap-2 shadow-md"
                onClick={recorder.isRecording ? handleStopRecording : handleStartRecording}
                disabled={!recorder.isSupported && !recorder.isRecording}
                title={recorder.isSupported ? 'Nahrát celý prezentační pohled' : 'Prohlížeč nepodporuje nahrávání'}
              >
                {recorder.isRecording ? (
                  <><CircleDot className="w-4 h-4 text-red-200 animate-pulse" /> Nahrávám…</>
                ) : (
                  <><Video className="w-4 h-4" /> Nahrát</>
                )}
              </Button>
            </div>
          )}
          {pickingPeakOnMap && !readOnly && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm font-medium animate-fade-in">
              <Crosshair className="w-4 h-4" />
              Klikni na mapu pro výběr vrcholu
              <button
                onClick={() => setPickingPeakOnMap(false)}
                className="ml-2 hover:opacity-70"
                aria-label="Zrušit"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* POI debug — diskrétní ikona, klik rozbalí detail */}
          {gpxData && poiStatus !== 'idle' && (
            <div className="absolute bottom-2 left-2 z-10">
              <button
                type="button"
                onClick={() => setPoiPanelExpanded((v) => !v)}
                className="w-7 h-7 rounded-full bg-background/80 hover:bg-background border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="POI debug info"
                title="POI debug info"
              >
                {poiStatus === 'error' ? (
                  <span className="text-destructive text-xs">⚠️</span>
                ) : (
                  <Bug className="w-3.5 h-3.5" />
                )}
              </button>
              {poiPanelExpanded && (
                <div className="absolute bottom-9 left-0 bg-background/95 backdrop-blur-sm border rounded-md shadow-md text-xs px-3 py-2 space-y-1 min-w-[180px]">
                  {poiStatus === 'loading' && (
                    <div className="text-muted-foreground">🔄 Načítám POI…</div>
                  )}
                  {poiStatus === 'success' && (
                    <>
                      <div className="font-medium">⛰️ {poiCounts.peaks} · 🏘️ {poiCounts.places}</div>
                      <div className="text-muted-foreground">API vrátilo: <span className="text-foreground">{poiCounts.raw}</span></div>
                      <div className="text-muted-foreground">Po filtru 2 km: <span className="text-foreground">{poiCounts.filtered}</span></div>
                      {poiCounts.filtered === 0 && poiCounts.raw > 0 && (
                        <div className="text-destructive pt-1">Žádný POI není do 2 km od trasy</div>
                      )}
                      {poiCounts.raw === 0 && (
                        <div className="text-destructive pt-1">Overpass API nevrátilo nic</div>
                      )}
                    </>
                  )}
                  {poiStatus === 'error' && (
                    <div className="space-y-2 max-w-[220px]">
                      <div className="text-destructive break-words">
                        {poiError || 'Chyba načítání POI'}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 gap-1 text-xs"
                        onClick={() => loadPOIs(true)}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Načíst znovu
                      </Button>
                    </div>
                  )}
                  {poiStatus === 'success' && poiCounts.raw === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 gap-1 text-xs mt-1"
                      onClick={() => loadPOIs(true)}
                    >
                      <RefreshCw className="w-3 h-3" />
                      Zkusit znovu
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PiP náhled odebrán — fotka se otevírá přímo fullscreen modalem v okamžiku příjezdu */}
        </div>

        {/* 3D Controls */}
        {!presentationMode && (
        <div className="bg-muted/50 border-t p-4 space-y-3">
          {/* Pitch slider */}
          <div className="flex items-center gap-3">
            <Mountain className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-20">3D náklon</span>
            <Slider
              value={[flythrough.mapPitch]}
              onValueChange={(value) => flythrough.setMapPitch(value[0])}
              min={0}
              max={85}
              step={1}
              className="flex-1"
              disabled={flythrough.isFlying}
            />
            <span className="text-xs text-muted-foreground w-10 text-right">{flythrough.mapPitch}°</span>
          </div>

          {/* POI density — peaks (hory) */}
          {gpxData && poiCounts.peaks > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Mountain className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Hory (POI)</span>
                {peakSelectionMode === 'auto' ? (
                  <Slider
                    value={[peakLimit]}
                    onValueChange={(value) => setPeakLimit(value[0])}
                    min={0}
                    max={Math.max(poiCounts.peaks, 5)}
                    step={1}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 text-xs text-muted-foreground">
                    Vybráno {[...selectedPeakKeys].filter(k =>
                      allNearbyPoisRef.current.some(p => p.type === 'peak' && peakKey(p) === k)
                    ).length} z {poiCounts.peaks}
                  </div>
                )}
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {peakSelectionMode === 'auto'
                    ? `${Math.min(peakLimit, poiCounts.peaks)}/${poiCounts.peaks}`
                    : `${[...selectedPeakKeys].filter(k => allNearbyPoisRef.current.some(p => p.type === 'peak' && peakKey(p) === k)).length}/${poiCounts.peaks}`}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-7">
                <Button
                  size="sm"
                  variant={peakSelectionMode === 'auto' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setPeakSelectionMode('auto')}
                >
                  Auto (top N)
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant={peakSelectionMode === 'manual' ? 'default' : 'outline'}
                      className="h-7 text-xs gap-1"
                      onClick={() => setPeakSelectionMode('manual')}
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      Vybrat vrcholy
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="p-2 border-b space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={peakSearch}
                          onChange={(e) => setPeakSearch(e.target.value)}
                          placeholder="Hledat vrchol…"
                          className="h-8 pl-7 text-xs"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs flex-1"
                          onClick={() => {
                            const allKeys = allNearbyPoisRef.current
                              .filter(p => p.type === 'peak')
                              .map(peakKey);
                            setSelectedPeakKeys(new Set(allKeys));
                          }}
                        >
                          Vybrat vše
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs flex-1"
                          onClick={() => setSelectedPeakKeys(new Set())}
                        >
                          Zrušit vše
                        </Button>
                      </div>
                    </div>
                    {/* Přidat vlastní vrchol */}
                    <div className="p-2 border-b space-y-1.5 bg-muted/30">
                      <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Přidat vlastní vrchol
                      </div>
                      <Input
                        value={customPeakName}
                        onChange={(e) => setCustomPeakName(e.target.value)}
                        placeholder="Název"
                        className="h-7 text-xs"
                      />
                      <div className="flex gap-1">
                        <Input
                          value={customPeakLat}
                          onChange={(e) => setCustomPeakLat(e.target.value)}
                          placeholder="Šířka"
                          className="h-7 text-xs flex-1"
                          inputMode="decimal"
                        />
                        <Input
                          value={customPeakLon}
                          onChange={(e) => setCustomPeakLon(e.target.value)}
                          placeholder="Délka"
                          className="h-7 text-xs flex-1"
                          inputMode="decimal"
                        />
                        <Input
                          value={customPeakEle}
                          onChange={(e) => setCustomPeakEle(e.target.value)}
                          placeholder="m n.m."
                          className="h-7 text-xs w-16"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={pickingPeakOnMap ? 'default' : 'outline'}
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={() => setPickingPeakOnMap((v) => !v)}
                        >
                          <Crosshair className="w-3 h-3" />
                          {pickingPeakOnMap ? 'Klikni na mapu…' : 'Vybrat na mapě'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs flex-1 gap-1"
                          onClick={addCustomPeak}
                        >
                          <Plus className="w-3 h-3" /> Přidat
                        </Button>
                      </div>
                      {customPeakError && (
                        <div className="text-[11px] text-destructive">{customPeakError}</div>
                      )}
                    </div>
                    <ScrollArea className="h-72">
                      <div className="p-1">
                        {allNearbyPoisRef.current
                          .filter(p => p.type === 'peak')
                          .filter(p => !peakSearch || p.name.toLowerCase().includes(peakSearch.toLowerCase()))
                          .sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0))
                          .map(p => {
                            const k = peakKey(p);
                            const checked = selectedPeakKeys.has(k);
                            return (
                              <label
                                key={k}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    setSelectedPeakKeys(prev => {
                                      const next = new Set(prev);
                                      if (v) next.add(k); else next.delete(k);
                                      return next;
                                    });
                                  }}
                                />
                                <span className="flex-1 truncate">{p.name}</span>
                                {p.ele && (
                                  <span className="text-muted-foreground tabular-nums">
                                    {p.ele}&nbsp;m
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        {allNearbyPoisRef.current.filter(p =>
                          p.type === 'peak' &&
                          (!peakSearch || p.name.toLowerCase().includes(peakSearch.toLowerCase()))
                        ).length === 0 && (
                          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                            Žádný vrchol neodpovídá
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* POI density — places (města) */}
          {gpxData && poiCounts.places > 0 && (
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground w-20">Města (POI)</span>
              <Slider
                value={[placeLimit]}
                onValueChange={(value) => setPlaceLimit(value[0])}
                min={0}
                max={Math.max(poiCounts.places, 5)}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.min(placeLimit, poiCounts.places)}/{poiCounts.places}
              </span>
            </div>
          )}

          {gpxData && (
            <>
              {/* Speed slider */}
              <div className="flex items-center gap-3">
                <Play className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Rychlost</span>
                <Slider
                  value={[flythrough.flySpeed]}
                  onValueChange={(value) => flythrough.setFlySpeed(value[0])}
                  min={1}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{flythrough.flySpeed}%</span>
              </div>

              {/* Rotation slider */}
              <div className="flex items-center gap-3">
                <RotateCcw className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Rotace</span>
                <Slider
                  value={[flythrough.flyRotation]}
                  onValueChange={(value) => flythrough.setFlyRotation(value[0])}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{flythrough.flyRotation}%</span>
              </div>

              {/* Zoom slider */}
              <div className="flex items-center gap-3">
                <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Zoom</span>
                <Slider
                  value={[flythrough.flyZoom]}
                  onValueChange={(value) => flythrough.setFlyZoom(value[0])}
                  min={10}
                  max={18}
                  step={0.5}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{flythrough.flyZoom}</span>
              </div>

              {/* Elevation exaggeration slider */}
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Zvýraznění</span>
                <Slider
                  value={[flythrough.elevationExaggeration]}
                  onValueChange={(value) => flythrough.setElevationExaggeration(value[0])}
                  min={1}
                  max={5}
                  step={0.1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{flythrough.elevationExaggeration}×</span>
              </div>

              {/* Flythrough button and grade indicator */}
              <div className="flex items-center justify-center gap-4 pt-2">
                <Button
                  size="sm"
                  variant={flythrough.isFlying ? 'destructive' : 'default'}
                  onClick={() => flythrough.isFlying ? flythrough.stopFlythrough() : flythrough.startFlythrough()}
                  className="gap-2"
                >
                  {flythrough.isFlying ? (
                    <>
                      <Square className="w-4 h-4" />
                      Zastavit průlet
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Spustit 3D průlet
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant={recorder.isRecording ? 'destructive' : 'outline'}
                  onClick={recorder.isRecording ? handleStopRecording : handleStartRecording}
                  className="gap-2"
                  disabled={!recorder.isSupported && !recorder.isRecording}
                  title={recorder.isSupported ? 'Nahraj průlet jako video pro sdílení' : 'Tvůj prohlížeč nepodporuje nahrávání'}
                >
                  {recorder.isRecording ? (
                    <>
                      <CircleDot className="w-4 h-4 text-red-200 animate-pulse" />
                      Nahrávám…
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4" />
                      Nahrát průlet
                    </>
                  )}
                </Button>

                {flythrough.isFlying && flythrough.currentGrade !== null && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-medium text-sm ${
                    flythrough.currentGrade > 2
                      ? 'bg-red-100 text-red-700'
                      : flythrough.currentGrade < -2
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}>
                    {flythrough.currentGrade > 1 ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : flythrough.currentGrade < -1 ? (
                      <ArrowDown className="w-4 h-4" />
                    ) : (
                      <Minus className="w-4 h-4" />
                    )}
                    <span>{flythrough.currentGrade > 0 ? '+' : ''}{flythrough.currentGrade}%</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        )}

      </div>

      <VideoPreviewDialog
        open={videoDialogOpen}
        onOpenChange={(o) => {
          setVideoDialogOpen(o);
          if (!o) recorder.clearRecorded();
        }}
        videoUrl={recorder.recorded?.url ?? null}
        videoBlob={recorder.recorded?.blob ?? null}
        extension={recorder.recorded?.extension ?? 'webm'}
      />
    </>
  );
};
