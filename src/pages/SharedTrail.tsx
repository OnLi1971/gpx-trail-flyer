import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppHeader } from '@/components/AppHeader';
import { TrailMap } from '@/components/TrailMap';
import { AnimationControls } from '@/components/AnimationControls';
import { GPXData, PhotoPoint, defaultAnimationSettings } from '@/types/gpx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mountain } from 'lucide-react';

const ANIMATION_DURATION = 10000;

export default function SharedTrail() {
  const { slug } = useParams<{ slug: string }>();
  const [name, setName] = useState<string>('');
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [photos, setPhotos] = useState<PhotoPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: trail, error: tErr } = await supabase
        .from('trails')
        .select('id, name, gpx_data')
        .eq('slug', slug)
        .maybeSingle();

      if (tErr || !trail) {
        setError('Trasa nebyla nalezena nebo není veřejná.');
        setLoading(false);
        return;
      }

      setName(trail.name);
      setGpxData(trail.gpx_data as unknown as GPXData);

      const { data: photoRows } = await supabase
        .from('trail_photos')
        .select('id, photo_url, description, lat, lon, photo_timestamp')
        .eq('trail_id', trail.id);

      setPhotos(
        (photoRows || []).map((p) => ({
          id: p.id,
          lat: p.lat,
          lon: p.lon,
          photo: p.photo_url,
          description: p.description || '',
          timestamp: Number(p.photo_timestamp),
        }))
      );
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
        <div>
          <h2 className="text-2xl font-bold">{name}</h2>
          <p className="text-sm text-muted-foreground">Sdílená trasa</p>
        </div>
        <AnimationControls
          gpxData={gpxData}
          isPlaying={isPlaying}
          currentPosition={currentPosition}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
          onPositionChange={handlePositionChange}
        />
        <TrailMap
          gpxData={gpxData}
          currentPosition={currentPosition}
          animationSettings={defaultAnimationSettings}
          photos={photos}
          onAddPhotos={() => {}}
          readOnly
        />
      </div>
    </div>
  );
}
