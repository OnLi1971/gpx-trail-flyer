import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, AnimationSettings } from '@/types/gpx';

import { ElevationChart } from './ElevationChart';
import { Mountain, Play, Square, RotateCcw, ZoomIn, TrendingUp, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Minus, MapPin, X, Bug, ListChecks, Search, RefreshCw, Plus, Crosshair, Video, CircleDot, Maximize2, Minimize2, Bike, PersonStanding, Car, Info, Loader2, Camera, Trash2 } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { fetchPeaksAndPlaces, fetchWaterwaysAlongTrack, filterPOIsNearTrack } from '@/utils/overpassApi';
import { fetchSurfaceStats, StatBucket } from '@/utils/trailStats';
import { useFlythrough } from '@/hooks/useFlythrough';
import { useElevationData } from '@/hooks/useElevationData';
import { useFlythroughRecorder } from '@/hooks/useFlythroughRecorder';
import { VideoPreviewDialog } from './VideoPreviewDialog';
import { TrailSummaryCard } from './TrailSummaryCard';
import { PhotoOverlay } from './PhotoOverlay';
import { PhotoUploadDialog } from './PhotoUploadDialog';
import { useTrailPhotos, type TrailPhoto } from '@/hooks/useTrailPhotos';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface PoiSettings {
  peakLimit: number;
  placeLimit: number;
  viewpointLimit: number;
  castleLimit: number;
  saddleLimit: number;
  pubLimit: number;
  riverLimit: number;
  peakSelectionMode: 'auto' | 'manual';
  selectedPeakKeys: string[];
  placeSelectionMode?: 'auto' | 'manual';
  selectedPlaceKeys?: string[];
  deselectedPoiKeys?: string[];
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
  /** ID uložené trasy (Supabase) — pokud je, povolí funkci fotek */
  trailId?: string | null;
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
  trailId = null,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const poiMarkersRef = useRef<Array<{ marker: Marker; lat: number; lon: number; type: string }>>([]);
  const photoMarkersRef = useRef<Array<{ id: string; marker: Marker }>>([]);

  // Photo feature state
  const canEditPhotos = !!trailId && !readOnly;
  const { photos, uploadPhoto, deletePhoto } = useTrailPhotos(trailId, canEditPhotos);
  const [photoMode, setPhotoMode] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{ lat: number; lon: number } | null>(null);
  const [activePhoto, setActivePhoto] = useState<TrailPhoto | null>(null);
  const [photoRadiusKm, setPhotoRadiusKm] = useState(0.5);
  const [photoDurationSec, setPhotoDurationSec] = useState(4);
  const triggeredPhotoIdsRef = useRef<Set<string>>(new Set());
  const activePhotoTimerRef = useRef<number | null>(null);
  const activePhotoIdRef = useRef<string | null>(null);

  // Basemap toggle: 3D terrain (OpenTopoMap, default) vs satellite (Esri)
  const [basemap, setBasemap] = useState<'terrain' | 'satellite' | 'cyclosm' | 'darkmatter'>('terrain');

  // POI debug state (visible on mobile)
  const [poiStatus, setPoiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [poiCounts, setPoiCounts] = useState({
    peaks: 0, places: 0, viewpoints: 0, castles: 0, saddles: 0, pubs: 0, rivers: 0,
    raw: 0, filtered: 0,
  });
  const [poiError, setPoiError] = useState<string | null>(null);
  const [poiPanelExpanded, setPoiPanelExpanded] = useState(false);

  // POI density — separate limits per category
  const [peakLimit, setPeakLimit] = useState(initialPoiSettings?.peakLimit ?? 10);
  const [placeLimit, setPlaceLimit] = useState(initialPoiSettings?.placeLimit ?? 66);
  const [viewpointLimit, setViewpointLimit] = useState(initialPoiSettings?.viewpointLimit ?? 0);
  const [castleLimit, setCastleLimit] = useState(initialPoiSettings?.castleLimit ?? 15);
  const [saddleLimit, setSaddleLimit] = useState(initialPoiSettings?.saddleLimit ?? 15);
  const [pubLimit, setPubLimit] = useState(initialPoiSettings?.pubLimit ?? 0);
  const [riverLimit, setRiverLimit] = useState(initialPoiSettings?.riverLimit ?? 5);
  // POI search radius around track (km)
  const [poiRadiusKm, setPoiRadiusKm] = useState<number>(3);
  // POI visibility distance from current position along track (km). 0 = vše viditelné.
  const [poiVisibilityKm, setPoiVisibilityKm] = useState<number>(10);
  // Závěrečný orbit — časování zmizení a postupného návratu POI
  const [outroHideDelayMs, setOutroHideDelayMs] = useState<number>(400);
  const [outroRevealMs, setOutroRevealMs] = useState<number>(5000);
  // Manual peak selection
  const [peakSelectionMode, setPeakSelectionMode] = useState<'auto' | 'manual'>(initialPoiSettings?.peakSelectionMode ?? 'auto');
  const [selectedPeakKeys, setSelectedPeakKeys] = useState<Set<string>>(
    new Set(initialPoiSettings?.selectedPeakKeys ?? [])
  );
  const [peakSearch, setPeakSearch] = useState('');
  // Manual place selection (města)
  const [placeSelectionMode, setPlaceSelectionMode] = useState<'auto' | 'manual'>(initialPoiSettings?.placeSelectionMode ?? 'auto');
  const [selectedPlaceKeys, setSelectedPlaceKeys] = useState<Set<string>>(
    new Set(initialPoiSettings?.selectedPlaceKeys ?? [])
  );
  const [placeSearch, setPlaceSearch] = useState('');
  // POI skryté kliknutím na mapě (klíče napříč všemi kategoriemi)
  const [deselectedPoiKeys, setDeselectedPoiKeys] = useState<Set<string>>(
    new Set(initialPoiSettings?.deselectedPoiKeys ?? [])
  );
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

  // Vzhled trasy
  const [trailColor, setTrailColor] = useState<string>('#059669');
  const [trailStyle, setTrailStyle] = useState<'solid' | 'dashed' | 'dotted'>('solid');
  const [trailWidth, setTrailWidth] = useState<number>(4);
  const [trailBehindOnly, setTrailBehindOnly] = useState<boolean>(true);
  const [showSummaryCard, setShowSummaryCard] = useState(false);
  const [surfaceData, setSurfaceData] = useState<StatBucket[] | null>(null);
  const [surfaceLoading, setSurfaceLoading] = useState(false);

  // Reset cached surface data when a new track is loaded
  useEffect(() => {
    setSurfaceData(null);
    setSurfaceLoading(false);
  }, [gpxData]);

  // Pokud initialPoiSettings dorazí asynchronně (po mountu), aplikuj je jednou
  const initialAppliedRef = useRef<boolean>(!!initialPoiSettings);
  useEffect(() => {
    if (initialAppliedRef.current) return;
    if (!initialPoiSettings) return;
    initialAppliedRef.current = true;
    hasInitialPoiRef.current = true;
    setPeakLimit(initialPoiSettings.peakLimit);
    setPlaceLimit(initialPoiSettings.placeLimit);
    setViewpointLimit(initialPoiSettings.viewpointLimit);
    setCastleLimit(initialPoiSettings.castleLimit);
    setSaddleLimit(initialPoiSettings.saddleLimit);
    setPubLimit(initialPoiSettings.pubLimit);
    setRiverLimit(initialPoiSettings.riverLimit ?? 5);
    setPeakSelectionMode(initialPoiSettings.peakSelectionMode);
    setSelectedPeakKeys(new Set(initialPoiSettings.selectedPeakKeys));
    setPlaceSelectionMode(initialPoiSettings.placeSelectionMode ?? 'auto');
    setSelectedPlaceKeys(new Set(initialPoiSettings.selectedPlaceKeys ?? []));
    setDeselectedPoiKeys(new Set(initialPoiSettings.deselectedPoiKeys ?? []));
  }, [initialPoiSettings]);

  // Emit POI settings to parent when they change
  useEffect(() => {
    if (!onPoiSettingsChange) return;
    onPoiSettingsChange({
      peakLimit,
      placeLimit,
      viewpointLimit,
      castleLimit,
      saddleLimit,
      pubLimit,
      riverLimit,
      peakSelectionMode,
      selectedPeakKeys: [...selectedPeakKeys],
      placeSelectionMode,
      selectedPlaceKeys: [...selectedPlaceKeys],
      deselectedPoiKeys: [...deselectedPoiKeys],
    });
  }, [peakLimit, placeLimit, viewpointLimit, castleLimit, saddleLimit, pubLimit, riverLimit, peakSelectionMode, selectedPeakKeys, placeSelectionMode, selectedPlaceKeys, deselectedPoiKeys, onPoiSettingsChange]);

  // Helper: stable key per POI (peak/place/…)
  const peakKey = (p: import('@/utils/overpassApi').POIPoint) =>
    `${p.name}@${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
  const placeKey = peakKey;

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

  const [outroMode, setOutroMode] = useState(false);
  // Progres "překreslení" trasy v závěrečném pohledu (počet bodů k zobrazení; null = plná trasa)
  const [outroDrawIndex, setOutroDrawIndex] = useState<number | null>(null);

  const flythrough = useFlythrough(map, gpxData, (reason) => {
    // Po dokončení průletu NEzapínáme outroMode — POI zůstanou viditelné během orbit pohledu
    // Pokud nahráváme, zastav nahrávání a otevři dialog s náhledem
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      recorder.stopRecording();
      setTimeout(() => setVideoDialogOpen(true), 300);
    }
  });

  // Zruš outro při novém startu průletu
  useEffect(() => {
    if (flythrough.isFlying && outroMode) setOutroMode(false);
  }, [flythrough.isFlying, outroMode]);

  // Po dokončení crossfade (~5s) ukaž štítky start/cíl; kartu zobrazí uživatel tlačítkem Info
  const [endpointsVisible, setEndpointsVisible] = useState(false);
  useEffect(() => {
    if (!flythrough.showSummary) {
      setShowSummaryCard(false);
      setEndpointsVisible(false);
      return;
    }
    const t = setTimeout(() => setEndpointsVisible(true), 5200);
    return () => clearTimeout(t);
  }, [flythrough.showSummary]);

  // Parser názvu trasy na start/cíl
  const endpointNames = useMemo(() => {
    const name = gpxData?.tracks[0]?.name?.trim();
    if (!name) return null;
    const seps = [' → ', ' -> ', ' — ', ' – ', ' - ', ' to '];
    for (const sep of seps) {
      const idx = name.indexOf(sep);
      if (idx > 0) {
        return { start: name.slice(0, idx).trim(), end: name.slice(idx + sep.length).trim() };
      }
    }
    return null;
  }, [gpxData]);

  // Vykresli štítky start/cíl pomocí maplibre Markers (sledují pozici)
  const startLabelMarkerRef = useRef<import('maplibre-gl').Marker | null>(null);
  const endLabelMarkerRef = useRef<import('maplibre-gl').Marker | null>(null);
  useEffect(() => {
    const cleanup = () => {
      startLabelMarkerRef.current?.remove();
      endLabelMarkerRef.current?.remove();
      startLabelMarkerRef.current = null;
      endLabelMarkerRef.current = null;
    };
    if (!endpointsVisible || !endpointNames || !map.current || !gpxData) {
      cleanup();
      return;
    }
    const track = gpxData.tracks[0];
    const startPt = track.points[0];
    const endPt = track.points[track.points.length - 1];
    const makeEl = (label: string, kind: 'start' | 'end') => {
      const el = document.createElement('div');
      el.className = 'endpoint-label';
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;background:rgba(15,15,20,0.78);backdrop-filter:blur(6px);color:#fff;padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);">
          <span style="width:8px;height:8px;border-radius:50%;background:${kind === 'start' ? '#10b981' : '#ef4444'};box-shadow:0 0 0 3px ${kind === 'start' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'};"></span>
          <span>${label}</span>
        </div>`;
      el.style.opacity = '0';
      el.style.transition = 'opacity 600ms ease';
      requestAnimationFrame(() => { el.style.opacity = '1'; });
      return el;
    };
    import('maplibre-gl').then(({ Marker }) => {
      if (!map.current) return;
      startLabelMarkerRef.current = new Marker({ element: makeEl(endpointNames.start, 'start'), offset: [0, -14] })
        .setLngLat([startPt.lon, startPt.lat])
        .addTo(map.current);
      endLabelMarkerRef.current = new Marker({ element: makeEl(endpointNames.end, 'end'), offset: [0, -14] })
        .setLngLat([endPt.lon, endPt.lat])
        .addTo(map.current);
    });
    return cleanup;
  }, [endpointsVisible, endpointNames, gpxData]);


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

  useEffect(() => {
    if (!recorder.isRecording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleStopRecording();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recorder.isRecording, handleStopRecording]);

  const handleInfoClick = useCallback(async () => {
    if (!gpxData) return;
    if (surfaceData !== null) {
      setShowSummaryCard(true);
      return;
    }
    setSurfaceLoading(true);
    try {
      const track = gpxData.tracks[0];
      const pts = track.points.map((p) => ({ lat: p.lat, lon: p.lon }));
      const data = await fetchSurfaceStats(pts);
      setSurfaceData(data);
      setShowSummaryCard(true);
    } catch (err) {
      setSurfaceData([]);
      toast.error('Data o povrchu se nepodařilo načíst.');
      setShowSummaryCard(true);
    } finally {
      setSurfaceLoading(false);
    }
  }, [gpxData, surfaceData]);

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
          'terrain-tiles': {
            type: 'raster',
            tiles: [
              'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
              'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
              'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 17,
            attribution:
              'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
          },
          'satellite-tiles': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution:
              'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          },
          'cyclosm-tiles': {
            type: 'raster',
            tiles: [
              'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
              'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
              'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 20,
            attribution:
              '© OpenStreetMap contributors, © CyclOSM',
          },
          'darkmatter-tiles': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 20,
            attribution:
              '© OpenStreetMap contributors, © CARTO',
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
            id: 'terrain-layer',
            type: 'raster',
            source: 'terrain-tiles',
            minzoom: 0,
            maxzoom: 19,
          },
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite-tiles',
            minzoom: 0,
            maxzoom: 19,
            layout: { visibility: 'none' },
          },
          {
            id: 'cyclosm-layer',
            type: 'raster',
            source: 'cyclosm-tiles',
            minzoom: 0,
            maxzoom: 20,
            layout: { visibility: 'none' },
          },
          {
            id: 'darkmatter-layer',
            type: 'raster',
            source: 'darkmatter-tiles',
            minzoom: 0,
            maxzoom: 20,
            layout: { visibility: 'none' },
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
      'bottom-right',
    );

    return () => {
      map.current?.remove();
    };
  }, []);

  // Toggle basemap layer visibility
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (!m.getLayer('terrain-layer') || !m.getLayer('satellite-layer') || !m.getLayer('cyclosm-layer')) return;
      m.setLayoutProperty('terrain-layer', 'visibility', basemap === 'terrain' ? 'visible' : 'none');
      m.setLayoutProperty('satellite-layer', 'visibility', basemap === 'satellite' ? 'visible' : 'none');
      m.setLayoutProperty('cyclosm-layer', 'visibility', basemap === 'cyclosm' ? 'visible' : 'none');
      m.setLayoutProperty('darkmatter-layer', 'visibility', basemap === 'darkmatter' ? 'visible' : 'none');
    };
    if (m.isStyleLoaded()) apply();
    else m.once('load', apply);
  }, [basemap]);
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

      const dash =
        trailStyle === 'dashed' ? [2, 2] :
        trailStyle === 'dotted' ? [0.1, 2] :
        undefined;

      map.current.addLayer({
        id: 'trail-glow',
        type: 'line',
        source: 'trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': trailColor, 'line-width': trailWidth * 2, 'line-opacity': 0.3, 'line-blur': 2 },
      });

      map.current.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        layout: { 'line-join': 'round', 'line-cap': trailStyle === 'dotted' ? 'round' : 'round' },
        paint: {
          'line-color': trailColor,
          'line-width': trailWidth,
          'line-opacity': 0.9,
          ...(dash ? { 'line-dasharray': dash } : {}),
        },
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

  // Apply trail appearance (color / width / dash style) when state changes
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (!m.getLayer('trail-line') || !m.getLayer('trail-glow')) return;
      m.setPaintProperty('trail-glow', 'line-color', trailColor);
      m.setPaintProperty('trail-glow', 'line-width', trailWidth * 2);
      m.setPaintProperty('trail-line', 'line-color', trailColor);
      m.setPaintProperty('trail-line', 'line-width', trailWidth);
      const dash =
        trailStyle === 'dashed' ? [2, 2] :
        trailStyle === 'dotted' ? [0.1, 2] :
        null;
      // null odstraní dasharray (plná čára)
      m.setPaintProperty('trail-line', 'line-dasharray', dash as any);
    };
    if (m.isStyleLoaded()) apply();
    else m.once('idle', apply);
  }, [trailColor, trailStyle, trailWidth, gpxData]);

  // Pokud je zapnuto „Stopa za jezdcem", zobrazujeme jen body do aktuálního flyingIndex.
  useEffect(() => {
    const m = map.current;
    if (!m || !gpxData || gpxData.tracks.length === 0) return;
    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    const apply = () => {
      const src = m.getSource('trail') as any;
      if (!src || !src.setData) return;

      const showBehind =
        trailBehindOnly && flythrough.isFlying && !outroMode && flythrough.flyingIndex != null;

      const inOutroDraw = flythrough.showSummary && outroDrawIndex != null;

      let coords: number[][];
      if (inOutroDraw) {
        const endIdx = Math.max(0, Math.min(track.points.length, outroDrawIndex!));
        coords = track.points.slice(0, endIdx).map((p) => [p.lon, p.lat]);
      } else if (showBehind) {
        const idx = flythrough.flyingIndex ?? 0;
        if (flythrough.flyDirection === 'reverse') {
          coords = track.points.slice(idx).map((p) => [p.lon, p.lat]);
        } else {
          coords = track.points.slice(0, idx + 1).map((p) => [p.lon, p.lat]);
        }
      } else {
        coords = track.points.map((p) => [p.lon, p.lat]);
      }

      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          },
        ],
      });
    };

    if (m.isStyleLoaded()) apply();
    else m.once('idle', apply);
  }, [trailBehindOnly, flythrough.isFlying, flythrough.flyingIndex, flythrough.flyDirection, flythrough.showSummary, outroMode, outroDrawIndex, gpxData]);

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

  // Skryj POI dál než poiVisibilityKm od aktuální pozice na trase (0 = vypnuto, ukaž vše)
  // V závěrečném 3D orbitu POI postupně fade-in podle úhlu kamery (sekvenční odhalování).
  useEffect(() => {
    if (flythrough.showSummary || outroMode) {
      // V závěru schovej všechny POI markery
      poiMarkersRef.current.forEach(({ marker }) => {
        const el = marker.getElement();
        el.style.transition = '';
        el.style.opacity = '';
        el.style.transform = '';
        el.style.display = 'none';
      });
      return;
    }
    if (!gpxData || gpxData.tracks.length === 0) return;
    const track = gpxData.tracks[0];
    const pointIndex = flythrough.flyingIndex != null
      ? flythrough.flyingIndex
      : Math.floor((currentPosition / 100) * (track.points.length - 1));
    const cur = track.points[pointIndex];
    if (!cur) return;
    const cosLat = Math.cos((cur.lat * Math.PI) / 180);
    const maxKm = poiVisibilityKm;
    poiMarkersRef.current.forEach(({ marker, lat, lon }) => {
      const el = marker.getElement();
      // Reset orbitálních stylů, kdyby zbyly z předchozího orbitu
      el.style.opacity = '';
      el.style.transform = '';
      el.style.transition = '';
      if (maxKm <= 0) {
        el.style.display = '';
        return;
      }
      const dLat = (lat - cur.lat) * 111;
      const dLon = (lon - cur.lon) * 111 * cosLat;
      const distKm = Math.sqrt(dLat * dLat + dLon * dLon);
      el.style.display = distKm <= maxKm ? '' : 'none';
    });
  }, [currentPosition, flythrough.flyingIndex, flythrough.showSummary, gpxData, poiVisibilityKm, poiVersion, outroMode]);

  // Závěr: den→noc fade overlay + světýlka u měst/vesnic + crossfade basemap
  useEffect(() => {
    if (!flythrough.showSummary || !map.current) return;
    const m = map.current;

    // Crossfade basemap: v závěru vždy přejít na satelit ("skleněná" mapa)
    const fromLayer = `${basemap}-layer`;
    const toLayer = 'satellite-layer';
    if (fromLayer === toLayer) return;
    let rafId: number | null = null;
    if (m.getLayer(toLayer) && m.getLayer(fromLayer)) {
      try {
        m.setLayoutProperty(toLayer, 'visibility', 'visible');
        m.setPaintProperty(toLayer, 'raster-opacity', 0);
        m.setPaintProperty(fromLayer, 'raster-opacity', 1);
      } catch {}
      const duration = 5000;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = t * t * (3 - 2 * t);
        try {
          m.setPaintProperty(toLayer, 'raster-opacity', eased);
          m.setPaintProperty(fromLayer, 'raster-opacity', 1 - eased);
        } catch {}
        if (t < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      // Obnov původní stav basemap vrstev
      try {
        ['terrain-layer', 'satellite-layer', 'cyclosm-layer', 'darkmatter-layer'].forEach((id) => {
          if (!m.getLayer(id)) return;
          m.setPaintProperty(id, 'raster-opacity', 1);
          m.setLayoutProperty(id, 'visibility', basemap === id.replace('-layer', '') ? 'visible' : 'none');
        });
      } catch {}
    };
  }, [flythrough.showSummary, basemap]);

  // Závěr: po dokončení crossfade překresli trasu od začátku do konce za 4 s
  useEffect(() => {
    if (!flythrough.showSummary || !gpxData || gpxData.tracks.length === 0) {
      setOutroDrawIndex(null);
      return;
    }
    const track = gpxData.tracks[0];
    const total = track.points.length;
    if (total < 2) return;

    // Začni "schovanou" trasou hned, kresli až po crossfade
    setOutroDrawIndex(0);
    const delayMs = 5200; // doběhne crossfade basemapy
    const durationMs = 4000;
    let raf: number | null = null;
    let startTime = 0;
    const tick = (now: number) => {
      if (!startTime) startTime = now + delayMs;
      if (now < startTime) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = t * t * (3 - 2 * t);
      const idx = Math.max(1, Math.floor(eased * (total - 1)) + 1);
      setOutroDrawIndex(idx);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setOutroDrawIndex(null); // ponech plnou trasu (návrat k běžné logice)
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      setOutroDrawIndex(null);
    };
  }, [flythrough.showSummary, gpxData]);


  // POI markers — render helper using current limits per category
  const renderPoiMarkers = React.useCallback((pois: import('@/utils/overpassApi').POIPoint[]) => {
    if (!map.current) return;

    const peaks = pois.filter(p => p.type === 'peak');
    const places = pois.filter(p => p.type === 'place');
    const viewpoints = pois.filter(p => p.type === 'viewpoint');
    const castles = pois.filter(p => p.type === 'castle');
    const saddles = pois.filter(p => p.type === 'saddle');
    const pubs = pois.filter(p => p.type === 'pub');
    const rivers = pois.filter(p => p.type === 'river');

    // Sort peaks & saddles by elevation desc
    peaks.sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0));
    saddles.sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0));
    // Rozhledny (tower) první, pak vyhlídky
    viewpoints.sort((a, b) => {
      const av = a.viewpointKind === 'tower' ? 0 : 1;
      const bv = b.viewpointKind === 'tower' ? 0 : 1;
      return av - bv;
    });
    // Hrady před zříceninami
    const castleRank: Record<string, number> = { castle: 0, fort: 1, manor: 2, ruins: 3 };
    castles.sort((a, b) => (castleRank[a.castleKind ?? 'ruins'] ?? 9) - (castleRank[b.castleKind ?? 'ruins'] ?? 9));

    // Sort places by importance
    const placeRank: Record<string, number> = { city: 0, town: 1, village: 2, hamlet: 3 };
    places.sort((a, b) =>
      (placeRank[a.placeType ?? 'hamlet'] ?? 9) - (placeRank[b.placeType ?? 'hamlet'] ?? 9)
    );

    // Peaks: auto = top N by elevation; manual = explicit selection
    const limitedPeaks = peakSelectionMode === 'manual'
      ? peaks.filter(p => selectedPeakKeys.has(peakKey(p)))
      : peaks.slice(0, peakLimit);

    const limitedPlaces = placeSelectionMode === 'manual'
      ? places.filter(p => selectedPlaceKeys.has(placeKey(p)))
      : places.slice(0, placeLimit);

    const limitedRaw = [
      ...limitedPeaks,
      ...limitedPlaces,
      ...viewpoints.slice(0, viewpointLimit),
      ...castles.slice(0, castleLimit),
      ...saddles.slice(0, saddleLimit),
      ...pubs.slice(0, pubLimit),
      ...rivers.slice(0, riverLimit),
    ];
    // Skryj POI, které uživatel klikem odoznačil
    const limited = limitedRaw.filter(p => !deselectedPoiKeys.has(peakKey(p)));

    poiMarkersRef.current.forEach(m => m.marker.remove());
    poiMarkersRef.current = [];

    // Společný helper pro generování karty (tyčka se přidává zvlášť pod kartou)
    const buildCard = (opts: {
      icon: string;
      text: string;
      borderColor: string;
      textColor: string;
      bold?: boolean;
      smallDot?: boolean;
    }) => {
      const fontWeight = opts.bold ? 700 : 600;
      return `
        <div style="
          background: rgba(255,255,255,0.97);
          border: 2px solid ${opts.borderColor};
          border-radius: 8px;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: ${fontWeight};
          color: ${opts.textColor};
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          gap: 4px;
          pointer-events: auto;
        ">
          <span style="font-size:14px;line-height:1;">${opts.icon}</span>
          ${opts.text}
        </div>
      `;
    };

    limited.forEach(poi => {
      const el = document.createElement('div');
      el.style.display = 'flex';
      el.style.flexDirection = 'column';
      el.style.alignItems = 'center';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '5';

      switch (poi.type) {
        case 'peak':
          el.innerHTML = buildCard({
            icon: '⛰️',
            text: `${poi.name}${poi.ele ? ` ${poi.ele}\u202Fm` : ''}`,
            borderColor: '#b45309',
            textColor: '#78350f',
            bold: true,
          });
          break;
        case 'saddle':
          el.innerHTML = buildCard({
            icon: '⛰',
            text: `${poi.name}${poi.ele ? ` ${poi.ele}\u202Fm` : ''}`,
            borderColor: '#a16207',
            textColor: '#713f12',
          });
          break;
        case 'viewpoint':
          el.innerHTML = buildCard({
            icon: poi.viewpointKind === 'tower' ? '🗼' : '🔭',
            text: poi.name,
            borderColor: '#7c3aed',
            textColor: '#5b21b6',
            bold: true,
          });
          break;
        case 'castle':
          el.innerHTML = buildCard({
            icon: poi.castleKind === 'ruins' ? '🏚️' : '🏰',
            text: poi.name,
            borderColor: '#9f1239',
            textColor: '#881337',
            bold: true,
          });
          break;
        case 'pub':
          el.innerHTML = buildCard({
            icon: poi.pubKind === 'cafe' ? '☕' : (poi.pubKind === 'restaurant' ? '🍽️' : '🍺'),
            text: poi.name,
            borderColor: '#15803d',
            textColor: '#14532d',
            smallDot: true,
          });
          break;
        case 'river':
          el.innerHTML = buildCard({
            icon: poi.waterwayKind === 'stream' ? '〰️' : '🌊',
            text: poi.name,
            borderColor: '#0369a1',
            textColor: '#0c4a6e',
          });
          break;
        case 'place':
        default:
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
          `;
          break;
      }

      // Klik = skrýt tento POI (přidat klíč do deselected)
      const key = peakKey(poi);
      el.style.cursor = 'pointer';
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setDeselectedPoiKeys(prev => {
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      });

      // Centrální tyčka pod kartou
      const pin = document.createElement('div');
      pin.style.cssText = 'width:2px;height:14px;background:rgba(0,0,0,0.35);margin:0 auto;';
      el.appendChild(pin);
      const arrow = document.createElement('div');
      arrow.style.cssText = 'width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid rgba(0,0,0,0.45);margin:0 auto;';
      el.appendChild(arrow);

      const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, -10] })
        .setLngLat([poi.lon, poi.lat])
        .addTo(map.current!);

      poiMarkersRef.current.push({ marker, lat: poi.lat, lon: poi.lon, type: poi.type });
    });
  }, [peakLimit, placeLimit, viewpointLimit, castleLimit, saddleLimit, pubLimit, riverLimit, peakSelectionMode, selectedPeakKeys, placeSelectionMode, selectedPlaceKeys, deselectedPoiKeys]);

  // POI fetch — extrahováno, aby šlo zavolat i ručně přes tlačítko reload
  const poiCancelRef = useRef<{ cancelled: boolean } | null>(null);
  const cachedPoisRef = useRef(cachedPois);
  useEffect(() => { cachedPoisRef.current = cachedPois; }, [cachedPois]);
  // Stabilní reference na render & callback, aby loadPOIs neměl měnící se deps
  const renderPoiMarkersRef = useRef(renderPoiMarkers);
  useEffect(() => { renderPoiMarkersRef.current = renderPoiMarkers; }, [renderPoiMarkers]);
  const onPoisFetchedRef = useRef(onPoisFetched);
  useEffect(() => { onPoisFetchedRef.current = onPoisFetched; }, [onPoisFetched]);

  // Helper: spočítej kategorie POI
  const buildCounts = (nearby: import('@/utils/overpassApi').POIPoint[], rawTotal: number) => ({
    peaks: nearby.filter(p => p.type === 'peak').length,
    places: nearby.filter(p => p.type === 'place').length,
    viewpoints: nearby.filter(p => p.type === 'viewpoint').length,
    castles: nearby.filter(p => p.type === 'castle').length,
    saddles: nearby.filter(p => p.type === 'saddle').length,
    pubs: nearby.filter(p => p.type === 'pub').length,
    rivers: nearby.filter(p => p.type === 'river').length,
    raw: rawTotal,
    filtered: nearby.length,
  });

  const loadPOIs = useCallback(async (forceRefresh = false) => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;
    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    // zruš případný předchozí běh
    if (poiCancelRef.current) poiCancelRef.current.cancelled = true;
    const token = { cancelled: false };
    poiCancelRef.current = token;

    // Pokud máme cache z DB a nejde o vynucené obnovení, použij ji a vůbec nevolat Overpass.
    // ALE: pokud cache neobsahuje žádnou z novějších kategorií, je zastaralá → automaticky přetáhnout.
    const cached = cachedPoisRef.current;
    // Cache je platná, pokud obsahuje aspoň jednu z novějších kategorií (rozhledny, hrady, sedla, hospody).
    // Absenci řek NEbereme jako důvod k invalidaci — trasa řeky mít prostě nemusí.
    const cacheHasNewCategories = cached?.some(
      p => p.type === 'viewpoint' || p.type === 'castle' || p.type === 'saddle' || p.type === 'pub'
    ) ?? false;
    const cacheIsStale = cached && cached.length > 0 && !cacheHasNewCategories;
    if (!forceRefresh && cached && cached.length > 0 && !cacheIsStale) {
      const nearbyPois = cached;
      allNearbyPoisRef.current = nearbyPois;
      setPoiCounts(buildCounts(nearbyPois, nearbyPois.length));
      setPoiStatus('success');

      if (!hasInitialPoiRef.current) {
        const peakList = nearbyPois.filter(p => p.type === 'peak');
        const sortedPeaks = [...peakList].sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0));
        setSelectedPeakKeys(new Set(sortedPeaks.slice(0, 25).map(peakKey)));
        setPeakSelectionMode('auto');
        const placeList = nearbyPois.filter(p => p.type === 'place');
        const placeRankInit: Record<string, number> = { city: 0, town: 1, village: 2, hamlet: 3 };
        const sortedPlaces = [...placeList].sort((a, b) =>
          (placeRankInit[a.placeType ?? 'hamlet'] ?? 9) - (placeRankInit[b.placeType ?? 'hamlet'] ?? 9)
        );
        setSelectedPlaceKeys(new Set(sortedPlaces.slice(0, 15).map(placeKey)));
        setPlaceSelectionMode('auto');
      }
      hasInitialPoiRef.current = false;
      renderPoiMarkersRef.current(nearbyPois);
      return;
    }

    setPoiStatus('loading');
    setPoiError(null);
    try {
      const pois = await fetchPeaksAndPlaces(gpxData.bounds, poiRadiusKm);
      if (token.cancelled || !map.current) return;

      let nearbyPois = filterPOIsNearTrack(pois, track.points, poiRadiusKm);

      // Fallback pro řeky: široký bbox dotaz se může vrátit useknutý/pomalý a řeky v něm chybí.
      // Proto při nule dotáhneme vodní prvky zvlášť přímo podél GPX trasy.
      if (!nearbyPois.some(p => p.type === 'river')) {
        try {
          const waterways = await fetchWaterwaysAlongTrack(track.points);
          if (token.cancelled || !map.current) return;
          const nearbyWaterways = filterPOIsNearTrack(waterways, track.points, Math.max(0.5, poiRadiusKm));
          const existingRiverNames = new Set(nearbyPois.filter(p => p.type === 'river').map(p => p.name.toLowerCase()));
          nearbyPois = [
            ...nearbyPois,
            ...nearbyWaterways.filter(p => !existingRiverNames.has(p.name.toLowerCase())),
          ];
        } catch (riverErr) {
          console.warn('[POI] waterway fallback failed', riverErr);
        }
      }
      allNearbyPoisRef.current = nearbyPois;

      setPoiCounts(buildCounts(nearbyPois, pois.length));
      setPoiStatus('success');

      if (!hasInitialPoiRef.current) {
        const peakList = nearbyPois.filter(p => p.type === 'peak');
        const sortedPeaks = [...peakList].sort((a, b) => (b.ele ?? 0) - (a.ele ?? 0));
        setSelectedPeakKeys(new Set(sortedPeaks.slice(0, 25).map(peakKey)));
        setPeakSelectionMode('auto');
        const placeList = nearbyPois.filter(p => p.type === 'place');
        const placeRankInit: Record<string, number> = { city: 0, town: 1, village: 2, hamlet: 3 };
        const sortedPlaces = [...placeList].sort((a, b) =>
          (placeRankInit[a.placeType ?? 'hamlet'] ?? 9) - (placeRankInit[b.placeType ?? 'hamlet'] ?? 9)
        );
        setSelectedPlaceKeys(new Set(sortedPlaces.slice(0, 15).map(placeKey)));
        setPlaceSelectionMode('auto');
      }
      hasInitialPoiRef.current = false;

      renderPoiMarkersRef.current(nearbyPois);
      // Předat rodiči k uložení do DB (vlastník)
      onPoisFetchedRef.current?.(nearbyPois);
    } catch (err) {
      if (token.cancelled) return;
      console.error('[POI] fetch failed', err);
      setPoiStatus('error');
      setPoiError(err instanceof Error ? err.message : 'Neznámá chyba');
    }
  }, [gpxData, poiRadiusKm]);

  // POI fetch — on gpx change. Robust k tomu, jestli už style mapy stihl naloadovat.
  useEffect(() => {
    if (!gpxData) return;
    let disposed = false;

    const tryRun = (attempt = 0) => {
      if (disposed) return;
      const m = map.current;
      if (!m) {
        if (attempt < 50) setTimeout(() => tryRun(attempt + 1), 100);
        return;
      }
      if (m.isStyleLoaded?.() || (m as any).loaded?.()) {
        loadPOIs(false);
      } else {
        const onReady = () => { m.off('load', onReady); m.off('idle', onReady); if (!disposed) loadPOIs(false); };
        m.once('load', onReady);
        m.once('idle', onReady);
        // pojistka — kdyby ani 'load' ani 'idle' nepřišly
        setTimeout(() => { if (!disposed) loadPOIs(false); }, 1500);
      }
    };

    tryRun();

    return () => {
      disposed = true;
      if (poiCancelRef.current) poiCancelRef.current.cancelled = true;
      poiMarkersRef.current.forEach(m => m.marker.remove());
      poiMarkersRef.current = [];
    };
  }, [gpxData, loadPOIs]);

  // Refetch when search radius changes (skip first mount)
  const radiusInitRef = useRef(true);
  useEffect(() => {
    if (radiusInitRef.current) {
      radiusInitRef.current = false;
      return;
    }
    if (!gpxData) return;
    loadPOIs(true);
  }, [poiRadiusKm]);

  // Re-render markers when limits change (without re-fetching)
  useEffect(() => {
    if (allNearbyPoisRef.current.length > 0) {
      renderPoiMarkers(allNearbyPoisRef.current);
    }
  }, [peakLimit, placeLimit, viewpointLimit, castleLimit, saddleLimit, pubLimit, riverLimit, peakSelectionMode, selectedPeakKeys, placeSelectionMode, selectedPlaceKeys, renderPoiMarkers]);


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

  // --- PHOTO FEATURE ---------------------------------------------------

  // Click-to-add photo (photoMode)
  useEffect(() => {
    if (!map.current || !photoMode || !canEditPhotos) return;
    const m = map.current;
    const canvas = m.getCanvas();
    canvas.style.cursor = 'crosshair';
    const handle = (e: MapMouseEvent) => {
      setPendingPhoto({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      setPhotoMode(false);
    };
    m.on('click', handle);
    return () => { m.off('click', handle); canvas.style.cursor = ''; };
  }, [photoMode, canEditPhotos]);

  // Render persistent photo markers on the map — polaroid card on top of a pole (like POIs)
  useEffect(() => {
    if (!map.current) return;
    // Cleanup previous
    photoMarkersRef.current.forEach(({ marker }) => marker.remove());
    photoMarkersRef.current = [];

    // V závěru (summary/outro) je necháme skryté – řídí to POI-visibility efekt níž
    if (flythrough.showSummary || outroMode) return;

    photos.forEach((ph) => {
      const el = document.createElement('div');
      // NOTE: MapLibre řídí `transform` kořenového elementu markeru (translate),
      // takže scale aplikujeme na vnitřní wrapper.
      const inner = document.createElement('div');
      inner.style.display = 'flex';
      inner.style.flexDirection = 'column';
      inner.style.alignItems = 'center';
      inner.style.pointerEvents = 'auto';
      inner.style.transformOrigin = 'bottom center';
      inner.style.transition = 'transform 350ms cubic-bezier(.2,.8,.2,1)';
      inner.dataset.photoInner = '1';
      el.appendChild(inner);
      el.style.zIndex = '6';

      const card = document.createElement('div');
      card.style.cssText = `
        background: white; padding: 3px 3px 5px; border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,.35); border: 1px solid rgba(0,0,0,.15);
        max-width: 72px; text-align: center; cursor: pointer;
      `;
      const img = document.createElement('img');
      img.src = ph.photo_url;
      img.alt = ph.description || 'Fotka';
      img.style.cssText = 'width:64px;height:48px;object-fit:cover;border-radius:2px;display:block;';
      img.loading = 'lazy';
      card.appendChild(img);
      if (ph.description) {
        const cap = document.createElement('div');
        cap.textContent = ph.description;
        cap.style.cssText = "margin-top:2px;font-size:9px;line-height:1.1;color:#333;font-family:'Caveat',cursive;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:66px;";
        card.appendChild(cap);
      }
      inner.appendChild(card);

      // Klik = otevřít velký overlay
      card.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setActivePhoto((cur) => cur?.id === ph.id ? null : ph);
      });
      if (canEditPhotos) {
        card.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          if (confirm(`Smazat fotku${ph.description ? ` „${ph.description}“` : ''}?`)) {
            deletePhoto(ph);
          }
        });
      }

      const pin = document.createElement('div');
      pin.style.cssText = 'width:2px;height:14px;background:rgba(0,0,0,0.35);margin:0 auto;';
      inner.appendChild(pin);
      const arrow = document.createElement('div');
      arrow.style.cssText = 'width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid rgba(0,0,0,0.45);margin:0 auto;';
      inner.appendChild(arrow);

      const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, -10] })
        .setLngLat([ph.lon, ph.lat])
        .addTo(map.current!);
      photoMarkersRef.current.push({ id: ph.id, marker });
    });

    return () => {
      photoMarkersRef.current.forEach(({ marker }) => marker.remove());
      photoMarkersRef.current = [];
    };
  }, [photos, canEditPhotos, deletePhoto, flythrough.showSummary, outroMode]);

  // Proximity-based enlargement during flythrough (a schování v závěru)
  useEffect(() => {
    if (!gpxData || gpxData.tracks.length === 0) return;
    const track = gpxData.tracks[0];

    if (flythrough.showSummary || outroMode) {
      photoMarkersRef.current.forEach(({ marker }) => {
        marker.getElement().style.display = 'none';
      });
      return;
    }

    const pointIndex = flythrough.flyingIndex != null
      ? flythrough.flyingIndex
      : Math.floor((currentPosition / 100) * (track.points.length - 1));
    const cur = track.points[pointIndex];
    if (!cur) return;
    const cosLat = Math.cos((cur.lat * Math.PI) / 180);

    photoMarkersRef.current.forEach(({ id, marker }) => {
      const el = marker.getElement();
      el.style.display = '';
      const inner = el.querySelector<HTMLElement>('[data-photo-inner="1"]');
      if (inner) inner.style.transform = 'scale(1)';
      el.style.zIndex = '6';

      if (!flythrough.isFlying) return;
      const lngLat = marker.getLngLat();
      const dLat = (lngLat.lat - cur.lat) * 111;
      const dLon = (lngLat.lng - cur.lon) * 111 * cosLat;
      const distKm = Math.sqrt(dLat * dLat + dLon * dLon);

      if (distKm < photoRadiusKm && !triggeredPhotoIdsRef.current.has(id)) {
        triggeredPhotoIdsRef.current.add(id);
        const ph = photos.find((p) => p.id === id);
        if (!ph) return;
        if (activePhotoTimerRef.current) window.clearTimeout(activePhotoTimerRef.current);
        activePhotoIdRef.current = id;
        setActivePhoto(ph);
        activePhotoTimerRef.current = window.setTimeout(() => {
          setActivePhoto((cur) => (cur?.id === id ? null : cur));
          activePhotoTimerRef.current = null;
        }, photoDurationSec * 1000);
      }
    });
  }, [currentPosition, flythrough.flyingIndex, flythrough.isFlying, flythrough.showSummary, outroMode, gpxData, photos, photoRadiusKm, photoDurationSec]);

  // Reset one-shot triggers when a new flythrough starts or position resets to 0
  useEffect(() => {
    if (flythrough.isFlying && currentPosition < 1) {
      triggeredPhotoIdsRef.current.clear();
    }
    if (!flythrough.isFlying) {
      triggeredPhotoIdsRef.current.clear();
      if (activePhotoTimerRef.current) {
        window.clearTimeout(activePhotoTimerRef.current);
        activePhotoTimerRef.current = null;
      }
      setActivePhoto(null);
    }
  }, [flythrough.isFlying, currentPosition]);



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
    setPoiCounts(buildCounts(updated, updated.length));
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
        <div className={`relative w-full ${presentationMode ? 'h-screen' : 'h-[500px]'} ${(flythrough.isFlying || flythrough.showSummary) ? '[&_.maplibregl-ctrl-top-right]:hidden [&_.maplibregl-ctrl-bottom-right]:hidden' : ''}`}>
          <div ref={mapContainer} className="absolute inset-0" />


          {/* Elevation chart overlay */}
          {gpxData && (
            <div className={`absolute z-10 pointer-events-none ${presentationMode ? 'bottom-4 left-4 right-4' : 'bottom-2 left-2 right-2'}`}>
              <div className="pointer-events-auto">
                <ElevationChart
                  chartData={elevationData.chartData}
                  currentChartPoint={flythrough.showSummary ? null : elevationData.currentChartPoint}
                  variant="overlay"
                  trailColor={trailColor}
                  trailStyle={trailStyle}
                  trailWidth={trailWidth}
                />
              </div>
            </div>
          )}


          {/* Závěrečná karta shrnutí — pouze na vyžádání */}
          {showSummaryCard && gpxData && !recorder.isRecording && (
            <TrailSummaryCard
              gpxData={gpxData}
              trailColor={trailColor}
              trailStyle={trailStyle}
              trailWidth={trailWidth}
              activity={flythrough.markerIcon}
              surfaceData={surfaceData}
              onClose={() => setShowSummaryCard(false)}
            />
          )}



          {/* Basemap toggle + Fullscreen / Presentation toggle */}
          {gpxData && (
            <div className={cn('absolute top-2 right-2 z-20 flex gap-2 no-video-capture', recorder.isRecording && 'hidden')}>
              <div className="inline-flex rounded-md shadow-md overflow-hidden border bg-background/80 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setBasemap('terrain')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    basemap === 'terrain'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                  title="Topografická mapa s vrstevnicemi"
                >
                  3D terén
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap('satellite')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l ${
                    basemap === 'satellite'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                  title="Satelitní snímky"
                >
                  Satelit
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap('cyclosm')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l ${
                    basemap === 'cyclosm'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                  title="Cykloturistická mapa s trasami a vrstevnicemi"
                >
                  Cyklo
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap('darkmatter')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors border-l ${
                    basemap === 'darkmatter'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  }`}
                  title="Tmavý mapový podklad"
                >
                  Dark
                </button>
              </div>
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
              {gpxData && !showSummaryCard && !flythrough.isFlying && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2 shadow-md"
                  onClick={handleInfoClick}
                  disabled={surfaceLoading}
                  title="Zobrazit údaje o trase"
                >
                  {surfaceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Info className="w-4 h-4" />
                  )}
                  {surfaceLoading ? 'Načítám…' : 'Info'}
                </Button>
              )}
              {canEditPhotos && !flythrough.isFlying && (
                <Button
                  size="sm"
                  variant={photoMode ? 'default' : 'secondary'}
                  className="gap-2 shadow-md"
                  onClick={() => setPhotoMode((v) => !v)}
                  title={photoMode ? 'Zruš přidávání fotky' : 'Přidat fotku – klikni pak do mapy'}
                >
                  <Camera className="w-4 h-4" />
                  {photoMode ? 'Klikni do mapy…' : 'Foto'}
                </Button>
              )}
            </div>
          )}


          {/* Floating photo card during flythrough */}
          <PhotoOverlay
            photo={activePhoto}
            onDelete={
              canEditPhotos && !presentationMode
                ? (ph) => {
                    deletePhoto(ph);
                    setActivePhoto(null);
                    if (activePhotoTimerRef.current) {
                      window.clearTimeout(activePhotoTimerRef.current);
                      activePhotoTimerRef.current = null;
                    }
                    activePhotoIdRef.current = null;
                    triggeredPhotoIdsRef.current.delete(ph.id);
                  }
                : undefined
            }
          />

          {/* Photo upload dialog */}
          <PhotoUploadDialog
            open={!!pendingPhoto}
            lat={pendingPhoto?.lat ?? null}
            lon={pendingPhoto?.lon ?? null}
            onClose={() => setPendingPhoto(null)}
            onUpload={uploadPhoto}
          />


          {/* Presentation-mode controls: start flythrough + record */}
          {presentationMode && gpxData && (
            <div className={cn('absolute top-2 left-2 z-20 flex gap-2 no-video-capture', recorder.isRecording && 'hidden')}>
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
            <div className={cn('absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm font-medium animate-fade-in no-video-capture', recorder.isRecording && 'hidden')}>
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

          {/* Obnovit skryté POI (klikem v mapě) */}
          {gpxData && deselectedPoiKeys.size > 0 && (
            <button
              type="button"
              onClick={() => setDeselectedPoiKeys(new Set())}
              className={cn(
                'absolute top-2 right-2 z-10 bg-background/90 hover:bg-background border shadow-sm rounded-md px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 no-video-capture',
                recorder.isRecording && 'hidden'
              )}
              title="Obnovit skryté POI"
            >
              <X className="w-3 h-3" />
              Obnovit {deselectedPoiKeys.size} skrytých POI
            </button>
          )}


          {/* POI debug — diskrétní ikona, klik rozbalí detail */}
          {gpxData && poiStatus !== 'idle' && (
            <div className={cn('absolute bottom-2 left-2 z-10 no-video-capture', recorder.isRecording && 'hidden')}>
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
                      <div className="font-medium space-y-0.5">
                        <div>⛰️ {poiCounts.peaks} · 🏘️ {poiCounts.places}</div>
                        <div>🔭 {poiCounts.viewpoints} · 🏰 {poiCounts.castles}</div>
                        <div>⛰ {poiCounts.saddles} · 🍺 {poiCounts.pubs}</div>
                        <div>🌊 {poiCounts.rivers}</div>
                      </div>
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
          {/* Vzhled trasy: barva + styl + šířka */}
          {gpxData && !readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground w-20">Trasa</span>
              <label className="inline-flex items-center gap-2 cursor-pointer" title="Barva trasy">
                <input
                  type="color"
                  value={trailColor}
                  onChange={(e) => setTrailColor(e.target.value)}
                  className="w-8 h-8 rounded border border-border bg-transparent cursor-pointer p-0"
                  aria-label="Barva trasy"
                />
                <span className="text-xs text-muted-foreground">Barva</span>
              </label>
              <ToggleGroup
                type="single"
                value={trailStyle}
                onValueChange={(v) => v && setTrailStyle(v as 'solid' | 'dashed' | 'dotted')}
                size="sm"
              >
                <ToggleGroupItem value="solid" aria-label="Plná čára" title="Plná">
                  <span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `3px solid ${trailColor}` }} />
                </ToggleGroupItem>
                <ToggleGroupItem value="dashed" aria-label="Přerušovaná" title="Přerušovaná">
                  <span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `3px dashed ${trailColor}` }} />
                </ToggleGroupItem>
                <ToggleGroupItem value="dotted" aria-label="Tečkovaná" title="Tečkovaná">
                  <span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `3px dotted ${trailColor}` }} />
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                <span className="text-xs text-muted-foreground">Šířka</span>
                <Slider
                  value={[trailWidth]}
                  onValueChange={(v) => setTrailWidth(v[0])}
                  min={2}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-6 text-right">{trailWidth}</span>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer" title="Čára se kreslí jen za jezdcem">
                <Switch checked={trailBehindOnly} onCheckedChange={setTrailBehindOnly} />
                <span className="text-xs text-muted-foreground">Stopa za jezdcem</span>
              </label>
            </div>
          )}
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

          {gpxData && (
            <>
              {/* Dynamická rychlost dle GPX časů */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground flex-1">
                  Dynamická rychlost (dle GPX)
                </span>
                <Switch
                  checked={flythrough.dynamicSpeed}
                  onCheckedChange={flythrough.setDynamicSpeed}
                  disabled={!flythrough.hasTimeData || flythrough.isFlying}
                />
              </div>
              {!flythrough.hasTimeData && (
                <p className="text-[10px] text-muted-foreground -mt-2 pl-1">
                  GPX neobsahuje časové značky
                </p>
              )}

              {/* Směr průletu */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground flex-1">Směr průletu</span>
                <ToggleGroup
                  type="single"
                  value={flythrough.flyDirection}
                  onValueChange={(v) => v && flythrough.setFlyDirection(v as 'forward' | 'reverse')}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="forward" aria-label="Od startu" disabled={flythrough.isFlying}>
                    <ArrowRight className="w-3 h-3 mr-1" />
                    <span className="text-xs">Od startu</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="reverse" aria-label="Od cíle" disabled={flythrough.isFlying}>
                    <ArrowLeft className="w-3 h-3 mr-1" />
                    <span className="text-xs">Od cíle</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Intenzita dynamiky — jen v dynamickém režimu */}
              {flythrough.dynamicSpeed && flythrough.hasTimeData && (
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground w-20">Intenzita</span>
                  <Slider
                    value={[flythrough.dynamicIntensity]}
                    onValueChange={(value) => flythrough.setDynamicIntensity(value[0])}
                    min={0}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {flythrough.dynamicIntensity}%
                  </span>
                </div>
              )}

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

              {/* Marker icon picker */}
              <div className="flex items-center gap-3">
                <CircleDot className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Ikonka</span>
                <ToggleGroup
                  type="single"
                  value={flythrough.markerIcon}
                  onValueChange={(v) => v && flythrough.setMarkerIcon(v as 'bike' | 'walk' | 'car')}
                  variant="outline"
                  size="sm"
                  className="flex-1 justify-start"
                >
                  <ToggleGroupItem value="bike" aria-label="Kolo">
                    <Bike className="w-4 h-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="walk" aria-label="Chodec">
                    <PersonStanding className="w-4 h-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="car" aria-label="Auto">
                    <Car className="w-4 h-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Photo settings */}
              {photos.length > 0 && (
                <>
                  <div className="flex items-center gap-3">
                    <Camera className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground w-20">Foto dosah</span>
                    <Slider
                      value={[photoRadiusKm]}
                      onValueChange={(value) => setPhotoRadiusKm(value[0])}
                      min={0.1}
                      max={2}
                      step={0.05}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-14 text-right">{photoRadiusKm.toFixed(2)} km</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Camera className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-medium text-muted-foreground w-20">Foto doba</span>
                    <Slider
                      value={[photoDurationSec]}
                      onValueChange={(value) => setPhotoDurationSec(value[0])}
                      min={1}
                      max={10}
                      step={0.5}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-14 text-right">{photoDurationSec.toFixed(1)} s</span>
                  </div>
                </>
              )}
            </>
          )}

          {/* POI search radius */}

          {gpxData && (
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground w-20">Okolí POI</span>
              <Slider
                value={[poiRadiusKm]}
                onValueChange={(value) => setPoiRadiusKm(value[0])}
                min={1}
                max={10}
                step={1}
                className="flex-1"
                disabled={poiStatus === 'loading'}
              />
              <span className="text-xs text-muted-foreground w-10 text-right">{poiRadiusKm} km</span>
            </div>
          )}

          {/* POI viditelnost od aktuální pozice */}
          {gpxData && (
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground w-20">Dohled POI</span>
              <Slider
                value={[poiVisibilityKm]}
                onValueChange={(value) => setPoiVisibilityKm(value[0])}
                min={0}
                max={30}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-12 text-right">
                {poiVisibilityKm === 0 ? 'vše' : `${poiVisibilityKm} km`}
              </span>
            </div>
          )}

          {/* Závěrečný orbit — pauza před návratem POI */}
          {gpxData && (
            <div className="flex items-center gap-3">
              <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground w-20">Outro pauza</span>
              <Slider
                value={[outroHideDelayMs]}
                onValueChange={(value) => setOutroHideDelayMs(value[0])}
                min={0}
                max={5000}
                step={100}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-12 text-right">
                {(outroHideDelayMs / 1000).toFixed(1)} s
              </span>
            </div>
          )}

          {/* Závěrečný orbit — délka postupného odhalení POI */}
          {gpxData && (
            <div className="flex items-center gap-3">
              <Play className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground w-20">Outro návrat</span>
              <Slider
                value={[outroRevealMs]}
                onValueChange={(value) => setOutroRevealMs(value[0])}
                min={500}
                max={15000}
                step={250}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-12 text-right">
                {(outroRevealMs / 1000).toFixed(1)} s
              </span>
            </div>
          )}

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
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Města</span>
                {placeSelectionMode === 'auto' ? (
                  <Slider
                    value={[placeLimit]}
                    onValueChange={(value) => setPlaceLimit(value[0])}
                    min={0}
                    max={Math.max(poiCounts.places, 5)}
                    step={1}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 text-xs text-muted-foreground">
                    Vybráno {[...selectedPlaceKeys].filter(k =>
                      allNearbyPoisRef.current.some(p => p.type === 'place' && placeKey(p) === k)
                    ).length} z {poiCounts.places}
                  </div>
                )}
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {placeSelectionMode === 'auto'
                    ? `${Math.min(placeLimit, poiCounts.places)}/${poiCounts.places}`
                    : `${[...selectedPlaceKeys].filter(k => allNearbyPoisRef.current.some(p => p.type === 'place' && placeKey(p) === k)).length}/${poiCounts.places}`}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-7">
                <Button
                  size="sm"
                  variant={placeSelectionMode === 'auto' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => setPlaceSelectionMode('auto')}
                >
                  Auto (top N)
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant={placeSelectionMode === 'manual' ? 'default' : 'outline'}
                      className="h-7 text-xs gap-1"
                      onClick={() => setPlaceSelectionMode('manual')}
                    >
                      <ListChecks className="w-3.5 h-3.5" />
                      Vybrat města
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    <div className="p-2 border-b space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={placeSearch}
                          onChange={(e) => setPlaceSearch(e.target.value)}
                          placeholder="Hledat město…"
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
                              .filter(p => p.type === 'place')
                              .map(placeKey);
                            setSelectedPlaceKeys(new Set(allKeys));
                          }}
                        >
                          Vybrat vše
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs flex-1"
                          onClick={() => setSelectedPlaceKeys(new Set())}
                        >
                          Zrušit vše
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-72">
                      <div className="p-1">
                        {(() => {
                          const rank: Record<string, number> = { city: 0, town: 1, village: 2, hamlet: 3 };
                          return allNearbyPoisRef.current
                            .filter(p => p.type === 'place')
                            .filter(p => !placeSearch || p.name.toLowerCase().includes(placeSearch.toLowerCase()))
                            .sort((a, b) => (rank[a.placeType ?? 'hamlet'] ?? 9) - (rank[b.placeType ?? 'hamlet'] ?? 9))
                            .map(p => {
                              const k = placeKey(p);
                              const checked = selectedPlaceKeys.has(k);
                              return (
                                <label
                                  key={k}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      setSelectedPlaceKeys(prev => {
                                        const next = new Set(prev);
                                        if (v) next.add(k); else next.delete(k);
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className="flex-1 truncate">{p.name}</span>
                                  {p.placeType && (
                                    <span className="text-muted-foreground capitalize">
                                      {p.placeType}
                                    </span>
                                  )}
                                </label>
                              );
                            });
                        })()}
                        {allNearbyPoisRef.current.filter(p =>
                          p.type === 'place' &&
                          (!placeSearch || p.name.toLowerCase().includes(placeSearch.toLowerCase()))
                        ).length === 0 && (
                          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                            Žádné město neodpovídá
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* POI density — viewpoints (rozhledny + vyhlídky) */}
          {gpxData && poiCounts.viewpoints > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-base flex-shrink-0 w-4 text-center">🔭</span>
              <span className="text-xs font-medium text-muted-foreground w-20">Rozhledny</span>
              <Slider
                value={[viewpointLimit]}
                onValueChange={(value) => setViewpointLimit(value[0])}
                min={0}
                max={Math.max(poiCounts.viewpoints, 5)}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.min(viewpointLimit, poiCounts.viewpoints)}/{poiCounts.viewpoints}
              </span>
            </div>
          )}

          {/* POI density — castles (hrady, zříceniny) */}
          {gpxData && poiCounts.castles > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-base flex-shrink-0 w-4 text-center">🏰</span>
              <span className="text-xs font-medium text-muted-foreground w-20">Hrady</span>
              <Slider
                value={[castleLimit]}
                onValueChange={(value) => setCastleLimit(value[0])}
                min={0}
                max={Math.max(poiCounts.castles, 5)}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.min(castleLimit, poiCounts.castles)}/{poiCounts.castles}
              </span>
            </div>
          )}

          {/* POI density — saddles (sedla) */}
          {gpxData && poiCounts.saddles > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-base flex-shrink-0 w-4 text-center">⛰</span>
              <span className="text-xs font-medium text-muted-foreground w-20">Sedla</span>
              <Slider
                value={[saddleLimit]}
                onValueChange={(value) => setSaddleLimit(value[0])}
                min={0}
                max={Math.max(poiCounts.saddles, 5)}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.min(saddleLimit, poiCounts.saddles)}/{poiCounts.saddles}
              </span>
            </div>
          )}

          {/* POI density — pubs (hospody, restaurace) */}
          {gpxData && poiCounts.pubs > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-base flex-shrink-0 w-4 text-center">🍺</span>
              <span className="text-xs font-medium text-muted-foreground w-20">Hospody</span>
              <Slider
                value={[pubLimit]}
                onValueChange={(value) => setPubLimit(value[0])}
                min={0}
                max={Math.max(poiCounts.pubs, 5)}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.min(pubLimit, poiCounts.pubs)}/{poiCounts.pubs}
              </span>
            </div>
          )}

          {/* POI density — rivers (řeky, potoky) */}
          {gpxData && poiCounts.rivers > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-base flex-shrink-0 w-4 text-center">🌊</span>
              <span className="text-xs font-medium text-muted-foreground w-20">Řeky</span>
              <Slider
                value={[riverLimit]}
                onValueChange={(value) => setRiverLimit(value[0])}
                min={0}
                max={Math.max(poiCounts.rivers, 5)}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.min(riverLimit, poiCounts.rivers)}/{poiCounts.rivers}
              </span>
            </div>
          )}

          {gpxData && (
            <>

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
