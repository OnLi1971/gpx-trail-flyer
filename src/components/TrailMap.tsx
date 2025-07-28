import React, { useEffect, useRef, useState } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { PhotoUploadModal } from './PhotoUploadModal';
import { Camera } from 'lucide-react';

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
  const [photos, setPhotos] = useState<PhotoPoint[]>(gpxData?.photos || []);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: [
              'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
              'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
              'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
          }
        },
        layers: [
          {
            id: 'simple-tiles',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 22
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

    // Create new marker with custom styling
    const markerElement = document.createElement('div');
    markerElement.className = 'w-4 h-4 bg-trail-active rounded-full border-2 border-white shadow-lg animate-pulse';
    
    markerRef.current = new Marker(markerElement)
      .setLngLat([point.lon, point.lat])
      .addTo(map.current);

  }, [currentPosition, gpxData]);

  // Effect for photo markers
  useEffect(() => {
    if (!map.current || !photos.length) return;

    // Clear existing photo markers
    photoMarkersRef.current.forEach(marker => marker.remove());
    photoMarkersRef.current = [];

    // Add photo markers
    photos.forEach(photo => {
      const photoElement = document.createElement('div');
      photoElement.className = 'w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-lg cursor-pointer hover:scale-110 transition-transform flex items-center justify-center';
      photoElement.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M9 2C8.44772 2 8 2.44772 8 3V4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 18 19.1046 18 18V6C18 4.89543 17.1046 4 16 4H14V3C14 2.44772 13.5523 2 13 2H9ZM11 8C12.6569 8 14 9.34315 14 11C14 12.6569 12.6569 14 11 14C9.34315 14 8 12.6569 8 11C8 9.34315 9.34315 8 11 8Z"/></svg>`;

      photoElement.addEventListener('click', (e) => {
        e.stopPropagation();
        // Show photo popup
        const popup = document.createElement('div');
        popup.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        popup.innerHTML = `
          <div class="bg-white rounded-lg p-4 max-w-md max-h-96 overflow-auto">
            <img src="${photo.photo}" alt="${photo.description}" class="w-full h-48 object-cover rounded mb-2">
            <p class="text-sm text-gray-700">${photo.description}</p>
            <button class="mt-2 px-3 py-1 bg-gray-200 rounded text-sm">Zavřít</button>
          </div>
        `;
        popup.addEventListener('click', () => popup.remove());
        document.body.appendChild(popup);
      });

      const marker = new Marker(photoElement)
        .setLngLat([photo.lon, photo.lat])
        .addTo(map.current!);

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
    </>
  );
};