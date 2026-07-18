import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Scissors, RotateCcw } from 'lucide-react';
import { GPXData } from '@/types/gpx';
import { totalDistanceKm } from '@/utils/trimGpx';

interface Props {
  gpxData: GPXData;
  fromKm: number;
  toKm: number;
  onChange: (fromKm: number, toKm: number) => void;
}

export const TrailTrimControls: React.FC<Props> = ({ gpxData, fromKm, toKm, onChange }) => {
  const total = useMemo(() => totalDistanceKm(gpxData), [gpxData]);
  const step = total > 50 ? 0.5 : 0.1;
  const trimmed = fromKm > 0 || toKm < total - 0.05;

  const clamp = (v: number) => Math.max(0, Math.min(total, v));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Scissors className="w-4 h-4 text-primary" />
          Vybrat jen část trasy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          Celková délka: <span className="font-medium text-foreground">{total.toFixed(2)} km</span>
          {trimmed && (
            <> · Vybráno: <span className="font-medium text-foreground">{(toKm - fromKm).toFixed(2)} km</span></>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Od (km)</span>
            <Input
              type="number"
              value={fromKm.toFixed(2)}
              min={0}
              max={toKm}
              step={step}
              onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0), toKm)}
              className="h-7 w-24 text-right"
            />
          </div>
          <Slider
            value={[fromKm]}
            min={0}
            max={total}
            step={step}
            onValueChange={(v) => onChange(Math.min(v[0], toKm), toKm)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Do (km)</span>
            <Input
              type="number"
              value={toKm.toFixed(2)}
              min={fromKm}
              max={total}
              step={step}
              onChange={(e) => onChange(fromKm, clamp(parseFloat(e.target.value) || total))}
              className="h-7 w-24 text-right"
            />
          </div>
          <Slider
            value={[toKm]}
            min={0}
            max={total}
            step={step}
            onValueChange={(v) => onChange(fromKm, Math.max(v[0], fromKm))}
          />
        </div>

        {trimmed && (
          <Button variant="ghost" size="sm" onClick={() => onChange(0, total)} className="gap-2">
            <RotateCcw className="w-3.5 h-3.5" /> Zpět na celou trasu
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
