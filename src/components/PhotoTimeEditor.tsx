import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Camera, Trash2, Clock } from 'lucide-react';
import { PhotoPoint } from '@/types/gpx';

interface PhotoTimeEditorProps {
  photos: PhotoPoint[];
  flyDurationSec: number;
  onChangeTriggerSec: (id: string, sec: number) => void;
  onRemove: (id: string) => void;
}

export const PhotoTimeEditor: React.FC<PhotoTimeEditorProps> = ({
  photos,
  flyDurationSec,
  onChangeTriggerSec,
  onRemove,
}) => {
  if (photos.length === 0) return null;

  // Seřadit dle triggerSec, fotky bez triggeru na konec
  const sorted = [...photos].sort((a, b) => {
    const at = a.triggerSec ?? Infinity;
    const bt = b.triggerSec ?? Infinity;
    return at - bt;
  });

  const max = Math.max(5, Math.round(flyDurationSec));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Camera className="w-4 h-4" />
          Fotky na trase
          <span className="font-normal">({photos.length})</span>
          <span className="ml-auto text-xs inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Délka průletu ≈ {max} s
          </span>
        </div>

        <div className="space-y-3">
          {sorted.map((photo) => {
            const sec = photo.triggerSec ?? 0;
            return (
              <div key={photo.id} className="flex items-center gap-3 p-2 rounded-md border bg-muted/30">
                <img
                  src={photo.photo}
                  alt={photo.description || 'Fotka'}
                  className="w-12 h-12 rounded object-cover shrink-0"
                  draggable={false}
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-medium truncate">
                    {photo.description || 'Bez názvu'}
                  </div>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[Math.min(sec, max)]}
                      onValueChange={(v) => onChangeTriggerSec(photo.id, v[0])}
                      min={0}
                      max={max}
                      step={0.5}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={sec.toFixed(1)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) onChangeTriggerSec(photo.id, Math.max(0, Math.min(max, v)));
                      }}
                      min={0}
                      max={max}
                      step={0.5}
                      className="w-20 h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">s</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(photo.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Smazat fotku"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
