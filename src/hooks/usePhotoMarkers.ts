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
  animationSettings: AnimationSettings,
  flyingIndex: number | null = null,
  isFlying: boolean = false
) {
  const [viewPhoto, setViewPhoto] = useState<PhotoPoint | null>(null);
  const [isPhotoViewOpen, setIsPhotoViewOpen] = useState(false);
  const [originalMapState, setOriginalMapState] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  // (PiP odebráno — fotka se otevírá přímo fullscreen modalem)
  // Sleduje fotky, které už byly v této session zobrazeny — neotevřou se znovu
  const shownPhotosRef = useRef<Set<string>>(new Set());
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const photoMarkersRef = useRef<Marker[]>([]);
  const photoMarkerMapRef = useRef<Record<string, HTMLDivElement>>({});
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
      photoMarkersRef.current.forEach(marker => marker.remove());
      photoMarkersRef.current = [];
      photoMarkerMapRef.current = {};
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
    photoMarkerMapRef.current = {};

    photos.forEach(photo => {
      const container = document.createElement('div');
      container.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;width:44px;z-index:10;position:relative;';
      container.setAttribute('data-photo-marker', 'true');
      container.setAttribute('data-photo-id', photo.id);

      const thumb = document.createElement('div');
      thumb.style.cssText = 'width:44px;height:44px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);overflow:hidden;background:#1e293b;transition:transform 0.2s ease, box-shadow 0.3s ease, border-color 0.3s ease;';

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
      photoMarkerMapRef.current[photo.id] = thumb;
    });
  }, [photos, map]);

  // Pulse glow na aktivní fotce (modal otevřený)
  useEffect(() => {
    Object.entries(photoMarkerMapRef.current).forEach(([id, thumb]) => {
      if (id === activePhotoId) {
        thumb.style.borderColor = 'hsl(var(--primary))';
        thumb.style.boxShadow = '0 0 0 4px hsl(var(--primary) / 0.4), 0 2px 12px hsl(var(--primary) / 0.6)';
        thumb.style.transform = 'scale(1.2)';
      } else {
        thumb.style.borderColor = 'white';
        thumb.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        thumb.style.transform = 'scale(1)';
      }
    });
  }, [activePhotoId, photos]);

  // Reset zobrazených fotek při návratu na začátek
  useEffect(() => {
    if (currentPosition < 1) {
      shownPhotosRef.current.clear();
    }
  }, [currentPosition]);

  // Haversine — přesná vzdálenost v metrech mezi dvěma GPS body
  const distanceMeters = useCallback((a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }, []);

  // Práh příchodu k fotce (m). animationSettings.threshold (stupně) převedeme přibližně na metry,
  // ale držíme tvrdou horní hranici 30 m, aby fotka nikdy neskočila dřív než tracker doopravdy dorazí.
  const arrivalRadiusMeters = useCallback(() => {
    const fromDeg = Math.max(10, animationSettings.threshold * 111000); // 1 deg ≈ 111 km
    return Math.min(40, fromDeg, 30);
  }, [animationSettings.threshold]);

  // Sjednocená detekce: použije se pro live (currentPosition) i pro 3D průlet (flyingIndex)
  useEffect(() => {
    if (!map.current || !gpxData || gpxData.tracks.length === 0 || photos.length === 0) return;
    if (isPhotoViewOpen || activePhotoId !== null) return;

    const track = gpxData.tracks[0];
    let pointIndex: number;
    if (isFlying && flyingIndex !== null) {
      pointIndex = flyingIndex;
    } else {
      pointIndex = Math.floor((currentPosition / 100) * (track.points.length - 1));
    }
    const point = track.points[pointIndex];
    if (!point) return;

    const radius = arrivalRadiusMeters();

    // Najdi nejbližší ještě nezobrazenou fotku v okruhu
    let arrived: { photo: PhotoPoint; dist: number } | null = null;
    photos.forEach(photo => {
      if (shownPhotosRef.current.has(photo.id)) return;
      const dist = distanceMeters(photo, point);
      if (dist <= radius && (!arrived || dist < arrived.dist)) {
        arrived = { photo, dist };
      }
    });

    if (arrived) {
      shownPhotosRef.current.add(arrived.photo.id);
      setActivePhotoId(arrived.photo.id);
      handleArrivedPhoto(arrived.photo);
    }
  }, [currentPosition, flyingIndex, isFlying, gpxData, photos, isPhotoViewOpen, activePhotoId, distanceMeters, arrivalRadiusMeters]);

  const handlePhotoCloseRef = useRef<() => void>(() => {});

  const handleArrivedPhoto = useCallback((photo: PhotoPoint) => {
    if (!map.current) return;
    if (!map.current.isStyleLoaded()) return;
    setOriginalMapState({
      center: [map.current.getCenter().lng, map.current.getCenter().lat],
      zoom: map.current.getZoom(),
    });
    const currentZoom = map.current.getZoom();
    const newZoom = Math.min(currentZoom * animationSettings.zoomFactor, 18);

    // Otevřít modal okamžitě (tracker už je u fotky díky Haversine prahu)
    setViewPhoto(photo);
    setIsPhotoViewOpen(true);

    // Plynule zoomnout na fotku
    map.current.flyTo({
      center: [photo.lon, photo.lat],
      zoom: newZoom,
      duration: animationSettings.flyToDuration,
      essential: true,
    });

    // Auto-close timer běží od TEĎ — fotka je vidět celé 4 s
    if (animationSettings.autoCloseDelay > 0) {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        handlePhotoCloseRef.current();
      }, animationSettings.autoCloseDelay);
    }
  }, [map, animationSettings]);

  const handlePhotoClose = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
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

  // Synchronizace ref s nejnovější verzí callbacku
  useEffect(() => {
    handlePhotoCloseRef.current = handlePhotoClose;
  }, [handlePhotoClose]);

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
