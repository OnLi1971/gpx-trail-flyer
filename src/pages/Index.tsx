import React, { useState, useEffect, useCallback } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { TrailMap } from '@/components/TrailMap';
import { ElevationChart } from '@/components/ElevationChart';
import { AnimationControls } from '@/components/AnimationControls';
import { GPXParser } from '@/utils/gpxParser';
import { GPXData } from '@/types/gpx';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mountain, Route, Timer } from 'lucide-react';

const Index = () => {
  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [animationDuration] = useState(10000); // 10 seconds
  const [startTime, setStartTime] = useState<number | null>(null);

  const parser = new GPXParser();

  const handleFileUpload = useCallback((content: string, filename: string) => {
    try {
      const parsedData = parser.parseGPX(content);
      
      if (parsedData.tracks.length === 0) {
        toast.error('Nepodařilo se najít žádné trasy v GPX souboru');
        return;
      }

      setGpxData(parsedData);
      setCurrentPosition(0);
      setIsPlaying(false);
      toast.success(`Nahrán GPX soubor: ${filename}`);
    } catch (error) {
      console.error('Error parsing GPX:', error);
      toast.error('Chyba při načítání GPX souboru. Zkontroluj formát.');
    }
  }, [parser]);

  const handlePlayPause = useCallback(() => {
    if (!isPlaying) {
      setStartTime(Date.now() - (currentPosition / 100) * animationDuration);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, currentPosition, animationDuration]);

  const handleReset = useCallback(() => {
    setCurrentPosition(0);
    setIsPlaying(false);
    setStartTime(null);
  }, []);

  const handlePositionChange = useCallback((position: number) => {
    setCurrentPosition(position);
    if (isPlaying) {
      setStartTime(Date.now() - (position / 100) * animationDuration);
    }
  }, [isPlaying, animationDuration]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !startTime) return;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / animationDuration) * 100, 100);
      
      setCurrentPosition(progress);
      
      if (progress >= 100) {
        setIsPlaying(false);
        setStartTime(null);
      }
    };

    const animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isPlaying, startTime, animationDuration, currentPosition]);

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
            {/* Welcome Section */}
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

            {/* File Upload */}
            <FileUpload onFileUpload={handleFileUpload} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Animation Controls */}
            <AnimationControls
              gpxData={gpxData}
              isPlaying={isPlaying}
              currentPosition={currentPosition}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              onPositionChange={handlePositionChange}
            />

            {/* Map and Chart Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-1 gap-6">
              {/* Trail Map */}
              <TrailMap 
                gpxData={gpxData} 
                currentPosition={currentPosition}
              />
              
              {/* Elevation Chart */}
              <ElevationChart 
                gpxData={gpxData} 
                currentPosition={currentPosition} 
              />
            </div>

            {/* File Upload for New File */}
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