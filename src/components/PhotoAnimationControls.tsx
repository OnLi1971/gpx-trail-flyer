import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

export interface AnimationSettings {
  threshold: number;
  zoomFactor: number;
  flyToDuration: number;
  modalDelay: number;
  zoomBackDuration: number;
}

interface PhotoAnimationControlsProps {
  settings: AnimationSettings;
  onSettingsChange: (settings: AnimationSettings) => void;
}

export const defaultSettings: AnimationSettings = {
  threshold: 0.01,
  zoomFactor: 1.5,
  flyToDuration: 1500,
  modalDelay: 2000,
  zoomBackDuration: 1000
};

export const PhotoAnimationControls: React.FC<PhotoAnimationControlsProps> = ({
  settings,
  onSettingsChange
}) => {
  const updateSetting = (key: keyof AnimationSettings, value: number) => {
    onSettingsChange({
      ...settings,
      [key]: value
    });
  };

  const resetToDefaults = () => {
    onSettingsChange(defaultSettings);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Ovládání animací fotek</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefaults}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Vzdálenost spuštění (0.001-0.02): {settings.threshold.toFixed(3)}
            </Label>
            <Slider
              value={[settings.threshold]}
              onValueChange={([value]) => updateSetting('threshold', value)}
              min={0.001}
              max={0.02}
              step={0.001}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Jak blízko k fotce musí být pro spuštění
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Zoom faktor (1.0-3.0x): {settings.zoomFactor.toFixed(1)}x
            </Label>
            <Slider
              value={[settings.zoomFactor]}
              onValueChange={([value]) => updateSetting('zoomFactor', value)}
              min={1.0}
              max={3.0}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Kolikrát zvětšit zoom
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Rychlost zoom (500-3000ms): {settings.flyToDuration}ms
            </Label>
            <Slider
              value={[settings.flyToDuration]}
              onValueChange={([value]) => updateSetting('flyToDuration', value)}
              min={500}
              max={3000}
              step={100}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Doba trvání zoom animace
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Zpoždění fotky (0-5000ms): {settings.modalDelay}ms
            </Label>
            <Slider
              value={[settings.modalDelay]}
              onValueChange={([value]) => updateSetting('modalDelay', value)}
              min={0}
              max={5000}
              step={100}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Čekání před otevřením fotky
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Rychlost návratu (500-3000ms): {settings.zoomBackDuration}ms
            </Label>
            <Slider
              value={[settings.zoomBackDuration]}
              onValueChange={([value]) => updateSetting('zoomBackDuration', value)}
              min={500}
              max={3000}
              step={100}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Doba návratu do původního zoomu
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};