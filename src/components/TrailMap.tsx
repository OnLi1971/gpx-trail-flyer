import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, PhotoPoint, AnimationSettings } from '@/types/gpx';
import { PhotoViewModal } from './PhotoViewModal';
import { ManualPhotoDialog } from './ManualPhotoDialog';
import { ElevationChart } from './ElevationChart';
import { Mountain, Play, Square, RotateCcw, ZoomIn, TrendingUp, ArrowUp, ArrowDown, Minus, Camera, MapPin, X } from 'lucide-react';
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
}

export const TrailMap: React.FC<TrailMapProps> = ({
  gpxData,
  currentPosition,
  photos,
  onAddPhotos,
  animationSettings,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const poiMarkersRef = useRef<Marker[]>([]);

  // Manual photo placement state
  const [addPhotoMode, setAddPhotoMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Hooks — order matters: flythrough first (produces flyingIndex)
  const flythrough = useFlythrough(map, gpxData);
  const photoMarkers = usePhotoMarkers(map, gpxData, photos, onAddPhotos, currentPosition, animationSettings);
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

  // POI markers
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    const loadPOIs = async () => {
      try {
        const pois = await fetchPeaksAndPlaces(gpxData.bounds);
        const nearbyPois = filterPOIsNearTrack(pois, track.points, 2);

        poiMarkersRef.current.forEach(m => m.remove());
        poiMarkersRef.current = [];

        nearbyPois.forEach(poi => {
          const el = document.createElement('div');
          el.style.display = 'flex';
          el.style.flexDirection = 'column';
          el.style.alignItems = 'center';
          el.style.pointerEvents = 'none';

          if (poi.type === 'peak') {
            el.innerHTML = `
              <div style="
                background: rgba(255,255,255,0.92);
                border: 1.5px solid #b45309;
                border-radius: 6px;
                padding: 2px 6px;
                font-size: 11px;
                font-weight: 600;
                color: #92400e;
                white-space: nowrap;
                box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                gap: 3px;
              ">
                <span style="font-size:13px">⛰️</span>
                ${poi.name}${poi.ele ? ` ${poi.ele}\u202Fm` : ''}
              </div>
              <div style="width: 2px; height: 20px; background: #b45309; opacity: 0.6;"></div>
              <div style="width: 6px; height: 6px; border-radius: 50%; background: #b45309;"></div>
            `;
          } else {
            el.innerHTML = `
              <div style="
                background: rgba(255,255,255,0.88);
                border: 1px solid #6b7280;
                border-radius: 4px;
                padding: 1px 5px;
                font-size: 10px;
                font-weight: 500;
                color: #374151;
                white-space: nowrap;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              ">
                ${poi.name}
              </div>
            `;
          }

          const marker = new Marker({ element: el, anchor: 'bottom' })
            .setLngLat([poi.lon, poi.lat])
            .addTo(map.current!);

          poiMarkersRef.current.push(marker);
        });
      } catch (err) {
        console.warn('POI loading failed:', err);
      }
    };

    if (map.current.isStyleLoaded()) {
      loadPOIs();
    } else {
      map.current.once('load', loadPOIs);
    }

    return () => {
      poiMarkersRef.current.forEach(m => m.remove());
      poiMarkersRef.current = [];
    };
  }, [gpxData]);

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

          {addPhotoMode && (
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
              max={60}
              step={1}
              className="flex-1"
              disabled={flythrough.isFlying}
            />
            <span className="text-xs text-muted-foreground w-10 text-right">{flythrough.mapPitch}°</span>
          </div>

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
    </>
  );
};
