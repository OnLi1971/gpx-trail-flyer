import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '@/components/FileUpload';
import { TrailMap } from '@/components/TrailMap';
import { AnimationControls } from '@/components/AnimationControls';
import { AppHeader } from '@/components/AppHeader';
import { SaveTrailDialog } from '@/components/SaveTrailDialog';
import { PhotoTimeEditor } from '@/components/PhotoTimeEditor';
import { defaultAnimationSettings, AnimationSettings } from '@/types/gpx';
import { GPXParser } from '@/utils/gpxParser';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mountain, Route, Timer, Loader2, LogIn } from 'lucide-react';

const ANIMATION_DURATION = 10000;

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [gpxFilename, setGpxFilename] = useState<string>('');
  const [photos, setPhotos] = useState<PhotoPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [animationSettings, setAnimationSettings] = useState<AnimationSettings>(defaultAnimationSettings);
  const [flyDurationSec, setFlyDurationSec] = useState(60);

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

        setGpxData(parsedData);
        setGpxFilename(filename.replace(/\.gpx$/i, ''));
        setPhotos([]);
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

  // Při přidání fotek automaticky rozprostřít triggerSec rovnoměrně
  const handleAddPhotos = useCallback((newPhotos: PhotoPoint[]) => {
    setPhotos((prev) => {
      const combined = [...prev, ...newPhotos];
      const N = combined.length;
      const dur = flyDurationSec || 60;
      // Pokud fotka nemá triggerSec, dopočítej rovnoměrné rozprostření
      return combined.map((p, i) => {
        if (p.triggerSec !== undefined) return p;
        return { ...p, triggerSec: ((i + 1) / (N + 1)) * dur };
      });
    });
  }, [flyDurationSec]);

  const handleChangeTriggerSec = useCallback((id: string, sec: number) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, triggerSec: sec } : p)));
  }, []);

  const handleRemovePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleFlyStateChange = useCallback(
    (state: { isFlying: boolean; flyDurationSec: number; flyStartTimestamp: number | null }) => {
      setFlyDurationSec(state.flyDurationSec);
    },
    []
  );

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
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Nahraj GPX soubor a sleduj animovanou vizualizaci své trasy včetně profilu nadmořské výšky.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Route className="w-4 h-4 text-primary" />
                    </div>
                    <div className="font-medium">Interaktivní mapa</div>
                    <div className="text-muted-foreground">Zobrazení trasy na mapě</div>
                  </div>
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Timer className="w-4 h-4 text-primary" />
                    </div>
                    <div className="font-medium">3D průlet</div>
                    <div className="text-muted-foreground">Plynulá animace trasou</div>
                  </div>
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Mountain className="w-4 h-4 text-primary" />
                    </div>
                    <div className="font-medium">Uložit a sdílet</div>
                    <div className="text-muted-foreground">{user ? 'Trasy v cloudu' : 'Po přihlášení'}</div>
                  </div>
                </div>
                {!user && (
                  <Button variant="outline" size="sm" onClick={() => navigate('/auth')} className="gap-2 mt-2">
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

                <TrailMap 
                  gpxData={gpxData} 
                  currentPosition={currentPosition}
                  animationSettings={animationSettings}
                  photos={photos}
                  onAddPhotos={handleAddPhotos}
                  onFlyStateChange={handleFlyStateChange}
                />

                <PhotoTimeEditor
                  photos={photos}
                  flyDurationSec={flyDurationSec}
                  onChangeTriggerSec={handleChangeTriggerSec}
                  onRemove={handleRemovePhoto}
                />
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
          photos={photos}
          defaultName={gpxFilename}
        />
      )}
    </div>
  );
};

export default Index;
