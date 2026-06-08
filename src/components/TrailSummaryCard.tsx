import React from 'react';
import { X, Route, ArrowUp, ArrowDown, Mountain, Clock } from 'lucide-react';
import { GPXData } from '@/types/gpx';
import { ElevationChart } from './ElevationChart';
import { useElevationData } from '@/hooks/useElevationData';

interface TrailSummaryCardProps {
  gpxData: GPXData;
  poiCounts: {
    peaks: number;
    places: number;
    viewpoints: number;
    castles: number;
    saddles: number;
    pubs: number;
  };
  flyDurationSec: number;
  trailColor: string;
  trailStyle: 'solid' | 'dashed' | 'dotted';
  trailWidth: number;
  onClose: () => void;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const TrailSummaryCard: React.FC<TrailSummaryCardProps> = ({
  gpxData,
  poiCounts,
  flyDurationSec,
  trailColor,
  trailStyle,
  trailWidth,
  onClose,
}) => {
  const track = gpxData.tracks[0];
  if (!track) return null;

  const elevationData = useElevationData(gpxData, 0, null, 1);
  const eles = track.points.map((p) => p.ele).filter((e): e is number => e !== undefined);
  const maxEle = eles.length ? Math.round(Math.max(...eles)) : null;
  const name = track.name || 'Trasa';
  const distanceKm = (track.totalDistance / 1000).toFixed(1);
  const gain = Math.round(track.elevationGain);
  const loss = Math.round(track.elevationLoss);

  const poiItems = [
    { icon: '⛰️', n: poiCounts.peaks },
    { icon: '🏘️', n: poiCounts.places },
    { icon: '🔭', n: poiCounts.viewpoints },
    { icon: '🏰', n: poiCounts.castles },
    { icon: '⛰', n: poiCounts.saddles },
    { icon: '🍺', n: poiCounts.pubs },
  ].filter((p) => p.n > 0);

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

        <h3 className="text-lg font-semibold pr-8 mb-3 truncate">{name}</h3>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Stat icon={<Route className="w-4 h-4" />} label="Vzdálenost" value={`${distanceKm} km`} />
          <Stat icon={<Clock className="w-4 h-4" />} label="Průlet" value={formatDuration(flyDurationSec)} />
          <Stat icon={<ArrowUp className="w-4 h-4 text-emerald-600" />} label="Stoupání" value={`${gain} m`} />
          <Stat icon={<ArrowDown className="w-4 h-4 text-rose-600" />} label="Klesání" value={`${loss} m`} />
          {maxEle !== null && (
            <Stat icon={<Mountain className="w-4 h-4" />} label="Vrchol" value={`${maxEle} m`} />
          )}
        </div>

        {poiItems.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 text-sm">
            {poiItems.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted">
                <span>{p.icon}</span>
                <span className="font-medium tabular-nums">{p.n}</span>
              </span>
            ))}
          </div>
        )}

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
