import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react';
import { Map, Marker } from 'maplibre-gl';
import { GPXData, PhotoPoint, AnimationSettings } from '@/types/gpx';
import { extractPhotoGPS } from '@/utils/exifReader';
import { toast } from 'sonner';

export function usePhotoMarkers(
  map: MutableRefObject<Map | null>,
  gpxData: GPXData | null,
  photos: PhotoPoint[],
  onAddPhotos: (newPhotos: PhotoPoint[]) => void,
  currentPosition: number,
  animationSettings: AnimationSettings
) {
  const [viewPhoto, setViewPhoto] = useState<PhotoPoint | null>(null);
  const [isPhotoViewOpen, setIsPhotoViewOpen] = useState(false);
  const [originalMapState, setOriginalMapState] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);

  const photoMarkersRef = useRef<Marker[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCancelRef = useRef(false);

  // Cancel pending uploads when GPX changes
  useEffect(() => {
    uploadCancelRef.current = true;
    return () => {
      uploadCancelRef.current = false;
    };
  }, [gpxData]);

  // Create photo markers on map
  useEffect(() => {
    if (!map.current) return;

    if (!photos.length) {
      if (map.current.getLayer('photo-markers')) {
        map.current.removeLayer('photo-markers');
      }
      if (map.current.getSource('photo-markers')) {
        map.current.removeSource('photo-markers');
      }
      return;
    }

    if (map.current.getLayer('photo-icons')) {
      map.current.removeLayer('photo-icons');
    }
    if (map.current.getLayer('photo-markers')) {
      map.current.removeLayer('photo-markers');
    }
    if (map.current.getSource('photo-markers')) {
      map.current.removeSource('photo-markers');
    }

    photoMarkersRef.current.forEach(marker => marker.remove());
    photoMarkersRef.current = [];

    photos.forEach(photo => {
      const container = document.createElement('div');
      container.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;';
      container.setAttribute('data-photo-marker', 'true');
      container.setAttribute('data-photo-id', photo.id);

      const thumb = document.createElement('div');
      thumb.style.cssText = 'width:44px;height:44px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);overflow:hidden;background:#1e293b;transition:transform 0.2s ease;';

      const img = document.createElement('img');
      img.src = photo.photo;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.draggable = false;
      thumb.appendChild(img);

      const pole = document.createElement('div');
      pole.style.cssText = 'width:2px;height:16px;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);';

      const dot = document.createElement('div');
      dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.3);';

      container.appendChild(thumb);
      container.appendChild(pole);
      container.appendChild(dot);

      container.addEventListener('mouseenter', () => {
        thumb.style.transform = 'scale(1.3)';
      });
      container.addEventListener('mouseleave', () => {
        thumb.style.transform = 'scale(1)';
      });

      if (photo.description) {
        container.title = photo.description;
      }

      const marker = new Marker({ element: container, anchor: 'bottom' })
        .setLngLat([photo.lon, photo.lat])
        .addTo(map.current!);

      photoMarkersRef.current.push(marker);
    });
  }, [photos, map]);

  // Auto-open photo when animation arrives near it
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

  const handleArrivedPhoto = useCallback((photo: PhotoPoint) => {
    if (!map.current) return;
    if (!map.current.isStyleLoaded()) return;
    setOriginalMapState({
      center: [map.current.getCenter().lng, map.current.getCenter().lat],
      zoom: map.current.getZoom(),
    });
    const currentZoom = map.current.getZoom();
    const newZoom = Math.min(currentZoom * animationSettings.zoomFactor, 18);
    map.current.flyTo({
      center: [photo.lon, photo.lat],
      zoom: newZoom,
      duration: animationSettings.flyToDuration,
      essential: true,
    });
    setTimeout(() => {
      setViewPhoto(photo);
      setIsPhotoViewOpen(true);
    }, animationSettings.modalDelay);
  }, [map, animationSettings]);

  const handlePhotoClose = useCallback(() => {
    setIsPhotoViewOpen(false);
    setViewPhoto(null);
    setActivePhotoId(null);
    if (map.current && originalMapState) {
      map.current.flyTo({
        center: originalMapState.center,
        zoom: originalMapState.zoom,
        duration: animationSettings.zoomBackDuration,
      });
      setOriginalMapState(null);
    }
  }, [map, originalMapState, animationSettings.zoomBackDuration]);

  const handleBulkPhotoUpload = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files);
    toast.info(`Zpracovávám ${fileArray.length} fotek...`);
    uploadCancelRef.current = false;
    const newPhotos: PhotoPoint[] = [];
    const skippedNames: string[] = [];

    const BATCH_SIZE = 3;
    for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
      if (uploadCancelRef.current) break;
      const batch = fileArray.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(file => extractPhotoGPS(file)));
      if (uploadCancelRef.current) break;

      results.forEach((result, idx) => {
        const file = batch[idx];
        if (result) {
          newPhotos.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            lat: result.lat,
            lon: result.lon,
            photo: result.thumbnail,
            description: file.name.replace(/\.[^.]+$/, ''),
            timestamp: result.timestamp ?? Date.now(),
          });
        } else {
          skippedNames.push(file.name);
        }
      });
    }

    if (uploadCancelRef.current) return;

    if (newPhotos.length > 0) {
      onAddPhotos(newPhotos);
      toast.success(`Přidáno ${newPhotos.length} fotek na mapu`);
    }

    if (skippedNames.length > 0) {
      toast.warning(`${skippedNames.length} fotek nemá GPS a byly přeskočeny`);
    }

    if (newPhotos.length === 0 && skippedNames.length > 0) {
      toast.error('Žádná z vybraných fotek nemá GPS souřadnice');
    }
  }, [onAddPhotos]);

  const triggerUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return {
    viewPhoto,
    isPhotoViewOpen,
    handlePhotoClose,
    handleBulkPhotoUpload,
    fileInputRef,
    triggerUpload,
  };
}
