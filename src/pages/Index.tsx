import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '@/components/FileUpload';
import { TrailMap } from '@/components/TrailMap';
import { TrailStats } from '@/components/TrailStats';
import { AnimationControls } from '@/components/AnimationControls';
import { TrailTrimControls } from '@/components/TrailTrimControls';
import { AppHeader } from '@/components/AppHeader';
import { SaveTrailDialog } from '@/components/SaveTrailDialog';
import { defaultAnimationSettings, AnimationSettings } from '@/types/gpx';
import { GPXParser } from '@/utils/gpxParser';
import { GPXData } from '@/types/gpx';
import { totalDistanceKm, trimGpxByKm } from '@/utils/trimGpx';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mountain, Route, Timer, Loader2, LogIn, Upload, Sliders, Play, Video } from 'lucide-react';

const ANIMATION_DURATION = 10000;

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [originalGpxData, setOriginalGpxData] = useState<GPXData | null>(null);
  const [gpxFilename, setGpxFilename] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [animationSettings, setAnimationSettings] = useState<AnimationSettings>(defaultAnimationSettings);
  const [trimFrom, setTrimFrom] = useState(0);
  const [trimTo, setTrimTo] = useState(0);

  const gpxData = useMemo(() => {
    if (!originalGpxData) return null;
    const total = totalDistanceKm(originalGpxData);
    if (trimFrom <= 0 && trimTo >= total - 0.01) return originalGpxData;
    return trimGpxByKm(originalGpxData, trimFrom, trimTo);
  }, [originalGpxData, trimFrom, trimTo]);

  const handleFileUpload = useCallback((content: string, filename: string) => {
    setIsLoading(true);

    setTimeout(() => {
      try {
        const parser = new GPXParser();
        const parsedData = parser.parseGPX(content);

        if (parsedData.tracks.length === 0) {
          toast.error('Nepodařilo se najít žádné trasy v GPX souboru');
          setIsLoading(false);
          return;
        }

        setOriginalGpxData(parsedData);
        setTrimFrom(0);
        setTrimTo(totalDistanceKm(parsedData));
        setGpxFilename(filename.replace(/\.gpx$/i, ''));
        setCurrentPosition(0);
        setIsPlaying(false);
        toast.success(`Nahrán GPX soubor: ${filename}`);
      } catch (error) {
        console.error('Error parsing GPX:', error);
        toast.error('Chyba při načítání GPX souboru. Zkontroluj formát.');
      } finally {
        setIsLoading(false);
      }
    }, 50);
  }, []);



  const handlePlayPause = useCallback(() => {
    if (!isPlaying) {
      setStartTime(Date.now() - (currentPosition / 100) * ANIMATION_DURATION);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, currentPosition]);

  const handleReset = useCallback(() => {
    setCurrentPosition(0);
    setIsPlaying(false);
    setStartTime(null);
  }, []);

  const handlePositionChange = useCallback((position: number) => {
    setCurrentPosition(position);
    if (isPlaying) {
      setStartTime(Date.now() - (position / 100) * ANIMATION_DURATION);
    }
  }, [isPlaying]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !startTime) return;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / ANIMATION_DURATION) * 100, 100);

      setCurrentPosition(progress);

      if (progress >= 100) {
        setIsPlaying(false);
        setStartTime(null);
      }
    };

    const animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, startTime, currentPosition]);

  const handleSaveClick = () => {
    if (!user) {
      toast.info('Pro uložení trasy se přihlas');
      navigate('/auth');
      return;
    }
    setSaveOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader onSaveClick={handleSaveClick} canSave={!!gpxData} />

      <div className="container mx-auto px-4 py-6 space-y-6">
        {!gpxData ? (
          <div className="max-w-2xl mx-auto space-y-6">
            {isLoading && (
              <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <p className="text-lg font-medium">Načítám GPX soubor...</p>
                </div>
              </div>
            )}

            <Card className="text-center">
              <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                  <Route className="w-6 h-6 text-primary" />
                  Vítej v GPX Trail Flyer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-muted-foreground">
                  Nahraj GPX soubor a vytvoř efektní 3D průlet nad svou trasou — připravené ke sdílení na sociálních sítích.
                </p>

                <div className="text-left bg-muted/40 rounded-lg p-4 space-y-3">
                  <div className="text-sm font-semibold text-foreground mb-2">Jak na to ve 4 krocích:</div>

                  <div className="flex items-start gap-3 text-sm">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">1</div>
                    <div>
                      <div className="font-medium flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Nahraj GPX soubor</div>
                      <div className="text-muted-foreground text-xs">Export z Garminu, Stravy, Mapy.cz, Komoot…</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-sm">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">2</div>
                    <div>
                      <div className="font-medium flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5" /> Nastav vzhled</div>
                      <div className="text-muted-foreground text-xs">3D náklon, rychlost, zoom, zvýraznění výšky a body zájmu (vrcholy, hrady, rozhledny, sedla, hospody).</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-sm">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">3</div>
                    <div>
                      <div className="font-medium flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> Zapni „Prezentace"</div>
                      <div className="text-muted-foreground text-xs">Ukryje ovládání a roztáhne mapu — vhodné před nahráváním. Pak klikni „Spustit 3D průlet".</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-sm">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">4</div>
                    <div>
                      <div className="font-medium flex items-center gap-1.5"><Video className="w-3.5 h-3.5" /> Nahraj video</div>
                      <div className="text-muted-foreground text-xs">„Nahrát průlet" → po dokončení stáhneš WebM/MP4 a střih si dokončíš třeba v CapCutu.</div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  💡 Tip: Po přihlášení si můžeš trasy uložit a sdílet odkaz na konkrétní průlet.
                </p>

                {!user && (
                  <Button variant="outline" size="sm" onClick={() => navigate('/auth')} className="gap-2">
                    <LogIn className="w-4 h-4" />
                    Přihlásit pro ukládání
                  </Button>
                )}
              </CardContent>
            </Card>

            <FileUpload onFileUpload={handleFileUpload} />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-6">
                <AnimationControls
                  gpxData={gpxData}
                  isPlaying={isPlaying}
                  currentPosition={currentPosition}
                  onPlayPause={handlePlayPause}
                  onReset={handleReset}
                  onPositionChange={handlePositionChange}
                  animationSettings={animationSettings}
                  onAnimationSettingsChange={setAnimationSettings}
                />

                {originalGpxData && (
                  <TrailTrimControls
                    gpxData={originalGpxData}
                    fromKm={trimFrom}
                    toKm={trimTo}
                    onChange={(f, t) => { setTrimFrom(f); setTrimTo(t); setCurrentPosition(0); setIsPlaying(false); }}
                  />
                )}

                <TrailMap
                  gpxData={gpxData}
                  currentPosition={currentPosition}
                  animationSettings={animationSettings}
                />

                <TrailStats gpxData={gpxData} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Nahrát nový GPX soubor</CardTitle>
              </CardHeader>
              <CardContent>
                <FileUpload onFileUpload={handleFileUpload} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {gpxData && (
        <SaveTrailDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          gpxData={gpxData}
          defaultName={gpxFilename}
        />
      )}
    </div>
  );
};

export default Index;
