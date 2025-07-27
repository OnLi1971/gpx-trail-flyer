import React, { useEffect, useRef } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData } from '@/types/gpx';

interface TrailMapProps {
  gpxData: GPXData | null;
  currentPosition: number;
}

export const TrailMap: React.FC<TrailMapProps> = ({ 
  gpxData, 
  currentPosition
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      zoom: 10,
      center: [14.4, 50.1], // Prague default
    });

    map.current.addControl(
      new NavigationControl({
        visualizePitch: true,
      }),
      'top-right'
    );

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

  return (
    <div className="relative w-full h-96 rounded-lg overflow-hidden shadow-lg">
      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
};