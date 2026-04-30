import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, BarChart3, AlertCircle } from 'lucide-react';
import { GPXData } from '@/types/gpx';
import {
  fetchSurfaceStats,
  fetchHikingTrailStats,
  fetchLandcoverStats,
  StatBucket,
} from '@/utils/trailStats';

interface TrailStatsProps {
  gpxData: GPXData;
}

type SectionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: StatBucket[] }
  | { status: 'error'; error: string };

interface AllStats {
  surface: SectionState;
  hiking: SectionState;
  landcover: SectionState;
}

const initialState: AllStats = {
  surface: { status: 'idle' },
  hiking: { status: 'idle' },
  landcover: { status: 'idle' },
};

function trackHash(gpxData: GPXData): string {
  const pts = gpxData.tracks.flatMap((t) => t.points);
  if (pts.length === 0) return 'empty';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${pts.length}|${first.lat.toFixed(5)},${first.lon.toFixed(5)}|${last.lat.toFixed(5)},${last.lon.toFixed(5)}`;
}

const StatRow: React.FC<{ bucket: StatBucket }> = ({ bucket }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
          style={{ backgroundColor: bucket.color }}
          aria-hidden
        />
        <span className="truncate">{bucket.label}</span>
      </div>
      <span className="font-medium tabular-nums text-foreground">{bucket.percent} %</span>
    </div>
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${bucket.percent}%`, backgroundColor: bucket.color }}
      />
    </div>
  </div>
);

const Section: React.FC<{
  title: string;
  state: SectionState;
  emptyMessage: string;
  onRetry: () => void;
}> = ({ title, state, emptyMessage, onRetry }) => (
  <div className="space-y-3">
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {state.status === 'loading' && (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Analyzuji trasu podle map…</span>
      </div>
    )}
    {state.status === 'error' && (
      <div className="flex items-start gap-2 text-sm text-muted-foreground py-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-destructive" />
        <div className="flex-1 space-y-2">
          <p>Nepodařilo se získat data z mapy.</p>
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5 h-8">
            <RefreshCw className="w-3 h-3" />
            Zkusit znovu
          </Button>
        </div>
      </div>
    )}
    {state.status === 'success' && state.data.length === 0 && (
      <p className="text-sm text-muted-foreground py-2">{emptyMessage}</p>
    )}
    {state.status === 'success' && state.data.length > 0 && (
      <div className="space-y-2.5">
        {state.data.map((b) => (
          <StatRow key={b.key} bucket={b} />
        ))}
      </div>
    )}
  </div>
);

export const TrailStats: React.FC<TrailStatsProps> = ({ gpxData }) => {
  const [stats, setStats] = useState<AllStats>(initialState);
  const cacheRef = useRef<Map<string, AllStats>>(new Map());
  const lastHashRef = useRef<string>('');

  const points = gpxData.tracks.flatMap((t) =>
    t.points.map((p) => ({ lat: p.lat, lon: p.lon }))
  );

  const loadSurface = React.useCallback(async () => {
    setStats((s) => ({ ...s, surface: { status: 'loading' } }));
    try {
      const data = await fetchSurfaceStats(points);
      setStats((s) => ({ ...s, surface: { status: 'success', data } }));
    } catch (err) {
      setStats((s) => ({
        ...s,
        surface: { status: 'error', error: err instanceof Error ? err.message : 'Chyba' },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpxData]);

  const loadHiking = React.useCallback(async () => {
    setStats((s) => ({ ...s, hiking: { status: 'loading' } }));
    try {
      const data = await fetchHikingTrailStats(points);
      setStats((s) => ({ ...s, hiking: { status: 'success', data } }));
    } catch (err) {
      setStats((s) => ({
        ...s,
        hiking: { status: 'error', error: err instanceof Error ? err.message : 'Chyba' },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpxData]);

  const loadLandcover = React.useCallback(async () => {
    setStats((s) => ({ ...s, landcover: { status: 'loading' } }));
    try {
      const data = await fetchLandcoverStats(points);
      setStats((s) => ({ ...s, landcover: { status: 'success', data } }));
    } catch (err) {
      setStats((s) => ({
        ...s,
        landcover: { status: 'error', error: err instanceof Error ? err.message : 'Chyba' },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpxData]);

  // Auto-fetch on track change (with per-session cache)
  useEffect(() => {
    const hash = trackHash(gpxData);
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    const cached = cacheRef.current.get(hash);
    if (cached) {
      setStats(cached);
      return;
    }

    setStats(initialState);
    loadSurface();
    loadHiking();
    loadLandcover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpxData]);

  // Cache successful results
  useEffect(() => {
    const hash = lastHashRef.current;
    if (!hash) return;
    if (
      stats.surface.status === 'success' &&
      stats.hiking.status === 'success' &&
      stats.landcover.status === 'success'
    ) {
      cacheRef.current.set(hash, stats);
    }
  }, [stats]);

  const handleRetryAll = () => {
    cacheRef.current.delete(lastHashRef.current);
    loadSurface();
    loadHiking();
    loadLandcover();
  };

  const anyError =
    stats.surface.status === 'error' ||
    stats.hiking.status === 'error' ||
    stats.landcover.status === 'error';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          Trasa v číslech
        </CardTitle>
        {anyError && (
          <Button size="sm" variant="ghost" onClick={handleRetryAll} className="gap-1.5 h-8">
            <RefreshCw className="w-3.5 h-3.5" />
            Načíst znovu
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <Section
          title="Povrch"
          state={stats.surface}
          emptyMessage="V této oblasti nejsou v mapách dostupná data o povrchu."
          onRetry={loadSurface}
        />
        <Section
          title="Turistické značení"
          state={stats.hiking}
          emptyMessage="Trasa nevede po značených turistických cestách."
          onRetry={loadHiking}
        />
        <Section
          title="Krajina kolem trasy"
          state={stats.landcover}
          emptyMessage="Nepodařilo se určit krajinný pokryv."
          onRetry={loadLandcover}
        />
      </CardContent>
    </Card>
  );
};
