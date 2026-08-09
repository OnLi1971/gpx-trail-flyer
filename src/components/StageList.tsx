import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layers, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Stage, STAGE_COLORS } from '@/utils/stages';
import { totalDistanceKm } from '@/utils/trimGpx';

interface Props {
  stages: Stage[];
  onChange: (stages: Stage[]) => void;
}

export const StageList: React.FC<Props> = ({ stages, onChange }) => {
  if (stages.length === 0) return null;

  const update = (id: string, patch: Partial<Stage>) =>
    onChange(stages.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (id: string) => onChange(stages.filter((s) => s.id !== id));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" />
          Etapy ({stages.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center gap-2 rounded-lg border p-2">
            <span className="text-xs text-muted-foreground w-4 text-center">{i + 1}</span>
            <input
              type="color"
              value={stage.color}
              onChange={(e) => update(stage.id, { color: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
              aria-label="Barva etapy"
            />
            <Input
              value={stage.name}
              onChange={(e) => update(stage.id, { name: e.target.value })}
              className="h-8 flex-1 min-w-0"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {totalDistanceKm(stage.gpx).toFixed(1)} km
            </span>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={120}
                step={1}
                value={stage.durationSec ?? ''}
                placeholder="10"
                onChange={(e) =>
                  update(stage.id, {
                    durationSec: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)),
                  })
                }
                className="h-8 w-16"
                aria-label="Čas vykreslení etapy v sekundách"
              />
              <span className="text-xs text-muted-foreground">s</span>
            </div>

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}>
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === stages.length - 1}>
              <ArrowDown className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(stage.id)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Trasy se přehrají v tomto pořadí, každá svou barvou. Mezi etapami se kamera zastaví a otočí dokola.
        </p>
      </CardContent>
    </Card>
  );
};

export { STAGE_COLORS };
