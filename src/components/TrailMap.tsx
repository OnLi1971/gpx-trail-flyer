import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { PhotoUploadModal } from './PhotoUploadModal';
import { PhotoViewModal } from './PhotoViewModal';
import { Bike, Mountain, Play, Square } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';
import { AnimationSettings } from './PhotoAnimationControls';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
interface TrailMapProps {
  gpxData: GPXData | null;
  currentPosition: number;
  onPhotosUpdate?: (photos: PhotoPoint[]) => void;
  animationSettings: AnimationSettings;
}

export const TrailMap: React.FC<TrailMapProps> = ({ 
  gpxData, 
  currentPosition,
  onPhotosUpdate,
  animationSettings
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const photoMarkersRef = useRef<Marker[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clickedPosition, setClickedPosition] = useState<{lat: number, lon: number} | null>(null);
  const [photos, setPhotos] = useState<PhotoPoint[]>([]);
  const [viewPhoto, setViewPhoto] = useState<PhotoPoint | null>(null);
  const [isPhotoViewOpen, setIsPhotoViewOpen] = useState(false);
  const [originalMapState, setOriginalMapState] = useState<{center: [number, number], zoom: number} | null>(null);
  const [mapPitch, setMapPitch] = useState(0);
  const [isFlying, setIsFlying] = useState(false);
  const flyAnimationRef = useRef<number | null>(null);

  // PATCH: stav synchronizace animace/fotky
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

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
              'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© CycloOSM contributors'
          }
        },
        layers: [
          {
            id: 'cyclosm-layer',
            type: 'raster',
            source: 'cyclosm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      zoom: 10,
      center: [14.4, 50.1], // Prague default
    });

    map.current.addControl(
      new NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

    // Add click listener for adding photos
    map.current.on('click', (e) => {
      // Check if click target is a photo marker
      const target = e.originalEvent.target as HTMLElement;
      if (target && target.closest('[data-photo-marker]')) {
        return;
      }
      setClickedPosition({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng
      });
      setIsModalOpen(true);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    // Create GeoJSON for the trail
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

      // Remove existing layers/sources safely (prevents crashes when switching GPX)
      if (map.current.getLayer('trail-glow')) map.current.removeLayer('trail-glow');
      if (map.current.getLayer('trail-line')) map.current.removeLayer('trail-line');
      if (map.current.getSource('trail')) map.current.removeSource('trail');

      map.current.addSource('trail', {
        type: 'geojson',
        data: geojson,
      });

      map.current.addLayer({
        id: 'trail-glow',
        type: 'line',
        source: 'trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#059669',
          'line-width': 8,
          'line-opacity': 0.3,
          'line-blur': 2,
        },
      });

      map.current.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#059669',
          'line-width': 4,
          'line-opacity': 0.8,
        },
      });

      // Fit map to trail bounds
      const bounds = new LngLatBounds();
      track.points.forEach((point) => {
        bounds.extend([point.lon, point.lat]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    };

    if (map.current.isStyleLoaded()) {
      ensureTrailLayers();
      return;
    }

    // Run once when style becomes ready (avoids stacking multiple 'load' handlers)
    map.current.once('load', ensureTrailLayers);
  }, [gpxData]);

  // Initialize photos from GPX data
  useEffect(() => {
    if (gpxData?.photos) {
      setPhotos(gpxData.photos);
    }
  }, [gpxData]);

  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    const pointIndex = Math.floor((currentPosition / 100) * (track.points.length - 1));
    const point = track.points[pointIndex];

    if (!point) return;

    // Remove existing marker
    if (markerRef.current) {
      markerRef.current.remove();
    }

    // Create new marker (just the moving point without location symbol)
    const markerElement = document.createElement('div');
    markerElement.className = 'w-3 h-3 bg-trail-active rounded-full shadow-lg';

    markerRef.current = new Marker(markerElement)
      .setLngLat([point.lon, point.lat])
      .addTo(map.current);

  }, [currentPosition, gpxData]);

  // Effect for photo markers using GeoJSON
  useEffect(() => {
    if (!map.current) return;

    if (!photos.length) {
      // Remove photo layers if no photos
      if (map.current.getLayer('photo-markers')) {
        map.current.removeLayer('photo-markers');
      }
      if (map.current.getSource('photo-markers')) {
        map.current.removeSource('photo-markers');
      }
      return;
    }

    // Remove existing photo layers and markers
    if (map.current.getLayer('photo-icons')) {
      map.current.removeLayer('photo-icons');
    }
    if (map.current.getLayer('photo-markers')) {
      map.current.removeLayer('photo-markers');
    }
    if (map.current.getSource('photo-markers')) {
      map.current.removeSource('photo-markers');
    }

    // Remove any existing photo markers
    photoMarkersRef.current.forEach(marker => marker.remove());
    photoMarkersRef.current = [];

    // Create simple blue markers for photos
    photos.forEach(photo => {
      const markerElement = document.createElement('div');
      markerElement.className = 'w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg cursor-pointer hover:scale-110 transition-transform duration-200';
      markerElement.setAttribute('data-photo-marker', 'true');

      const marker = new Marker(markerElement)
        .setLngLat([photo.lon, photo.lat])
        .addTo(map.current!);

      photoMarkersRef.current.push(marker);
    });

  }, [photos]);

  // PATCH: Synchronizace pohybu a otevírání fotky
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0 || photos.length === 0) return;
    const track = gpxData.tracks[0];
    const pointIndex = Math.floor((currentPosition / 100) * (track.points.length - 1));
    const point = track.points[pointIndex];

    if (!point) return;
    const threshold = animationSettings.threshold;

    photos.forEach(photo => {
      const latDiff = Math.abs(photo.lat - point.lat);
      const lonDiff = Math.abs(photo.lon - point.lon);

      // Otevři modal pouze pokud není žádná aktivní animace nebo modal
      if (
        latDiff < threshold &&
        lonDiff < threshold &&
        !isPhotoViewOpen &&
        activePhotoId === null
      ) {
        setActivePhotoId(photo.id);
        handleArrivedPhoto(photo);
      }
    });
  }, [currentPosition, gpxData, photos, isPhotoViewOpen, activePhotoId, animationSettings.threshold]);

  // Funkce pro otevření fotky, když k ní dojede značka
  const handleArrivedPhoto = (photo: PhotoPoint) => {
    if (!map.current) return;
    if (!map.current.isStyleLoaded()) return;
    setOriginalMapState({
      center: [map.current.getCenter().lng, map.current.getCenter().lat],
      zoom: map.current.getZoom()
    });
    const currentZoom = map.current.getZoom();
    const newZoom = Math.min(currentZoom * animationSettings.zoomFactor, 18);
    map.current.flyTo({
      center: [photo.lon, photo.lat],
      zoom: newZoom,
      duration: animationSettings.flyToDuration,
      essential: true
    });
    setTimeout(() => {
      setViewPhoto(photo);
      setIsPhotoViewOpen(true);
    }, animationSettings.modalDelay);
  };

  // PATCH: VRÁCENÍ ZOOMU PO ZAVŘENÍ FOTKY + uvolnění synchronizačního stavu
  const handlePhotoClose = () => {
    setIsPhotoViewOpen(false);
    setViewPhoto(null);
    setActivePhotoId(null); // Povolit otevření další fotky až po úplném zavření a odzoomování
    if (map.current && originalMapState) {
      map.current.flyTo({
        center: originalMapState.center,
        zoom: originalMapState.zoom,
        duration: animationSettings.zoomBackDuration
      });
      setOriginalMapState(null);
    }
  };

  // Calculate bearing between two points
  const calculateBearing = (start: { lat: number; lon: number }, end: { lat: number; lon: number }) => {
    const startLat = start.lat * Math.PI / 180;
    const startLon = start.lon * Math.PI / 180;
    const endLat = end.lat * Math.PI / 180;
    const endLon = end.lon * Math.PI / 180;
    
    const dLon = endLon - startLon;
    const y = Math.sin(dLon) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLon);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  };

  // Start 3D flythrough animation
  const startFlythrough = () => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;
    
    const track = gpxData.tracks[0];
    if (track.points.length < 2) return;

    setIsFlying(true);
    let currentIndex = 0;
    const totalPoints = track.points.length;
    const step = Math.max(1, Math.floor(totalPoints / 200)); // Sample ~200 points for smooth animation

    const animateStep = () => {
      if (!map.current || currentIndex >= totalPoints - 1) {
        stopFlythrough();
        return;
      }

      const currentPoint = track.points[currentIndex];
      const nextIndex = Math.min(currentIndex + step, totalPoints - 1);
      const nextPoint = track.points[nextIndex];
      
      const bearing = calculateBearing(currentPoint, nextPoint);
      
      // Dynamic pitch based on elevation change
      let targetPitch = 60;
      if (currentPoint.ele && nextPoint.ele) {
        const elevChange = nextPoint.ele - currentPoint.ele;
        targetPitch = Math.max(45, Math.min(70, 60 + elevChange * 0.5));
      }

      map.current.easeTo({
        center: [currentPoint.lon, currentPoint.lat],
        bearing: bearing,
        pitch: targetPitch,
        zoom: 15,
        duration: 100,
        easing: (t) => t
      });

      setMapPitch(Math.round(targetPitch));
      currentIndex = nextIndex;
      
      flyAnimationRef.current = requestAnimationFrame(animateStep);
    };

    // Initial setup - zoom to start
    const startPoint = track.points[0];
    const secondPoint = track.points[Math.min(step, totalPoints - 1)];
    const initialBearing = calculateBearing(startPoint, secondPoint);

    map.current.flyTo({
      center: [startPoint.lon, startPoint.lat],
      zoom: 15,
      pitch: 60,
      bearing: initialBearing,
      duration: 2000,
      essential: true
    });

    setMapPitch(60);

    // Start animation after initial flyTo
    setTimeout(() => {
      flyAnimationRef.current = requestAnimationFrame(animateStep);
    }, 2000);
  };

  // Stop flythrough animation
  const stopFlythrough = () => {
    if (flyAnimationRef.current) {
      cancelAnimationFrame(flyAnimationRef.current);
      flyAnimationRef.current = null;
    }
    setIsFlying(false);
    
    // Reset to normal view
    if (map.current && gpxData && gpxData.tracks.length > 0) {
      const track = gpxData.tracks[0];
      const bounds = new LngLatBounds();
      track.points.forEach((point) => {
        bounds.extend([point.lon, point.lat]);
      });
      
      map.current.flyTo({
        center: bounds.getCenter(),
        zoom: 12,
        pitch: 0,
        bearing: 0,
        duration: 1500
      });
      setMapPitch(0);
    }
  };

  const handlePhotoSave = (photoData: Omit<PhotoPoint, 'id' | 'timestamp'>) => {
    const newPhoto: PhotoPoint = {
      ...photoData,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    const updatedPhotos = [...photos, newPhoto];
    setPhotos(updatedPhotos);
    onPhotosUpdate?.(updatedPhotos);
  };

  // Prepare elevation chart data
  const getElevationData = () => {
    if (!gpxData || gpxData.tracks.length === 0) return { chartData: [], currentChartPoint: null, photosOnChart: [] };

    const track = gpxData.tracks[0];
    const pointsWithElevation = track.points.filter(point => point.ele !== undefined);

    if (pointsWithElevation.length === 0) return { chartData: [], currentChartPoint: null, photosOnChart: [] };

    // Prepare chart data with distance in kilometers
    const chartData = pointsWithElevation.map((point, index) => ({
      distance: (index / (pointsWithElevation.length - 1)) * (track.totalDistance / 1000),
      elevation: point.ele!,
      originalIndex: track.points.indexOf(point)
    }));

    // Calculate current position in chart data based on actual track position
    const totalPoints = track.points.length;
    const currentPointIndex = Math.floor((currentPosition / 100) * (totalPoints - 1));
    const currentPoint = track.points[currentPointIndex];

    // Find the closest elevation point to current position
    let currentChartPoint = null;
    if (currentPoint && currentPoint.ele !== undefined) {
      const chartIndex = chartData.findIndex(data => data.originalIndex === currentPointIndex);
      if (chartIndex >= 0) {
        currentChartPoint = chartData[chartIndex];
      }
    } else {
      let minDistance = Infinity;
      let nearestPoint = null;

      pointsWithElevation.forEach((elevPoint, elevIndex) => {
        const elevOriginalIndex = track.points.indexOf(elevPoint);
        const distance = Math.abs(elevOriginalIndex - currentPointIndex);
        if (distance < minDistance) {
          minDistance = distance;
          nearestPoint = chartData[elevIndex];
        }
      });
      currentChartPoint = nearestPoint;
    }

    // Calculate photo positions on the chart
    const photosOnChart = photos.map(photo => {
      let closestPoint = track.points[0];
      let minDistance = Number.MAX_VALUE;

      track.points.forEach(point => {
        const distance = Math.sqrt(
          Math.pow(point.lat - photo.lat, 2) + Math.pow(point.lon - photo.lon, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });

      const pointIndex = track.points.indexOf(closestPoint);
      const chartPoint = chartData.find(data => data.originalIndex === pointIndex);

      return {
        ...photo,
        chartDistance: chartPoint?.distance || 0,
        chartElevation: chartPoint?.elevation || closestPoint.ele || 0
      };
    });

    return { chartData, currentChartPoint, photosOnChart };
  };

  const { chartData, currentChartPoint, photosOnChart } = getElevationData();

  return (
    <>
      <div className="relative w-full rounded-lg overflow-hidden shadow-lg">
        {/* Main map container */}
        <div className="relative w-full h-96">
          <div ref={mapContainer} className="absolute inset-0" />
          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-gray-600">
            Klikněte na mapu pro přidání fotky
          </div>
          
          {/* 3D Controls */}
          <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-md">
            <div className="flex items-center gap-3">
              <Mountain className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground min-w-[60px]">3D náklon</span>
              <Slider
                value={[mapPitch]}
                onValueChange={(value) => {
                  setMapPitch(value[0]);
                  if (map.current) {
                    map.current.easeTo({ pitch: value[0], duration: 300 });
                  }
                }}
                min={0}
                max={60}
                step={1}
                className="flex-1"
                disabled={isFlying}
              />
              <span className="text-xs text-muted-foreground min-w-[30px] text-right">{mapPitch}°</span>
              
              {/* Flythrough button */}
              {gpxData && (
                <Button
                  size="sm"
                  variant={isFlying ? "destructive" : "default"}
                  onClick={isFlying ? stopFlythrough : startFlythrough}
                  className="ml-2 gap-1"
                >
                  {isFlying ? (
                    <>
                      <Square className="w-3 h-3" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      3D průlet
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Integrated elevation chart overlay */}
        {gpxData && chartData.length > 0 && (
          <div className="w-full h-40 bg-white/95 backdrop-blur-sm border-t-2 border-trail-color/30">
            <div className="h-full p-3">
              <div className="h-32 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: 25, bottom: 15 }}>
                    <defs>
                      <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="1 1" stroke="#e5e7eb" strokeWidth={0.5} />
                    <XAxis 
                      dataKey="distance" 
                      tickFormatter={(value) => `${Math.round(value)}km`}
                      className="text-xs"
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      tickCount={4}
                    />
                    <YAxis 
                      tickFormatter={(value) => `${Math.round(value)}`}
                      domain={['dataMin - 10', 'dataMax + 10']}
                      className="text-xs opacity-60"
                      axisLine={false}
                      tickLine={false}
                      width={20}
                      tickCount={3}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="elevation" 
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                      fill="url(#elevationGradient)"
                      fillOpacity={0.3}
                    />
                    
                    {/* Photo markers */}
                    {photosOnChart.map(photo => (
                      <ReferenceDot 
                        key={photo.id}
                        x={photo.chartDistance} 
                        y={photo.chartElevation}
                        r={4}
                        fill="#3b82f6"
                        stroke="white"
                        strokeWidth={1}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                    
                    {/* Current position marker */}
                    {currentChartPoint && (
                      <ReferenceDot 
                        x={currentChartPoint.distance} 
                        y={currentChartPoint.elevation}
                        r={6}
                        fill="#ef4444"
                        stroke="white"
                        strokeWidth={2}
                      />
                     )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {clickedPosition && (
        <PhotoUploadModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handlePhotoSave}
          lat={clickedPosition.lat}
          lon={clickedPosition.lon}
        />
      )}
      
      <PhotoViewModal
        photo={viewPhoto}
        isOpen={isPhotoViewOpen}
        onClose={handlePhotoClose}
      />
    </>
  );
};