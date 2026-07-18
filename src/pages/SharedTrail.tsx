import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppHeader } from '@/components/AppHeader';
import { TrailMap, PoiSettings } from '@/components/TrailMap';
import { TrailTrimControls } from '@/components/TrailTrimControls';
import { trimGpxByKm, totalDistanceKm } from '@/utils/trimGpx';
import type { POIPoint } from '@/utils/overpassApi';

import { GPXData, defaultAnimationSettings, AnimationSettings } from '@/types/gpx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mountain, Settings2, Check } from 'lucide-react';
import { toast } from 'sonner';

const ANIMATION_DURATION = 10000;

export default function SharedTrail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [trailId, setTrailId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [name, setName] = useState<string>('');
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [animationSettings, setAnimationSettings] = useState<AnimationSettings>(defaultAnimationSettings);

  const [initialPoi, setInitialPoi] = useState<PoiSettings | null>(null);
  const [currentPoi, setCurrentPoi] = useState<PoiSettings | null>(null);
  const [savedPoi, setSavedPoi] = useState<PoiSettings | null>(null);
  const [savingPoi, setSavingPoi] = useState(false);

  const [cachedPois, setCachedPois] = useState<POIPoint[] | null>(null);

  const [fromKm, setFromKm] = useState(0);
  const [toKm, setToKm] = useState(0);

  const displayGpx = useMemo(() => {
    if (!gpxData) return null;
    const total = totalDistanceKm(gpxData);
    if (fromKm <= 0 && toKm >= total - 0.05) return gpxData;
    return trimGpxByKm(gpxData, fromKm, toKm);
  }, [gpxData, fromKm, toKm]);

  const isOwner = !!user && !!ownerId && user.id === ownerId;

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: trail, error: tErr } = await supabase
        .from('trails')
        .select('id, name, gpx_data, user_id, peak_limit, place_limit, viewpoint_limit, castle_limit, saddle_limit, pub_limit, river_limit, peak_selection_mode, selected_peak_keys, place_selection_mode, selected_place_keys, deselected_poi_keys, cached_pois, pois_cached_at')
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

      const poi: PoiSettings = {
        peakLimit: (trail as any).peak_limit ?? 25,
        placeLimit: (trail as any).place_limit ?? 15,
        viewpointLimit: (trail as any).viewpoint_limit ?? 15,
        castleLimit: (trail as any).castle_limit ?? 15,
        saddleLimit: (trail as any).saddle_limit ?? 15,
        pubLimit: (trail as any).pub_limit ?? 10,
        riverLimit: (trail as any).river_limit ?? 5,
        peakSelectionMode: ((trail as any).peak_selection_mode ?? 'auto') as 'auto' | 'manual',
        selectedPeakKeys: Array.isArray((trail as any).selected_peak_keys)
          ? ((trail as any).selected_peak_keys as string[])
          : [],
        placeSelectionMode: ((trail as any).place_selection_mode ?? 'auto') as 'auto' | 'manual',
        selectedPlaceKeys: Array.isArray((trail as any).selected_place_keys)
          ? ((trail as any).selected_place_keys as string[])
          : [],
        deselectedPoiKeys: Array.isArray((trail as any).deselected_poi_keys)
          ? ((trail as any).deselected_poi_keys as string[])
          : [],
      };
      setInitialPoi(poi);
      setCurrentPoi(poi);
      setSavedPoi(poi);

      const cached = (trail as any).cached_pois;
      if (Array.isArray(cached) && cached.length > 0) {
        setCachedPois(cached as POIPoint[]);
      } else {
        setCachedPois(null);
      }

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

  const poiDirty = !!isOwner && !!currentPoi && !!savedPoi && (
    currentPoi.peakLimit !== savedPoi.peakLimit ||
    currentPoi.placeLimit !== savedPoi.placeLimit ||
    currentPoi.viewpointLimit !== savedPoi.viewpointLimit ||
    currentPoi.castleLimit !== savedPoi.castleLimit ||
    currentPoi.saddleLimit !== savedPoi.saddleLimit ||
    currentPoi.pubLimit !== savedPoi.pubLimit ||
    currentPoi.riverLimit !== savedPoi.riverLimit ||
    currentPoi.peakSelectionMode !== savedPoi.peakSelectionMode ||
    currentPoi.selectedPeakKeys.length !== savedPoi.selectedPeakKeys.length ||
    currentPoi.selectedPeakKeys.some((k) => !savedPoi.selectedPeakKeys.includes(k)) ||
    (currentPoi.placeSelectionMode ?? 'auto') !== (savedPoi.placeSelectionMode ?? 'auto') ||
    (currentPoi.selectedPlaceKeys?.length ?? 0) !== (savedPoi.selectedPlaceKeys?.length ?? 0) ||
    (currentPoi.selectedPlaceKeys ?? []).some((k) => !(savedPoi.selectedPlaceKeys ?? []).includes(k)) ||
    (currentPoi.deselectedPoiKeys?.length ?? 0) !== (savedPoi.deselectedPoiKeys?.length ?? 0) ||
    (currentPoi.deselectedPoiKeys ?? []).some((k) => !(savedPoi.deselectedPoiKeys ?? []).includes(k))
  );

  const handleSavePoi = async () => {
    if (!isOwner || !trailId || !currentPoi) return;
    setSavingPoi(true);
    try {
      const { error } = await supabase
        .from('trails')
        .update({
          peak_limit: currentPoi.peakLimit,
          place_limit: currentPoi.placeLimit,
          viewpoint_limit: currentPoi.viewpointLimit,
          castle_limit: currentPoi.castleLimit,
          saddle_limit: currentPoi.saddleLimit,
          pub_limit: currentPoi.pubLimit,
          river_limit: currentPoi.riverLimit,
          peak_selection_mode: currentPoi.peakSelectionMode,
          selected_peak_keys: currentPoi.selectedPeakKeys as any,
          place_selection_mode: currentPoi.placeSelectionMode ?? 'auto',
          selected_place_keys: (currentPoi.selectedPlaceKeys ?? []) as any,
          deselected_poi_keys: (currentPoi.deselectedPoiKeys ?? []) as any,
        })
        .eq('id', trailId);
      if (error) throw error;
      setSavedPoi(currentPoi);
      toast.success('Nastavení POI uloženo');
    } catch (err: any) {
      toast.error(`Nepodařilo se uložit: ${err.message || err}`);
    } finally {
      setSavingPoi(false);
    }
  };

  const handlePoisFetched = useCallback(async (pois: POIPoint[]) => {
    setCachedPois(pois);
    if (!isOwner || !trailId) return;
    try {
      const { error } = await supabase
        .from('trails')
        .update({
          cached_pois: pois as any,
          pois_cached_at: new Date().toISOString(),
        })
        .eq('id', trailId);
      if (error) throw error;
      toast.success(`Uloženo ${pois.length} POI k trase`);
    } catch (err: any) {
      console.error('POI cache save failed', err);
    }
  }, [isOwner, trailId]);

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
              {isOwner ? 'Tvoje trasa — můžeš měnit nastavení' : 'Sdílená trasa'}
            </p>
          </div>
          {isOwner && (
            <div className="flex items-center gap-2">
              {poiDirty && (
                <Button
                  onClick={handleSavePoi}
                  disabled={savingPoi}
                  variant="secondary"
                  className="gap-2"
                >
                  {savingPoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
                  Uložit nastavení POI
                </Button>
              )}
              {!poiDirty && savedPoi && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> POI uloženo
                </span>
              )}
            </div>
          )}
        </div>

        <TrailMap
          gpxData={gpxData}
          currentPosition={currentPosition}
          animationSettings={animationSettings}
          readOnly={!isOwner}
          initialPoiSettings={initialPoi}
          onPoiSettingsChange={setCurrentPoi}
          cachedPois={cachedPois}
          onPoisFetched={handlePoisFetched}
          trailId={trailId}
        />
      </div>
    </div>
  );
}
