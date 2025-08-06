import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { PhotoUploadModal } from './PhotoUploadModal';
import { PhotoViewModal } from './PhotoViewModal';
import { Bike } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';
import { AnimationSettings } from './PhotoAnimationControls';

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

  // NOVÝ STAV pro kontrolu opakovaného otevření modalu
  const [lastOpenedPhotoId, setLastOpenedPhotoId] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'topo-tiles': {
            type: 'raster',
            tiles: [
              'https://tile.opentopomap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenTopoMap contributors'
          }
        },
        layers: [
          {
            id: 'topo-layer',
            type: 'raster',
            source: 'topo-tiles',
            minzoom: 0,
            maxzoom: 17
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
      console.log('Map clicked at:', e.lngLat.lat, e.lngLat.lng);

      // Check if click target is a photo marker
      const target = e.originalEvent.target as HTMLElement;
      if (target && target.closest('[data-photo-marker]')) {
        console.log('Click on photo marker detected, ignoring map click');
        return;
      }

      setClickedPosition({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng
      });
      console.log('Opening upload modal');
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
            coordinates: track.points.map(point => [point.lon, point.lat])
          }
        }
      ]
    };

    // Wait for map to load
    map.current.on('load', () => {
      if (!map.current) return;

      // Add trail source and layer
      map.current.addSource('trail', {
        type: 'geojson',
        data: geojson
      });

      map.current.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#059669',
          'line-width': 4,
          'line-opacity': 0.8
        }
      });

      // Add trail glow effect
      map.current.addLayer({
        id: 'trail-glow',
        type: 'line',
        source: 'trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#059669',
          'line-width': 8,
          'line-opacity': 0.3,
          'line-blur': 2
        }
      }, 'trail-line');

      // Fit map to trail bounds
      const bounds = new LngLatBounds();
      track.points.forEach(point => {
        bounds.extend([point.lon, point.lat]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    });

    // If map is already loaded, add layers immediately
    if (map.current.isStyleLoaded()) {
      if (map.current.getSource('trail')) {
        map.current.removeLayer('trail-glow');
        map.current.removeLayer('trail-line');
        map.current.removeSource('trail');
      }

      map.current.addSource('trail', {
        type: 'geojson',
        data: geojson
      });

      map.current.addLayer({
        id: 'trail-glow',
        type: 'line',
        source: 'trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#059669',
          'line-width': 8,
          'line-opacity': 0.3,
          'line-blur': 2
        }
      });

      map.current.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#059669',
          'line-width': 4,
          'line-opacity': 0.8
        }
      });

      const bounds = new LngLatBounds();
      track.points.forEach(point => {
        bounds.extend([point.lon, point.lat]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }
  }, [gpxData]);

  // Initialize photos from GPX data
  useEffect(() => {
    if (gpxData?.photos) {
      console.log('Initializing photos from GPX data:', gpxData.photos);
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

    console.log('Adding photo markers via GeoJSON:', photos.length);

    // Create GeoJSON for photos
    const photoGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: photos.map(photo => ({
        type: 'Feature',
        properties: {
          id: photo.id,
          description: photo.description,
          photo: photo.photo
        },
        geometry: {
          type: 'Point',
          coordinates: [photo.lon, photo.lat]
        }
      }))
    };

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

      // (Click handler už není potřeba pro automatické otevírání fotek)
      photoMarkersRef.current.push(marker);
    });

  }, [photos]);

  // Funkce pro otevření fotky, když k ní dojede značka
  const handleArrivedPhoto = (photo: PhotoPoint) => {
    if (!map.current) {
      console.log('Map not available');
      return;
    }

    // Ověř, že mapa je inicializovaná a styl je načtený
    if (!map.current.isStyleLoaded()) {
      console.log('Mapa není připravena!');
      return;
    }

    console.log('handleArrivedPhoto called for photo:', photo.id);
    
    // Uložit původní stav PŘED jakoukoli animací
    const currentCenter = map.current.getCenter();
    const currentZoom = map.current.getZoom();
    
    setOriginalMapState({
      center: [currentCenter.lng, currentCenter.lat],
      zoom: currentZoom
    });

    console.log('Original map state saved:', { center: [currentCenter.lng, currentCenter.lat], zoom: currentZoom });

    const newZoom = Math.min(currentZoom * animationSettings.zoomFactor, 18);

    console.log('Zoomuji na fotku:', photo.lon, photo.lat, newZoom);
    console.log('Starting flyTo animation to:', { lat: photo.lat, lon: photo.lon, zoom: newZoom });

    // Spustit flyTo animaci
    console.log('Calling flyTo...');
    map.current.flyTo({
      center: [photo.lon, photo.lat],
      zoom: newZoom,
      duration: animationSettings.flyToDuration,
      essential: true
    });

    // Použít nastavený timeout pro otevření modalu
    setTimeout(() => {
      console.log('Otevírám modal s fotkou:', photo.id);
      setViewPhoto(photo);
      setIsPhotoViewOpen(true);
    }, animationSettings.modalDelay);
  };

  // Efekt pro “dosažení” fotky při pohybu trasy
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0 || photos.length === 0) return;

    const track = gpxData.tracks[0];
    const pointIndex = Math.floor((currentPosition / 100) * (track.points.length - 1));
    const point = track.points[pointIndex];

    if (!point) return;

    const threshold = animationSettings.threshold;

    // Funkce pro výpočet vzdálenosti v metrech (Haversine)
    const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000; // Poloměr Země v metrech
      const toRadians = (degrees: number) => degrees * (Math.PI / 180);
      
      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // Převod threshold na metry (threshold je nyní v rozsahu 0.001-0.02, převádíme na metry)
    const thresholdMeters = threshold * 100000; // 0.001 = 100m, 0.02 = 2000m

    photos.forEach(photo => {
      const distance = getDistanceMeters(photo.lat, photo.lon, point.lat, point.lon);

      // Otevři modal pouze pokud nebyl pro tuto fotku již otevřen
      if (
        distance < thresholdMeters &&
        !isPhotoViewOpen &&
        lastOpenedPhotoId !== photo.id
      ) {
        setLastOpenedPhotoId(photo.id);
        handleArrivedPhoto(photo);
      }
    });
  }, [currentPosition, gpxData, photos, isPhotoViewOpen, lastOpenedPhotoId, animationSettings.threshold]);

  // VRÁCENÍ ZOOMU PO ZAVŘENÍ FOTKY (upraveno)
  const handlePhotoClose = () => {
    setIsPhotoViewOpen(false);
    setViewPhoto(null);
    setLastOpenedPhotoId(null); // Tím povolíš otevření další fotky!
    if (map.current && originalMapState) {
      map.current.flyTo({
        center: originalMapState.center,
        zoom: originalMapState.zoom,
        duration: animationSettings.zoomBackDuration
      });
      setOriginalMapState(null);
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
      // If current point has elevation, use it directly
      const chartIndex = chartData.findIndex(data => data.originalIndex === currentPointIndex);
      if (chartIndex >= 0) {
        currentChartPoint = chartData[chartIndex];
      }
    } else {
      // Find nearest point with elevation
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