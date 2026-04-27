import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, PhotoPoint, AnimationSettings } from '@/types/gpx';
import { PhotoViewModal } from './PhotoViewModal';
import { PhotoPiP } from './PhotoPiP';
import { ManualPhotoDialog } from './ManualPhotoDialog';
import { ElevationChart } from './ElevationChart';
import { Mountain, Play, Square, RotateCcw, ZoomIn, TrendingUp, ArrowUp, ArrowDown, Minus, Camera, MapPin, X, Bug } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { fetchPeaksAndPlaces, filterPOIsNearTrack } from '@/utils/overpassApi';
import { useFlythrough } from '@/hooks/useFlythrough';
import { usePhotoMarkers } from '@/hooks/usePhotoMarkers';
import { useElevationData } from '@/hooks/useElevationData';

interface TrailMapProps {
  gpxData: GPXData | null;
  currentPosition: number;
  photos: PhotoPoint[];
  onAddPhotos: (newPhotos: PhotoPoint[]) => void;
  animationSettings: AnimationSettings;
  readOnly?: boolean;
}

export const TrailMap: React.FC<TrailMapProps> = ({
  gpxData,
  currentPosition,
  photos,
  onAddPhotos,
  animationSettings,
  readOnly = false,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const poiMarkersRef = useRef<Marker[]>([]);

  // Manual photo placement state
  const [addPhotoMode, setAddPhotoMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // POI debug state (visible on mobile)
  const [poiStatus, setPoiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [poiCounts, setPoiCounts] = useState({ peaks: 0, places: 0, raw: 0, filtered: 0 });
  const [poiError, setPoiError] = useState<string | null>(null);
  const [poiPanelExpanded, setPoiPanelExpanded] = useState(false);

  // POI density — separate limits for peaks (hory) and places (města)
  const [peakLimit, setPeakLimit] = useState(25);
  const [placeLimit, setPlaceLimit] = useState(15);
  const allNearbyPoisRef = useRef<import('@/utils/overpassApi').POIPoint[]>([]);

  // Hooks — order matters: flythrough first (produces flyingIndex)
  const flythrough = useFlythrough(map, gpxData);
  const photoMarkers = usePhotoMarkers(
    map, gpxData, photos, onAddPhotos, currentPosition, animationSettings,
    flythrough.flyingIndex, flythrough.isFlying,
  );
  const elevationData = useElevationData(
    gpxData, photos, currentPosition,
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

    // Priority sort: peaks first, then places by importance (city > town > village > hamlet)
    const placeRank: Record<string, number> = { city: 0, town: 1, village: 2, hamlet: 3 };
    const sorted = [...pois].sort((a, b) => {
      if (a.type === 'peak' && b.type !== 'peak') return -1;
      if (b.type === 'peak' && a.type !== 'peak') return 1;
      if (a.type === 'peak' && b.type === 'peak') {
        return (b.ele ?? 0) - (a.ele ?? 0);
      }
      return (placeRank[a.placeType ?? 'hamlet'] ?? 9) - (placeRank[b.placeType ?? 'hamlet'] ?? 9);
    });

    const limited = sorted.slice(0, poiLimit);

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
  }, [poiLimit]);

  // POI fetch — only on gpx change
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    let cancelled = false;

    const loadPOIs = async () => {
      setPoiStatus('loading');
      setPoiError(null);
      try {
        const pois = await fetchPeaksAndPlaces(gpxData.bounds);
        if (cancelled || !map.current) return;

        const nearbyPois = filterPOIsNearTrack(pois, track.points, 2);
        allNearbyPoisRef.current = nearbyPois;

        const peaks = nearbyPois.filter(p => p.type === 'peak').length;
        const places = nearbyPois.filter(p => p.type === 'place').length;
        setPoiCounts({ peaks, places, raw: pois.length, filtered: nearbyPois.length });
        setPoiStatus('success');

        renderPoiMarkers(nearbyPois);
      } catch (err) {
        if (cancelled) return;
        setPoiStatus('error');
        setPoiError(err instanceof Error ? err.message : 'Neznámá chyba');
      }
    };

    if (map.current.isStyleLoaded()) {
      loadPOIs();
    } else {
      map.current.once('load', loadPOIs);
    }

    return () => {
      cancelled = true;
      poiMarkersRef.current.forEach(m => m.remove());
      poiMarkersRef.current = [];
    };
  }, [gpxData, renderPoiMarkers]);

  // Re-render markers when limit changes (without re-fetching)
  useEffect(() => {
    if (allNearbyPoisRef.current.length > 0) {
      renderPoiMarkers(allNearbyPoisRef.current);
    }
  }, [poiLimit, renderPoiMarkers]);

  // Click-to-add-photo mode
  useEffect(() => {
    if (!map.current || !addPhotoMode) return;
    const m = map.current;
    const canvas = m.getCanvas();
    canvas.style.cursor = 'crosshair';

    const handleClick = (e: MapMouseEvent) => {
      setPendingCoords({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      setIsDialogOpen(true);
      setAddPhotoMode(false);
    };

    m.on('click', handleClick);

    return () => {
      m.off('click', handleClick);
      canvas.style.cursor = '';
    };
  }, [addPhotoMode]);

  return (
    <>
      <div className="relative w-full rounded-lg overflow-hidden shadow-lg">
        {/* Main map container */}
        <div className="relative w-full h-[500px]">
          <div ref={mapContainer} className="absolute inset-0" />
          {!readOnly && (
            <div className="absolute top-2 left-2 z-10 flex gap-2">
              <input
                ref={photoMarkers.fileInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    photoMarkers.handleBulkPhotoUpload(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                className="gap-2 shadow-md"
                onClick={photoMarkers.triggerUpload}
                disabled={addPhotoMode}
              >
                <Camera className="w-4 h-4" />
                Přidat fotky
              </Button>
              <Button
                size="sm"
                variant={addPhotoMode ? 'default' : 'secondary'}
                className="gap-2 shadow-md"
                onClick={() => setAddPhotoMode((v) => !v)}
              >
                <MapPin className="w-4 h-4" />
                {addPhotoMode ? 'Zrušit' : 'Přidat klikem'}
              </Button>
            </div>
          )}

          {addPhotoMode && !readOnly && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm font-medium animate-fade-in">
              <MapPin className="w-4 h-4" />
              Klikni na mapu pro umístění fotky
              <button
                onClick={() => setAddPhotoMode(false)}
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
                    <div className="text-destructive break-words max-w-[220px]">
                      {poiError || 'Chyba načítání POI'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Picture-in-picture náhled fotky během 3D průletu */}
          {flythrough.isFlying && <PhotoPiP photo={photoMarkers.nearbyPhoto} />}
        </div>

        {/* 3D Controls */}
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

          {/* POI density slider */}
          {gpxData && poiCounts.filtered > 0 && (
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground w-20">Hustota POI</span>
              <Slider
                value={[poiLimit]}
                onValueChange={(value) => setPoiLimit(value[0])}
                min={0}
                max={Math.max(poiCounts.filtered, 10)}
                step={1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground w-10 text-right">
                {Math.min(poiLimit, poiCounts.filtered)}/{poiCounts.filtered}
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
                  onClick={flythrough.isFlying ? flythrough.stopFlythrough : flythrough.startFlythrough}
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

        {/* Elevation chart */}
        {gpxData && (
          <ElevationChart
            chartData={elevationData.chartData}
            currentChartPoint={elevationData.currentChartPoint}
            photosOnChart={elevationData.photosOnChart}
          />
        )}
      </div>

      <PhotoViewModal
        photo={photoMarkers.viewPhoto}
        isOpen={photoMarkers.isPhotoViewOpen}
        onClose={photoMarkers.handlePhotoClose}
      />

      <ManualPhotoDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setPendingCoords(null);
        }}
        coords={pendingCoords}
        onConfirm={(photo) => onAddPhotos([photo])}
      />
    </>
  );
};
