import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppHeader } from '@/components/AppHeader';
import { TrailMap, PoiSettings } from '@/components/TrailMap';
import { AnimationControls } from '@/components/AnimationControls';
import { GPXData, PhotoPoint, defaultAnimationSettings, AnimationSettings } from '@/types/gpx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mountain, Save, Trash2, Image as ImageIcon, Settings2, Check } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const ANIMATION_DURATION = 10000;

async function toBlob(src: string): Promise<Blob> {
  const res = await fetch(src);
  return await res.blob();
}

export default function SharedTrail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [trailId, setTrailId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [photos, setPhotos] = useState<PhotoPoint[]>([]);
  // IDs fotek, které už jsou v DB (vše ostatní je nově přidané)
  const [savedPhotoIds, setSavedPhotoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [animationSettings, setAnimationSettings] = useState<AnimationSettings>(defaultAnimationSettings);

  // POI nastavení – načtené z DB a aktuálně držené
  const [initialPoi, setInitialPoi] = useState<PoiSettings | null>(null);
  const [currentPoi, setCurrentPoi] = useState<PoiSettings | null>(null);
  const [savedPoi, setSavedPoi] = useState<PoiSettings | null>(null);
  const [savingPoi, setSavingPoi] = useState(false);

  const isOwner = !!user && !!ownerId && user.id === ownerId;

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: trail, error: tErr } = await supabase
        .from('trails')
        .select('id, name, gpx_data, user_id, peak_limit, place_limit, peak_selection_mode, selected_peak_keys')
        .eq('slug', slug)
        .maybeSingle();

      if (tErr || !trail) {
        setError('Trasa nebyla nalezena nebo není veřejná.');
        setLoading(false);
        return;
      }

      setTrailId(trail.id);
      setOwnerId(trail.user_id);
      setName(trail.name);
      setGpxData(trail.gpx_data as unknown as GPXData);

      const { data: photoRows } = await supabase
        .from('trail_photos')
        .select('id, photo_url, description, lat, lon, photo_timestamp')
        .eq('trail_id', trail.id);

      const loaded = (photoRows || []).map((p) => ({
        id: p.id,
        lat: p.lat,
        lon: p.lon,
        photo: p.photo_url,
        description: p.description || '',
        timestamp: Number(p.photo_timestamp),
      }));
      setPhotos(loaded);
      setSavedPhotoIds(new Set(loaded.map((p) => p.id)));
      setLoading(false);
    })();
  }, [slug]);

  const handlePlayPause = useCallback(() => {
    if (!isPlaying) setStartTime(Date.now() - (currentPosition / 100) * ANIMATION_DURATION);
    setIsPlaying(!isPlaying);
  }, [isPlaying, currentPosition]);

  const handleReset = useCallback(() => {
    setCurrentPosition(0);
    setIsPlaying(false);
    setStartTime(null);
  }, []);

  const handlePositionChange = useCallback((p: number) => {
    setCurrentPosition(p);
    if (isPlaying) setStartTime(Date.now() - (p / 100) * ANIMATION_DURATION);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || !startTime) return;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / ANIMATION_DURATION) * 100, 100);
      setCurrentPosition(progress);
      if (progress >= 100) { setIsPlaying(false); setStartTime(null); }
    };
    const f = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(f);
  }, [isPlaying, startTime, currentPosition]);

  const newPhotosCount = photos.filter((p) => !savedPhotoIds.has(p.id)).length;

  const handleSaveChanges = async () => {
    if (!isOwner || !trailId || !user) return;
    const newOnes = photos.filter((p) => !savedPhotoIds.has(p.id));
    if (newOnes.length === 0) {
      toast.info('Žádné nové fotky k uložení');
      return;
    }
    setSaving(true);
    try {
      const uploaded: Array<{ trail_id: string; photo_url: string; description: string; lat: number; lon: number; photo_timestamp: number }> = [];
      for (let i = 0; i < newOnes.length; i++) {
        const p = newOnes[i];
        try {
          const blob = await toBlob(p.photo);
          const ext = blob.type.split('/')[1]?.split('+')[0] || 'jpg';
          const path = `${user.id}/${trailId}/${p.id}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('trail-photos')
            .upload(path, blob, { contentType: blob.type, upsert: true });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage.from('trail-photos').getPublicUrl(path);
          uploaded.push({
            trail_id: trailId,
            photo_url: pub.publicUrl,
            description: p.description,
            lat: p.lat,
            lon: p.lon,
            photo_timestamp: p.timestamp,
          });
        } catch (err) {
          console.error('Photo upload failed:', err);
          toast.error(`Nepodařilo se nahrát fotku ${i + 1}`);
        }
      }
      if (uploaded.length > 0) {
        const { data: inserted, error } = await supabase
          .from('trail_photos')
          .insert(uploaded)
          .select('id, photo_url');
        if (error) throw error;
        // Nahradit lokální dočasné fotky DB záznamy (aby se příště nenahrávaly znovu)
        const insertedIds = new Set((inserted || []).map((x) => x.id));
        setSavedPhotoIds((prev) => new Set([...prev, ...insertedIds]));
        // Aktualizace photos: nově přidané dostanou DB id + url
        setPhotos((prev) => {
          const newOnesIds = new Set(newOnes.map((p) => p.id));
          const remaining = prev.filter((p) => !newOnesIds.has(p.id));
          const fresh = (inserted || []).map((row, idx) => ({
            id: row.id,
            lat: uploaded[idx].lat,
            lon: uploaded[idx].lon,
            photo: row.photo_url,
            description: uploaded[idx].description,
            timestamp: uploaded[idx].photo_timestamp,
          }));
          return [...remaining, ...fresh];
        });
        toast.success(`Uloženo ${uploaded.length} fotek`);
      }
    } catch (err: any) {
      toast.error(`Chyba ukládání: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  // Odvodí cestu v storage z public URL
  const storagePathFromUrl = (url: string): string | null => {
    const marker = '/trail-photos/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  };

  const handleDeletePhoto = async (photo: PhotoPoint) => {
    // Nová (neuložená) fotka — stačí lokálně
    if (!savedPhotoIds.has(photo.id)) {
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      return;
    }
    if (!isOwner) return;
    try {
      // Smazat soubor ze storage (best-effort)
      const path = storagePathFromUrl(photo.photo);
      if (path) {
        await supabase.storage.from('trail-photos').remove([path]);
      }
      // Smazat DB řádek
      const { error } = await supabase.from('trail_photos').delete().eq('id', photo.id);
      if (error) throw error;
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setSavedPhotoIds((prev) => {
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
      toast.success('Fotka smazána');
    } catch (err: any) {
      toast.error(`Nepodařilo se smazat: ${err.message || err}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !gpxData) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="container mx-auto px-4 py-12 max-w-md">
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <Mountain className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{error || 'Trasa není dostupná'}</p>
              <Button asChild><Link to="/">Zpět na úvod</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold">{name}</h2>
            <p className="text-sm text-muted-foreground">
              {isOwner ? 'Tvoje trasa — můžeš přidávat fotky a měnit nastavení' : 'Sdílená trasa'}
            </p>
          </div>
          {isOwner && newPhotosCount > 0 && (
            <Button onClick={handleSaveChanges} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Uložit {newPhotosCount} {newPhotosCount === 1 ? 'novou fotku' : 'nové fotky'}
            </Button>
          )}
        </div>

        <AnimationControls
          gpxData={gpxData}
          isPlaying={isPlaying}
          currentPosition={currentPosition}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
          onPositionChange={handlePositionChange}
          animationSettings={isOwner ? animationSettings : undefined}
          onAnimationSettingsChange={isOwner ? setAnimationSettings : undefined}
        />
        <TrailMap
          gpxData={gpxData}
          currentPosition={currentPosition}
          animationSettings={animationSettings}
          photos={photos}
          onAddPhotos={(newPhotos) => setPhotos((prev) => [...prev, ...newPhotos])}
          readOnly={!isOwner}
        />

        {isOwner && photos.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                Fotky na trase
                <span className="text-muted-foreground font-normal">({photos.length})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {photos.map((photo) => {
                  const isUnsaved = !savedPhotoIds.has(photo.id);
                  return (
                    <div key={photo.id} className="group relative aspect-square rounded-md overflow-hidden border bg-muted">
                      <img
                        src={photo.photo}
                        alt={photo.description || 'Fotka z trasy'}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                      {isUnsaved && (
                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
                          Neuloženo
                        </div>
                      )}
                      {photo.description && (
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs px-2 py-1 truncate">
                          {photo.description}
                        </div>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            type="button"
                            className="absolute top-1 right-1 w-7 h-7 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                            aria-label="Smazat fotku"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Smazat fotku?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {isUnsaved
                                ? 'Fotka ještě nebyla uložena, jen ji odebereš z mapy.'
                                : 'Fotka bude trvale smazána z cloudu i mapy. Tuto akci nelze vrátit.'}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Zrušit</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeletePhoto(photo)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Smazat
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
