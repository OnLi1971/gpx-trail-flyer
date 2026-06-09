import React from 'react';
import { X, Route, ArrowUp, ArrowDown, Mountain, Clock, Calendar, Bike, PersonStanding, Car, TrendingDown } from 'lucide-react';
import { GPXData } from '@/types/gpx';
import { ElevationChart } from './ElevationChart';
import { useElevationData } from '@/hooks/useElevationData';

type Activity = 'bike' | 'walk' | 'car';

interface TrailSummaryCardProps {
  gpxData: GPXData;
  trailColor: string;
  trailStyle: 'solid' | 'dashed' | 'dotted';
  trailWidth: number;
  activity?: Activity;
  onClose: () => void;
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
  if (!track) return null;

  const elevationData = useElevationData(gpxData, 0, null, 1);
  const eles = track.points.map((p) => p.ele).filter((e): e is number => e !== undefined);
  const maxEle = eles.length ? Math.round(Math.max(...eles)) : null;
  const minEle = eles.length ? Math.round(Math.min(...eles)) : null;
  const name = track.name || 'Trasa';
  const distanceKm = track.totalDistance / 1000;
  const gain = Math.round(track.elevationGain);
  const loss = Math.round(track.elevationLoss);

  const first = track.points[0];
  const meta = ACTIVITY_META[activity];
  const timeRange = formatHourRange(estimateHours(activity, distanceKm, gain));
  const dateStr = formatDate(first?.time);

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
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{meta.label} – odhadovaný čas</div>
            <div className="text-base font-semibold leading-tight tabular-nums truncate">{timeRange}</div>
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

        <div className="h-24 -mx-1">
          <ElevationChart
            chartData={elevationData.chartData}
            currentChartPoint={null}
            variant="overlay"
            trailColor={trailColor}
            trailStyle={trailStyle}
            trailWidth={trailWidth}
          />
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
