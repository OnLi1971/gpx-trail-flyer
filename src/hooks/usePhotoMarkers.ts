import { useState, useRef, useEffect, useCallback, MutableRefObject } from 'react';
import { Map, Marker } from 'maplibre-gl';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { extractPhotoGPS } from '@/utils/exifReader';
import { toast } from 'sonner';

/** Haversine vzdálenost v metrech. */
function haversineM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Pole kumulované vzdálenosti (km) pro každý bod trasy. */
function buildCumulativeKm(points: { lat: number; lon: number }[]): number[] {
  const out: number[] = new Array(points.length).fill(0);
  for (let i = 1; i < points.length; i++) {
    out[i] = out[i - 1] + haversineM(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon) / 1000;
  }
  return out;
}

/** Najdi index bodu trasy nejbližší dané vzdálenosti v km (binární vyhledávání). */
function indexAtKm(cumKm: number[], targetKm: number): number {
  if (cumKm.length === 0) return 0;
  if (targetKm <= 0) return 0;
  if (targetKm >= cumKm[cumKm.length - 1]) return cumKm.length - 1;
  let lo = 0, hi = cumKm.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumKm[mid] < targetKm) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Fotky jako statické POI markery — kartička na tyčce nad bodem trasy
 * odpovídajícím triggerKm. Viditelné vždy (i během 3D průletu),
 * MapLibre Marker drží svou geo-pozici. Klik = otevření modalu.
 */
export function usePhotoMarkers(
  map: MutableRefObject<Map | null>,
  gpxData: GPXData | null,
  photos: PhotoPoint[],
  onAddPhotos: (newPhotos: PhotoPoint[]) => void,
) {
  const [viewPhoto, setViewPhoto] = useState<PhotoPoint | null>(null);
  const [isPhotoViewOpen, setIsPhotoViewOpen] = useState(false);

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

  const trackPoints = gpxData && gpxData.tracks.length > 0 ? gpxData.tracks[0].points : [];
  const totalKm = gpxData && gpxData.tracks.length > 0 ? gpxData.tracks[0].totalDistance / 1000 : 0;

  // Kumulovaná vzdálenost pro každý bod
  const cumKmRef = useRef<number[]>([]);
  useEffect(() => {
    cumKmRef.current = buildCumulativeKm(trackPoints);
  }, [gpxData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vykreslení statických markerů fotek — styl jako POI vrcholy
  useEffect(() => {
    if (!map.current) return;

    // Cleanup
    photoMarkersRef.current.forEach(marker => marker.remove());
    photoMarkersRef.current = [];

    if (!photos.length) return;

    const cumKm = cumKmRef.current;

    photos.forEach(photo => {
      // Pozice markeru: snap na trasu podle triggerKm (jinak originální GPS)
      let lat = photo.lat;
      let lon = photo.lon;
      if (photo.triggerKm !== undefined && trackPoints.length > 0 && cumKm.length > 0) {
        const idx = indexAtKm(cumKm, photo.triggerKm);
        const p = trackPoints[idx];
        if (p) { lat = p.lat; lon = p.lon; }
      }

      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:none;z-index:6;';
      el.setAttribute('data-photo-marker', 'true');
      el.setAttribute('data-photo-id', photo.id);

      // Karta (obdélník: miniatura + popis) — styl jako peak POI
      const card = document.createElement('div');
      card.style.cssText = [
        'background:rgba(255,255,255,0.97)',
        'border:2px solid hsl(217 91% 60%)',
        'border-radius:8px',
        'padding:3px 8px 3px 3px',
        'display:flex',
        'align-items:center',
        'gap:6px',
        'box-shadow:0 2px 6px rgba(0,0,0,0.25)',
        'pointer-events:auto',
        'cursor:pointer',
        'max-width:200px',
        'transition:transform 0.15s ease, box-shadow 0.15s ease',
      ].join(';');

      const thumb = document.createElement('div');
      thumb.style.cssText = 'width:32px;height:32px;border-radius:4px;overflow:hidden;background:#1e293b;flex-shrink:0;';
      const img = document.createElement('img');
      img.src = photo.photo;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      img.draggable = false;
      thumb.appendChild(img);

      const label = document.createElement('div');
      label.style.cssText = 'font-size:11px;font-weight:600;color:hsl(222 47% 20%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;';
      label.textContent = photo.description || 'Fotka';

      card.appendChild(thumb);
      card.appendChild(label);

      // Tyčka + tečka na trase
      const pole = document.createElement('div');
      pole.style.cssText = 'width:2px;height:28px;background:linear-gradient(to bottom, hsl(217 91% 60%), hsl(217 91% 40%));';

      const dot = document.createElement('div');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:hsl(217 91% 40%);box-shadow:0 1px 3px rgba(0,0,0,0.4);';

      el.appendChild(card);
      el.appendChild(pole);
      el.appendChild(dot);

      // Hover + klik
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'scale(1.05)';
        card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'scale(1)';
        card.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
      });
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        setViewPhoto(photo);
        setIsPhotoViewOpen(true);
      });

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([lon, lat])
        .addTo(map.current!);

      photoMarkersRef.current.push(marker);
    });
  }, [photos, map, gpxData]);

  const handlePhotoClose = useCallback(() => {
    setIsPhotoViewOpen(false);
    setViewPhoto(null);
  }, []);

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
    totalKm,
  };
}
