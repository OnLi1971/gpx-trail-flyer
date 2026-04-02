import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Map, NavigationControl, Marker, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { PhotoViewModal } from './PhotoViewModal';
import { Mountain, Play, Square, RotateCcw, ZoomIn, TrendingUp, ArrowUp, ArrowDown, Minus, Camera } from 'lucide-react';
import { extractPhotoGPS } from '@/utils/exifReader';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';
import { AnimationSettings } from '@/types/gpx';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { fetchPeaksAndPlaces, filterPOIsNearTrack } from '@/utils/overpassApi';
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
  animationSettings
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const flyMarkerRef = useRef<Marker | null>(null);
  const photoMarkersRef = useRef<Marker[]>([]);
  const poiMarkersRef = useRef<Marker[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [viewPhoto, setViewPhoto] = useState<PhotoPoint | null>(null);
  const [isPhotoViewOpen, setIsPhotoViewOpen] = useState(false);
  const [originalMapState, setOriginalMapState] = useState<{center: [number, number], zoom: number} | null>(null);
  const [mapPitch, setMapPitch] = useState(0);
  const [isFlying, setIsFlying] = useState(false);
  const [flySpeed, setFlySpeed] = useState(50); // 1-100, lower = slower
  const [flyRotation, setFlyRotation] = useState(50); // 0-100, how much bearing changes
  const [flyZoom, setFlyZoom] = useState(15); // 10-18, zoom level during flythrough
  const [elevationExaggeration, setElevationExaggeration] = useState(1.5); // 1-5, multiplier for elevation display
  const [flyingIndex, setFlyingIndex] = useState<number | null>(null); // Current index during flythrough
  const [currentGrade, setCurrentGrade] = useState<number | null>(null); // Current grade in % during flythrough
  const flyAnimationRef = useRef<number | null>(null);
  const flySpeedRef = useRef(50);
  const flyRotationRef = useRef(50);
  const flyZoomRef = useRef(15);
  const elevationExaggerationRef = useRef(1.5);
  const lastBearingRef = useRef(0);

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
          },
          'terrain-dem': {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 15,
            encoding: 'terrarium'
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
        ],
        terrain: {
          source: 'terrain-dem',
          exaggeration: 1.5
        }
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

    // Create photo thumbnail markers with pole design
    photos.forEach(photo => {
      const container = document.createElement('div');
      container.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
      container.setAttribute('data-photo-marker', 'true');
      container.setAttribute('data-photo-id', photo.id);

      // Thumbnail circle
      const thumb = document.createElement('div');
      thumb.style.cssText = 'width:44px;height:44px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);overflow:hidden;background:#1e293b;transition:transform 0.2s ease;';
      
      const img = document.createElement('img');
      img.src = photo.photo;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.draggable = false;
      thumb.appendChild(img);

      // Pole (vertical line)
      const pole = document.createElement('div');
      pole.style.cssText = 'width:2px;height:16px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);';

      // Dot at bottom
      const dot = document.createElement('div');
      dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);';

      container.appendChild(thumb);
      container.appendChild(pole);
      container.appendChild(dot);

      // Hover effect
      container.addEventListener('mouseenter', () => {
        thumb.style.transform = 'scale(1.3)';
      });
      container.addEventListener('mouseleave', () => {
        thumb.style.transform = 'scale(1)';
      });

      // Tooltip with description
      if (photo.description) {
        container.title = photo.description;
      }

      const marker = new Marker({ element: container, anchor: 'bottom' })
        .setLngLat([photo.lon, photo.lat])
        .addTo(map.current!);

      photoMarkersRef.current.push(marker);
    });

  }, [photos]);

  // Fetch and render POI markers (peaks + places) from Overpass API
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;

    const track = gpxData.tracks[0];
    if (track.points.length === 0) return;

    // Wait for map style to be loaded
    const loadPOIs = async () => {
      try {
        const pois = await fetchPeaksAndPlaces(gpxData.bounds);
        const nearbyPois = filterPOIsNearTrack(pois, track.points, 2);

        // Clean up previous POI markers
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
              <div style="
                width: 2px;
                height: 20px;
                background: #b45309;
                opacity: 0.6;
              "></div>
              <div style="
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #b45309;
              "></div>
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

  // Calculate grade (slope) between two points in percentage
  const calculateGrade = (start: { lat: number; lon: number; ele?: number }, end: { lat: number; lon: number; ele?: number }) => {
    if (start.ele === undefined || end.ele === undefined) return null;
    
    // Calculate horizontal distance using Haversine formula (in meters)
    const R = 6371000; // Earth's radius in meters
    const dLat = (end.lat - start.lat) * Math.PI / 180;
    const dLon = (end.lon - start.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const horizontalDistance = R * c;
    
    if (horizontalDistance < 1) return null; // Too close to calculate
    
    const elevationDiff = end.ele - start.ele;
    const grade = (elevationDiff / horizontalDistance) * 100;
    
    return Math.round(grade * 10) / 10; // Round to 1 decimal
  };

  // Start 3D flythrough animation
  const startFlythrough = () => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0) return;
    
    const track = gpxData.tracks[0];
    if (track.points.length < 2) return;

    setIsFlying(true);
    setFlyingIndex(0);
    let currentIndex = 0;
    const totalPoints = track.points.length;

    const animateStep = () => {
      if (!map.current || currentIndex >= totalPoints - 1) {
        stopFlythrough();
        return;
      }

      // Use ref for real-time speed updates
      const speed = flySpeedRef.current;
      // Step size: 1 at slowest, up to 5 at fastest
      const step = Math.max(1, Math.floor(speed / 20));
      // Duration: 800ms at slowest (speed=1), 50ms at fastest (speed=100)
      const duration = Math.max(50, 800 - (speed * 7.5));

      const currentPoint = track.points[currentIndex];
      const nextIndex = Math.min(currentIndex + step, totalPoints - 1);
      const nextPoint = track.points[nextIndex];
      
      const targetBearing = calculateBearing(currentPoint, nextPoint);
      
      // Smooth bearing based on rotation setting (0 = no rotation, 100 = full rotation)
      const rotationFactor = flyRotationRef.current / 100;
      let smoothBearing = lastBearingRef.current;
      
      if (rotationFactor > 0) {
        // Calculate shortest rotation direction
        let diff = targetBearing - lastBearingRef.current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        smoothBearing = lastBearingRef.current + diff * rotationFactor * 0.3;
        // Normalize to 0-360
        smoothBearing = ((smoothBearing % 360) + 360) % 360;
      }
      lastBearingRef.current = smoothBearing;
      
      // Use constant pitch from slider
      const targetPitch = mapPitch;

      map.current.easeTo({
        center: [currentPoint.lon, currentPoint.lat],
        bearing: smoothBearing,
        pitch: targetPitch,
        zoom: flyZoomRef.current,
        duration: duration,
        easing: (t) => t
      });

      setMapPitch(Math.round(targetPitch));
      currentIndex = nextIndex;
      setFlyingIndex(currentIndex); // Update position for elevation chart
      
      // Calculate and update current grade
      const grade = calculateGrade(currentPoint, nextPoint);
      setCurrentGrade(grade);
      
      // Update flying marker position on map
      if (flyMarkerRef.current) {
        flyMarkerRef.current.setLngLat([currentPoint.lon, currentPoint.lat]);
      } else {
        // Create flying marker with cyclist icon
        const markerElement = document.createElement('div');
        markerElement.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18.5" cy="17.5" r="3.5"/>
            <circle cx="5.5" cy="17.5" r="3.5"/>
            <circle cx="15" cy="5" r="1"/>
            <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
          </svg>
        `;
        markerElement.style.color = '#ef4444';
        markerElement.style.filter = 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.8))';
        flyMarkerRef.current = new Marker({ element: markerElement })
          .setLngLat([currentPoint.lon, currentPoint.lat])
          .addTo(map.current!);
      }
      
      // Schedule next frame with delay based on speed
      setTimeout(() => {
        flyAnimationRef.current = requestAnimationFrame(animateStep);
      }, duration * 0.8);
    };

    // Initial setup - zoom to start
    const startPoint = track.points[0];
    const initialStep = Math.max(1, Math.floor(flySpeedRef.current / 20));
    const secondPoint = track.points[Math.min(initialStep, totalPoints - 1)];
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
    setFlyingIndex(null);
    setCurrentGrade(null);
    
    // Remove flying marker
    if (flyMarkerRef.current) {
      flyMarkerRef.current.remove();
      flyMarkerRef.current = null;
    }
    
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

  const handleBulkPhotoUpload = async (files: FileList) => {
    toast.info(`Zpracovávám ${files.length} fotek...`);
    const newPhotos: PhotoPoint[] = [];
    const skippedNames: string[] = [];

    for (const file of Array.from(files)) {
      const result = await extractPhotoGPS(file);
      if (result) {
        newPhotos.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          lat: result.lat,
          lon: result.lon,
          photo: result.thumbnail,
          description: file.name.replace(/\.[^.]+$/, ''),
          timestamp: result.timestamp || Date.now(),
        });
      } else {
        skippedNames.push(file.name);
      }
    }

    if (newPhotos.length > 0) {
      onAddPhotos(newPhotos);
      toast.success(`Přidáno ${newPhotos.length} fotek na mapu`);
    }

    if (skippedNames.length > 0) {
      console.warn('Fotky bez GPS:', skippedNames);
      toast.warning(`${skippedNames.length} z ${files.length} fotek nemá GPS souřadnice a byly přeskočeny`);
    }

    if (newPhotos.length === 0 && skippedNames.length > 0) {
      toast.error('Žádná z vybraných fotek nemá GPS souřadnice');
    }
  };

  // Prepare elevation chart data
  const getElevationData = () => {
    if (!gpxData || gpxData.tracks.length === 0) return { chartData: [], currentChartPoint: null, photosOnChart: [] };

    const track = gpxData.tracks[0];
    const pointsWithElevation = track.points.filter(point => point.ele !== undefined);

    if (pointsWithElevation.length === 0) return { chartData: [], currentChartPoint: null, photosOnChart: [] };

    // Calculate base elevation for exaggeration (minimum elevation as reference)
    const baseElevation = Math.min(...pointsWithElevation.map(p => p.ele!));

    // Prepare chart data with distance in kilometers and exaggerated elevation
    const chartData = pointsWithElevation.map((point, index) => {
      const originalEle = point.ele!;
      // Apply exaggeration: base + (difference from base * exaggeration factor)
      const exaggeratedEle = baseElevation + (originalEle - baseElevation) * elevationExaggeration;
      return {
        distance: (index / (pointsWithElevation.length - 1)) * (track.totalDistance / 1000),
        elevation: exaggeratedEle,
        originalElevation: originalEle,
        originalIndex: track.points.indexOf(point)
      };
    });

    // Calculate current position in chart data based on actual track position or flying index
    const totalPoints = track.points.length;
    const currentPointIndex = flyingIndex !== null 
      ? flyingIndex 
      : Math.floor((currentPosition / 100) * (totalPoints - 1));
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
        <div className="relative w-full h-[500px]">
          <div ref={mapContainer} className="absolute inset-0" />
          <div className="absolute top-2 left-2 z-10">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleBulkPhotoUpload(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              className="gap-2 shadow-md"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4" />
              Přidat fotky
            </Button>
          </div>
        </div>
        
        {/* 3D Controls - outside map */}
        <div className="bg-muted/50 border-t p-4 space-y-3">
          {/* Pitch slider */}
          <div className="flex items-center gap-3">
            <Mountain className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-20">3D náklon</span>
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
            <span className="text-xs text-muted-foreground w-10 text-right">{mapPitch}°</span>
          </div>
          
          {gpxData && (
            <>
              {/* Speed slider */}
              <div className="flex items-center gap-3">
                <Play className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Rychlost</span>
                <Slider
                  value={[flySpeed]}
                  onValueChange={(value) => {
                    setFlySpeed(value[0]);
                    flySpeedRef.current = value[0];
                  }}
                  min={1}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{flySpeed}%</span>
              </div>
              
              {/* Rotation slider */}
              <div className="flex items-center gap-3">
                <RotateCcw className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Rotace</span>
                <Slider
                  value={[flyRotation]}
                  onValueChange={(value) => {
                    setFlyRotation(value[0]);
                    flyRotationRef.current = value[0];
                  }}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{flyRotation}%</span>
              </div>
              
              {/* Zoom slider */}
              <div className="flex items-center gap-3">
                <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Zoom</span>
                <Slider
                  value={[flyZoom]}
                  onValueChange={(value) => {
                    setFlyZoom(value[0]);
                    flyZoomRef.current = value[0];
                  }}
                  min={10}
                  max={18}
                  step={0.5}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{flyZoom}</span>
              </div>
              
              {/* Elevation exaggeration slider */}
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground w-20">Zvýraznění</span>
                <Slider
                  value={[elevationExaggeration]}
                  onValueChange={(value) => {
                    setElevationExaggeration(value[0]);
                    elevationExaggerationRef.current = value[0];
                    // Update terrain exaggeration in real-time
                    if (map.current) {
                      map.current.setTerrain({ source: 'terrain-dem', exaggeration: value[0] });
                    }
                  }}
                  min={1}
                  max={5}
                  step={0.1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-10 text-right">{elevationExaggeration}×</span>
              </div>
              
              
              {/* Flythrough button and grade indicator */}
              <div className="flex items-center justify-center gap-4 pt-2">
                <Button
                  size="sm"
                  variant={isFlying ? "destructive" : "default"}
                  onClick={isFlying ? stopFlythrough : startFlythrough}
                  className="gap-2"
                >
                  {isFlying ? (
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
                
                {/* Grade indicator - only visible during flythrough */}
                {isFlying && currentGrade !== null && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-medium text-sm ${
                    currentGrade > 2 
                      ? 'bg-red-100 text-red-700' 
                      : currentGrade < -2 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-gray-100 text-gray-700'
                  }`}>
                    {currentGrade > 1 ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : currentGrade < -1 ? (
                      <ArrowDown className="w-4 h-4" />
                    ) : (
                      <Minus className="w-4 h-4" />
                    )}
                    <span>{currentGrade > 0 ? '+' : ''}{currentGrade}%</span>
                  </div>
                )}
              </div>
            </>
          )}
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
      
      
      <PhotoViewModal
        photo={viewPhoto}
        isOpen={isPhotoViewOpen}
        onClose={handlePhotoClose}
      />
    </>
  );
};