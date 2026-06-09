import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { GPXData, AnimationSettings } from '@/types/gpx';

interface AnimationControlsProps {
  gpxData: GPXData | null;
  isPlaying: boolean;
  currentPosition: number;
  onPlayPause: () => void;
  onReset: () => void;
  onPositionChange: (position: number) => void;
  animationSettings?: AnimationSettings;
  onAnimationSettingsChange?: (settings: AnimationSettings) => void;
}

export const AnimationControls: React.FC<AnimationControlsProps> = ({
  gpxData,
  isPlaying,
  currentPosition,
  onPlayPause,
  onReset,
  onPositionChange,
  animationSettings,
  onAnimationSettingsChange,
}) => {
  if (!gpxData || gpxData.tracks.length === 0) {
    return null;
  }


  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Průběh animace</span>
              <span>{Math.round(currentPosition)}%</span>
            </div>
            <Slider
              value={[currentPosition]}
              onValueChange={(value) => onPositionChange(value[0])}
              max={100}
              step={0.1}
              className="w-full"
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
            <Button
              onClick={onPlayPause}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pauza
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Přehrát
                </>
              )}
            </Button>
          </div>

          {/* Track Name */}
          {track.name && (
            <div className="text-center">
              <h3 className="font-semibold text-lg">{track.name}</h3>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};