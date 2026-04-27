import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Camera, Trash2, Route, Shuffle } from 'lucide-react';
import { PhotoPoint } from '@/types/gpx';

interface PhotoTimeEditorProps {
  photos: PhotoPoint[];
  /** Celková délka trasy v km. */
  totalKm: number;
  onChangePhotoKm: (id: string, km: number) => void;
  onRemove: (id: string) => void;
  /** Rovnoměrně rozprostřít všechny fotky podél trasy. */
  onRedistribute?: () => void;
}

export const PhotoTimeEditor: React.FC<PhotoTimeEditorProps> = ({
  photos,
  totalKm,
  onChangePhotoKm,
  onRemove,
  onRedistribute,
}) => {
  if (photos.length === 0) return null;

  // Seřadit dle triggerKm, fotky bez triggeru na konec
  const sorted = [...photos].sort((a, b) => {
    const at = a.triggerKm ?? Infinity;
    const bt = b.triggerKm ?? Infinity;
    return at - bt;
  });

  const max = Math.max(0.1, totalKm);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Camera className="w-4 h-4" />
          Fotky na trase
          <span className="font-normal">({photos.length})</span>
          <span className="ml-auto text-xs inline-flex items-center gap-1">
            <Route className="w-3 h-3" />
            Trasa {max.toFixed(1)} km
          </span>
          {onRedistribute && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRedistribute}
              className="h-7 text-xs gap-1"
            >
              <Shuffle className="w-3 h-3" />
              Rozprostřít
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground -mt-1">
          Nastav km od startu — nebo přetáhni modré tečky ve výškovém profilu výše.
        </div>

        <div className="space-y-2">
          {sorted.map((photo) => {
            const km = photo.triggerKm ?? 0;
            return (
              <div key={photo.id} className="flex items-center gap-3 p-2 rounded-md border bg-muted/30">
                <img
                  src={photo.photo}
                  alt={photo.description || 'Fotka'}
                  className="w-12 h-12 rounded object-cover shrink-0"
                  draggable={false}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {photo.description || 'Bez názvu'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    value={km.toFixed(1)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) onChangePhotoKm(photo.id, Math.max(0, Math.min(max, v)));
                    }}
                    min={0}
                    max={max}
                    step={0.1}
                    className="w-20 h-8 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">km</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(photo.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8"
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
