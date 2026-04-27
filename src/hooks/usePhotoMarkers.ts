import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react';
import { Map, Marker } from 'maplibre-gl';
import { GPXData, PhotoPoint, AnimationSettings } from '@/types/gpx';
import { extractPhotoGPS } from '@/utils/exifReader';
import { toast } from 'sonner';

const ANIMATION_DURATION_MS = 10000; // sjednocené s Index.tsx / SharedTrail.tsx

/** Vrátí bod trasy odpovídající sekundě průletu. */
function getTrackPointAtSec(
  triggerSec: number,
  flyDurationSec: number,
  points: { lat: number; lon: number }[]
) {
  if (points.length === 0) return null;
  const ratio = Math.min(1, Math.max(0, triggerSec / Math.max(1, flyDurationSec)));
  const idx = Math.round(ratio * (points.length - 1));
  return points[idx];
}

export function usePhotoMarkers(
  map: MutableRefObject<Map | null>,
  gpxData: GPXData | null,
  photos: PhotoPoint[],
  onAddPhotos: (newPhotos: PhotoPoint[]) => void,
  currentPosition: number,
  animationSettings: AnimationSettings,
  flyingIndex: number | null = null,
  isFlying: boolean = false,
  flyStartTimestamp: number | null = null,
  flyDurationSec: number = 60,
) {
  const [viewPhoto, setViewPhoto] = useState<PhotoPoint | null>(null);
  const [isPhotoViewOpen, setIsPhotoViewOpen] = useState(false);
  const [originalMapState, setOriginalMapState] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const shownPhotosRef = useRef<Set<string>>(new Set());
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const photoMarkersRef = useRef<Marker[]>([]);
  const photoMarkerContainerRef = useRef<Record<string, HTMLDivElement>>({});
  const photoMarkerMapRef = useRef<Record<string, HTMLDivElement>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadCancelRef = useRef(false);
  const pendingQueueRef = useRef<PhotoPoint[]>([]);
  const animationSettingsRef = useRef(animationSettings);
  useEffect(() => { animationSettingsRef.current = animationSettings; }, [animationSettings]);
  const isFlyingRef = useRef(isFlying);
  useEffect(() => { isFlyingRef.current = isFlying; }, [isFlying]);

  // Cancel pending uploads when GPX changes
  useEffect(() => {
    uploadCancelRef.current = true;
    return () => {
      uploadCancelRef.current = false;
    };
  }, [gpxData]);

  // Vykreslení značek fotek na mapě — pozice odpovídá triggerSec na trase
  useEffect(() => {
    if (!map.current) return;

    if (!photos.length) {
      photoMarkersRef.current.forEach(marker => marker.remove());
      photoMarkersRef.current = [];
      photoMarkerMapRef.current = {};
      photoMarkerContainerRef.current = {};
      return;
    }

    photoMarkersRef.current.forEach(marker => marker.remove());
    photoMarkersRef.current = [];
    photoMarkerMapRef.current = {};
    photoMarkerContainerRef.current = {};

    const trackPoints = gpxData && gpxData.tracks.length > 0 ? gpxData.tracks[0].points : [];

    photos.forEach(photo => {
      // Pozice značky: pokud má fotka triggerSec a máme trasu, sedí přesně na trase.
      let lat = photo.lat;
      let lon = photo.lon;
      if (photo.triggerSec !== undefined && trackPoints.length > 0) {
        const p = getTrackPointAtSec(photo.triggerSec, flyDurationSec, trackPoints);
        if (p) { lat = p.lat; lon = p.lon; }
      }

      const container = document.createElement('div');
      container.style.cssText = `display:${isFlying ? 'none' : 'flex'};flex-direction:column;align-items:center;cursor:pointer;width:44px;z-index:10;position:relative;`;
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
        .setLngLat([lon, lat])
        .addTo(map.current!);

      photoMarkersRef.current.push(marker);
      photoMarkerMapRef.current[photo.id] = thumb;
      photoMarkerContainerRef.current[photo.id] = container;
    });
  }, [photos, map, isFlying, gpxData, flyDurationSec]);

  // Skrýt photo markery během 3D průletu
  useEffect(() => {
    Object.values(photoMarkerContainerRef.current).forEach(container => {
      container.style.display = isFlying ? 'none' : 'flex';
    });
  }, [isFlying]);

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

  // Reset zobrazených fotek při návratu na začátek (slider mimo průlet)
  useEffect(() => {
    if (currentPosition < 1 && !isFlying) {
      shownPhotosRef.current.clear();
      pendingQueueRef.current = [];
    }
  }, [currentPosition, isFlying]);

  // Reset při startu nového průletu
  useEffect(() => {
    if (isFlying && flyStartTimestamp !== null) {
      shownPhotosRef.current.clear();
      pendingQueueRef.current = [];
    }
  }, [isFlying, flyStartTimestamp]);

  // Časový trigger — během průletu tikáme přes interval, mimo průlet podle currentPosition
  useEffect(() => {
    if (!map.current || photos.length === 0) return;

    const checkAndQueue = (elapsedSec: number) => {
      photos.forEach(photo => {
        if (photo.triggerSec === undefined) return;
        if (shownPhotosRef.current.has(photo.id)) return;
        if (pendingQueueRef.current.some(p => p.id === photo.id)) return;
        if (elapsedSec >= photo.triggerSec) {
          shownPhotosRef.current.add(photo.id);
          pendingQueueRef.current.push(photo);
        }
      });

      if (!isPhotoViewOpen && activePhotoId === null && pendingQueueRef.current.length > 0) {
        const next = pendingQueueRef.current.shift()!;
        setActivePhotoId(next.id);
        handleArrivedPhotoRef.current(next);
      }
    };

    if (isFlying && flyStartTimestamp !== null) {
      // Tik každých 200 ms — sjednocený zdroj uplynulého času průletu
      const interval = setInterval(() => {
        const elapsedSec = (Date.now() - flyStartTimestamp) / 1000;
        checkAndQueue(elapsedSec);
      }, 200);
      return () => clearInterval(interval);
    } else {
      // Mimo průlet — odvodíme uplynulý čas z currentPosition (0–100 %).
      // ANIMATION_DURATION_MS je délka klasické 2D animace; mapujeme na flyDurationSec,
      // aby se značky a triggery chovaly konzistentně i při náhledu sliderem.
      const elapsedSec = (currentPosition / 100) * flyDurationSec;
      checkAndQueue(elapsedSec);
    }
  }, [photos, isFlying, flyStartTimestamp, currentPosition, flyDurationSec, isPhotoViewOpen, activePhotoId, map]);

  const handlePhotoCloseRef = useRef<() => void>(() => {});
  const handleArrivedPhotoRef = useRef<(p: PhotoPoint) => void>(() => {});

  const handleArrivedPhoto = useCallback((photo: PhotoPoint) => {
    if (!map.current) return;
    if (!map.current.isStyleLoaded()) return;
    const settings = animationSettingsRef.current;
    setOriginalMapState({
      center: [map.current.getCenter().lng, map.current.getCenter().lat],
      zoom: map.current.getZoom(),
    });
    const currentZoom = map.current.getZoom();
    const newZoom = Math.min(currentZoom * settings.zoomFactor, 18);

    // Cíl flyTo: bod na trase odpovídající triggerSec, pokud existuje
    let centerLat = photo.lat;
    let centerLon = photo.lon;
    if (photo.triggerSec !== undefined && gpxData && gpxData.tracks.length > 0) {
      const p = getTrackPointAtSec(photo.triggerSec, flyDurationSec, gpxData.tracks[0].points);
      if (p) { centerLat = p.lat; centerLon = p.lon; }
    }

    setViewPhoto(photo);
    setIsPhotoViewOpen(true);

    map.current.flyTo({
      center: [centerLon, centerLat],
      zoom: newZoom,
      duration: settings.flyToDuration,
      essential: true,
    });

    let delay = settings.autoCloseDelay;
    if (delay <= 0 && isFlyingRef.current) delay = 4000;

    if (delay > 0) {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = setTimeout(() => {
        handlePhotoCloseRef.current();
      }, delay);
    }
  }, [map, gpxData, flyDurationSec]);

  useEffect(() => {
    handleArrivedPhotoRef.current = handleArrivedPhoto;
  }, [handleArrivedPhoto]);

  const handlePhotoClose = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setIsPhotoViewOpen(false);
    setViewPhoto(null);
    setActivePhotoId(null);
    const settings = animationSettingsRef.current;
    if (map.current && originalMapState) {
      map.current.flyTo({
        center: originalMapState.center,
        zoom: originalMapState.zoom,
        duration: settings.zoomBackDuration,
      });
      setOriginalMapState(null);
    }

    if (pendingQueueRef.current.length > 0) {
      const next = pendingQueueRef.current.shift()!;
      setTimeout(() => {
        setActivePhotoId(next.id);
        handleArrivedPhotoRef.current(next);
      }, 80);
    }
  }, [map, originalMapState]);

  useEffect(() => {
    handlePhotoCloseRef.current = handlePhotoClose;
  }, [handlePhotoClose]);

  // Reset fronty při změně GPX/fotek
  useEffect(() => {
    pendingQueueRef.current = [];
    shownPhotosRef.current.clear();
  }, [gpxData, photos.length]);

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
          // Bez GPS — i tak nahrajeme s placeholder pozicí (fotka se umístí podle triggerSec na trase)
          // Pro extractPhotoGPS bez GPS by ale result == null, takže přeskočíme.
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
