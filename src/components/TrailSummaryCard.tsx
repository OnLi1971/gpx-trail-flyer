import React, { useEffect, useState, useMemo } from 'react';
import { X, Route, ArrowUp, ArrowDown, Mountain, Clock, Calendar, Bike, PersonStanding, Car, TrendingDown, Layers, Loader2, Sun, Cloud, CloudRain, CloudSnow, CloudFog, Zap, Wind, Droplets, Thermometer } from 'lucide-react';
import { GPXData } from '@/types/gpx';
import { fetchSurfaceStats, StatBucket } from '@/utils/trailStats';
import { fetchTrailWeather, TrailWeather, windDirLabel, weatherCodeInfo } from '@/utils/weatherApi';
import { ElevationChart } from './ElevationChart';

type Activity = 'bike' | 'walk' | 'car';

interface TrailSummaryCardProps {
  gpxData: GPXData;
  trailColor: string;
  trailStyle: 'solid' | 'dashed' | 'dotted';
  trailWidth: number;
  activity?: Activity;
  onClose: () => void;
}

function formatDuration(ms: number) {
  if (!isFinite(ms) || ms <= 0) return '–';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function formatHourRange(hours: number) {
  if (!isFinite(hours) || hours <= 0) return '–';
  const low = Math.max(0.1, hours * 0.9);
  const high = hours * 1.15;
  const fmt = (h: number) => {
    if (h < 1) return `${Math.round(h * 60)} min`;
    const rounded = Math.round(h * 2) / 2;
    return Number.isInteger(rounded) ? `${rounded} h` : `${rounded.toFixed(1)} h`;
  };
  return `${fmt(low)}–${fmt(high)}`;
}

function formatDate(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('cs-CZ');
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ACTIVITY_META: Record<Activity, { label: string; icon: React.ReactNode }> = {
  bike: { label: 'Cyklo', icon: <Bike className="w-4 h-4" /> },
  walk: { label: 'Pěšky', icon: <PersonStanding className="w-4 h-4" /> },
  car: { label: 'Autem', icon: <Car className="w-4 h-4" /> },
};

function estimateHours(activity: Activity, distanceKm: number, gain: number) {
  switch (activity) {
    case 'bike': return distanceKm / 15 + gain / 400;
    case 'walk': return distanceKm / 4 + gain / 600;
    case 'car':  return distanceKm / 60 + gain / 2000;
  }
}

export const TrailSummaryCard: React.FC<TrailSummaryCardProps> = ({
  gpxData,
  trailColor,
  trailStyle,
  trailWidth,
  activity = 'bike',
  onClose,
}) => {
  const track = gpxData.tracks[0];
  const [surface, setSurface] = useState<StatBucket[] | null>(null);
  const [surfaceLoading, setSurfaceLoading] = useState(false);
  const [weather, setWeather] = useState<TrailWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    setSurfaceLoading(true);
    const pts = track.points.map((p) => ({ lat: p.lat, lon: p.lon }));
    fetchSurfaceStats(pts)
      .then((data) => { if (!cancelled) setSurface(data); })
      .catch(() => { if (!cancelled) setSurface([]); })
      .finally(() => { if (!cancelled) setSurfaceLoading(false); });
    return () => { cancelled = true; };
  }, [track]);

  useEffect(() => {
    if (!track) return;
    const first = track.points[0];
    const last = track.points[track.points.length - 1];
    if (!first?.time) { setWeather(null); return; }
    const mid = track.points[Math.floor(track.points.length / 2)] || first;
    let cancelled = false;
    setWeatherLoading(true);
    fetchTrailWeather(mid.lat, mid.lon, first.time, last?.time)
      .then((w) => { if (!cancelled) setWeather(w); })
      .catch(() => { if (!cancelled) setWeather(null); })
      .finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
  }, [track]);

  if (!track) return null;

  const eles = track.points.map((p) => p.ele).filter((e): e is number => e !== undefined);
  const maxEle = eles.length ? Math.round(Math.max(...eles)) : null;
  const minEle = eles.length ? Math.round(Math.min(...eles)) : null;
  const name = track.name || 'Trasa';
  const distanceKm = track.totalDistance / 1000;
  const gain = Math.round(track.elevationGain);
  const loss = Math.round(track.elevationLoss);

  const first = track.points[0];
  const last = track.points[track.points.length - 1];
  const meta = ACTIVITY_META[activity];

  // Real time from GPX if both endpoints have timestamps; else fallback to estimate range.
  let timeDisplay: string;
  let timeLabel: string;
  if (first?.time && last?.time) {
    const ms = new Date(last.time).getTime() - new Date(first.time).getTime();
    if (isFinite(ms) && ms > 0) {
      timeDisplay = formatDuration(ms);
      timeLabel = `${meta.label} – reálný čas`;
    } else {
      timeDisplay = formatHourRange(estimateHours(activity, distanceKm, gain));
      timeLabel = `${meta.label} – odhadovaný čas`;
    }
  } else {
    timeDisplay = formatHourRange(estimateHours(activity, distanceKm, gain));
    timeLabel = `${meta.label} – odhadovaný čas`;
  }

  const dateStr = formatDate(first?.time);
  const knownSurfaces = (surface ?? []).filter((b) => b.key !== 'unknown');
  const knownTotal = knownSurfaces.reduce((acc, b) => acc + b.percent, 0);
  const redistributed = knownTotal > 0
    ? knownSurfaces.map((b) => ({ ...b, percent: Math.round((b.percent / knownTotal) * 1000) / 10 }))
    : knownSurfaces;
  const topSurfaces = redistributed.slice(0, 4);

  const chartData = useMemo(() => {
    const pts = track.points.filter((p) => p.ele !== undefined);
    if (pts.length === 0) return [];
    return pts.map((p, i) => ({
      distance: (i / (pts.length - 1)) * (track.totalDistance / 1000),
      elevation: p.ele!,
      originalElevation: p.ele!,
      originalIndex: i,
    }));
  }, [track]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 pointer-events-none animate-in fade-in duration-500">
      <div className="pointer-events-auto bg-background/90 backdrop-blur-md rounded-xl shadow-2xl border border-border max-w-md w-full p-5 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Zavřít"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-lg font-semibold pr-8 mb-1 truncate">{name}</h3>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
          <Calendar className="w-3.5 h-3.5" />
          <span>{dateStr}</span>
        </div>

        <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-md bg-muted/60">
          <div className="flex-shrink-0 text-foreground">{meta.icon}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{timeLabel}</div>
            <div className="text-base font-semibold leading-tight tabular-nums truncate">{timeDisplay}</div>
          </div>
          <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat icon={<Route className="w-4 h-4" />} label="Vzdálenost" value={`${distanceKm.toFixed(1)} km`} />
          <Stat icon={<ArrowUp className="w-4 h-4 text-emerald-600" />} label="Stoupání" value={`${gain} m`} />
          <Stat icon={<ArrowDown className="w-4 h-4 text-rose-600" />} label="Klesání" value={`${loss} m`} />
          {maxEle !== null && (
            <Stat icon={<Mountain className="w-4 h-4" />} label="Nejvyšší bod" value={`${maxEle} m`} />
          )}
          {minEle !== null && (
            <Stat icon={<TrendingDown className="w-4 h-4" />} label="Nejnižší bod" value={`${minEle} m`} />
          )}
        </div>

        <WeatherSection weather={weather} loading={weatherLoading} hasTime={!!first?.time} />

        {chartData.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Mountain className="w-3.5 h-3.5" />
              <span>Výškový profil</span>
            </div>
            <ElevationChart
              chartData={chartData}
              currentChartPoint={null}
              variant="overlay"
              trailColor={trailColor}
              trailStyle={trailStyle}
              trailWidth={trailWidth}
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Layers className="w-3.5 h-3.5" />
            <span>Povrch</span>
            {surfaceLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          {!surfaceLoading && topSurfaces.length === 0 && (
            <p className="text-xs text-muted-foreground">Data o povrchu nejsou dostupná.</p>
          )}
          {topSurfaces.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
                {topSurfaces.map((b) => (
                  <div key={b.key} style={{ width: `${b.percent}%`, backgroundColor: b.color }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {topSurfaces.map((b) => (
                  <div key={b.key} className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: b.color }} />
                    <span className="text-foreground">{b.label}</span>
                    <span className="tabular-nums text-muted-foreground">{b.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2">
    <div className="flex-shrink-0">{icon}</div>
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
      <div className="text-sm font-semibold leading-tight truncate">{value}</div>
    </div>
  </div>
);

const WeatherIcon: React.FC<{ kind: ReturnType<typeof weatherCodeInfo>['kind'] }> = ({ kind }) => {
  const cls = 'w-5 h-5';
  switch (kind) {
    case 'sun': return <Sun className={`${cls} text-amber-500`} />;
    case 'cloud': return <Cloud className={`${cls} text-slate-400`} />;
    case 'rain': return <CloudRain className={`${cls} text-sky-500`} />;
    case 'snow': return <CloudSnow className={`${cls} text-sky-300`} />;
    case 'fog': return <CloudFog className={`${cls} text-slate-400`} />;
    case 'storm': return <Zap className={`${cls} text-violet-500`} />;
    default: return <Cloud className={`${cls} text-muted-foreground`} />;
  }
};

const WeatherSection: React.FC<{ weather: TrailWeather | null; loading: boolean; hasTime: boolean }> = ({ weather, loading, hasTime }) => {
  if (!hasTime) {
    return (
      <div className="mb-4 text-xs text-muted-foreground italic">
        GPX neobsahuje datum, počasí nelze dohledat.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Načítám počasí…
      </div>
    );
  }
  if (!weather) {
    return (
      <div className="mb-4 text-xs text-muted-foreground">
        Počasí pro tento den není dostupné.
      </div>
    );
  }
  const info = weatherCodeInfo(weather.weatherCode);
  const fmt = (n: number | null, unit: string, digits = 0) =>
    n == null ? '–' : `${n.toFixed(digits)} ${unit}`;
  return (
    <div className="mb-4 p-3 rounded-md bg-muted/60 space-y-2">
      <div className="flex items-center gap-2">
        <WeatherIcon kind={info.kind} />
        <span className="text-sm font-medium">{info.label}</span>
        {weather.tempMean != null && (
          <span className="ml-auto text-base font-semibold tabular-nums">
            {Math.round(weather.tempMean)} °C
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Thermometer className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="tabular-nums">
            {weather.tempMin != null ? Math.round(weather.tempMin) : '–'}° / {weather.tempMax != null ? Math.round(weather.tempMax) : '–'}°
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="tabular-nums">{fmt(weather.windMax, 'km/h')} {windDirLabel(weather.windDir)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="tabular-nums">{fmt(weather.precipitation, 'mm', 1)}</span>
        </div>
      </div>
    </div>
  );
};
