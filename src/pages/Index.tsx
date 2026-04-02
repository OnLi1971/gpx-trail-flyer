import React, { useState, useEffect, useCallback } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { TrailMap } from '@/components/TrailMap';
import { AnimationControls } from '@/components/AnimationControls';
import { defaultAnimationSettings } from '@/types/gpx';
import { GPXParser } from '@/utils/gpxParser';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mountain, Route, Timer, Loader2 } from 'lucide-react';

const ANIMATION_DURATION = 10000;
const animationSettings = defaultAnimationSettings;

const Index = () => {
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [photos, setPhotos] = useState<PhotoPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-trail flex items-center justify-center">
              <Mountain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">GPX Trail Flyer</h1>
              <p className="text-sm text-muted-foreground">
                Visualizace a animace GPS tras
              </p>
            </div>
          </div>
        </div>
      </div>

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
                    <div className="text-muted-foreground">Zobrazení trasy na mapě Mapbox</div>
                  </div>
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Timer className="w-4 h-4 text-primary" />
                    </div>
                    <div className="font-medium">Animace 10s</div>
                    <div className="text-muted-foreground">Plynulý průlet trasou</div>
                  </div>
                  <div className="space-y-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <Mountain className="w-4 h-4 text-primary" />
                    </div>
                    <div className="font-medium">Profil výšky</div>
                    <div className="text-muted-foreground">Graf nadmořské výšky</div>
                  </div>
                </div>
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
                />

                <TrailMap 
                  gpxData={gpxData} 
                  currentPosition={currentPosition}
                  animationSettings={animationSettings}
                  photos={photos}
                  onAddPhotos={(newPhotos) => setPhotos(prev => [...prev, ...newPhotos])}
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
    </div>
  );
};

export default Index;
