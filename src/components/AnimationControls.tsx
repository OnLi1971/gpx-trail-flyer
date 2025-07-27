import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, RotateCcw, MapPin } from 'lucide-react';
import { GPXData } from '@/types/gpx';

interface AnimationControlsProps {
  gpxData: GPXData | null;
  isPlaying: boolean;
  currentPosition: number;
  onPlayPause: () => void;
  onReset: () => void;
  onPositionChange: (position: number) => void;
}

export const AnimationControls: React.FC<AnimationControlsProps> = ({
  gpxData,
  isPlaying,
  currentPosition,
  onPlayPause,
  onReset,
  onPositionChange,
}) => {
  if (!gpxData || gpxData.tracks.length === 0) {
    return null;
  }

  const track = gpxData.tracks[0];
  const currentPointIndex = Math.floor((currentPosition / 100) * (track.points.length - 1));
  const currentPoint = track.points[currentPointIndex];

  const formatDistance = (distance: number) => {
    if (distance >= 1000) {
      return `${(distance / 1000).toFixed(1)} km`;
    }
    return `${Math.round(distance)} m`;
  };

  const currentDistance = (currentPosition / 100) * track.totalDistance;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">
                {formatDistance(currentDistance)}
              </div>
              <div className="text-xs text-muted-foreground">Aktuální pozice</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {formatDistance(track.totalDistance)}
              </div>
              <div className="text-xs text-muted-foreground">Celková vzdálenost</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-trail-active">
                {Math.round(track.elevationGain)}m
              </div>
              <div className="text-xs text-muted-foreground">Stoupání</div>
            </div>
            <div className="flex items-center justify-center">
              {currentPoint && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {currentPoint.lat.toFixed(5)}, {currentPoint.lon.toFixed(5)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Progress Slider */}
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