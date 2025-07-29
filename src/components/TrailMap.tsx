import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { PhotoUploadModal } from './PhotoUploadModal';
import { PhotoViewModal } from './PhotoViewModal';
import { Bike } from 'lucide-react';

interface TrailMapProps {
  gpxData: GPXData | null;
  currentPosition: number;
  onPhotosUpdate?: (photos: PhotoPoint[]) => void;
}

export const TrailMap: React.FC<TrailMapProps> = ({ 
  gpxData, 
  currentPosition,
  onPhotosUpdate
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

    // Create new marker
    const markerElement = document.createElement('div');
    markerElement.className = 'w-4 h-4 bg-trail-active rounded-full border-2 border-white shadow-lg';
    
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
      
      // Add click handler
      markerElement.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Photo marker clicked:', photo.id);
        setViewPhoto(photo);
        setIsPhotoViewOpen(true);
      });
      
      photoMarkersRef.current.push(marker);
    });


  }, [photos]);


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


  return (
    <>
      <div className="relative w-full h-96 rounded-lg overflow-hidden shadow-lg">
        <div ref={mapContainer} className="absolute inset-0" />
        <div className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm rounded-md px-2 py-1 text-xs text-gray-600">
          Klikněte na mapu pro přidání fotky
        </div>
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
        onClose={() => setIsPhotoViewOpen(false)}
      />
    </>
  );
};