import React, { useRef, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';

interface ChartDataPoint {
  distance: number;
  elevation: number;
  originalElevation: number;
  originalIndex: number;
}

interface PhotoOnChart {
  id: string;
  chartDistance: number;
  chartElevation: number;
}

interface ElevationChartProps {
  chartData: ChartDataPoint[];
  currentChartPoint: ChartDataPoint | null;
  photosOnChart: PhotoOnChart[];
  /** Volitelný callback — uživatel přetáhl tečku fotky na novou km hodnotu. */
  onPhotoKmChange?: (id: string, km: number) => void;
}

export const ElevationChart = React.memo<ElevationChartProps>(({
  chartData,
  currentChartPoint,
  photosOnChart,
  onPhotoKmChange,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  if (chartData.length === 0) return null;

  const minKm = chartData[0].distance;
  const maxKm = chartData[chartData.length - 1].distance;

  const xFromEvent = useCallback((clientX: number): number | null => {
    const wrap = wrapperRef.current;
    if (!wrap) return null;
    // Vnitřek SVG plot area — recharts používá margin left=25, right=5
    const svg = wrap.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const leftPad = 25 + 20; // YAxis width 20 + margin left 25
    const rightPad = 5;
    const innerWidth = rect.width - leftPad - rightPad;
    const x = clientX - rect.left - leftPad;
    const ratio = Math.max(0, Math.min(1, x / innerWidth));
    return minKm + ratio * (maxKm - minKm);
  }, [minKm, maxKm]);

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (!onPhotoKmChange) return;
    e.stopPropagation();
    e.preventDefault();
    setDraggingId(id);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !onPhotoKmChange) return;
    const km = xFromEvent(e.clientX);
    if (km !== null) onPhotoKmChange(draggingId, Math.max(0, Math.min(maxKm, km)));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (draggingId) {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      setDraggingId(null);
    }
  };

  return (
    <div className="w-full h-40 bg-white/95 backdrop-blur-sm border-t-2 border-trail-color/30">
      <div className="h-full p-3">
        <div
          ref={wrapperRef}
          className="h-32 relative"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: draggingId ? 'none' : 'auto' }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 25, bottom: 15 }}>
              <defs>
                <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="1 1" stroke="#e5e7eb" strokeWidth={0.5} />
              <XAxis
                dataKey="distance"
                tickFormatter={(value) => `${Math.round(value)}km`}
                className="text-xs"
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                tickCount={4}
                type="number"
                domain={[minKm, maxKm]}
              />
              <YAxis
                tickFormatter={(value) => `${Math.round(value)}`}
                domain={['dataMin - 10', 'dataMax + 10']}
                className="text-xs opacity-60"
                axisLine={false}
                tickLine={false}
                width={20}
                tickCount={3}
              />
              <Line
                type="monotone"
                dataKey="elevation"
                stroke="#059669"
                strokeWidth={2}
                dot={false}
                fill="url(#elevationGradient)"
                fillOpacity={0.3}
                isAnimationActive={false}
              />

              {photosOnChart.map(photo => {
                const isDragging = draggingId === photo.id;
                return (
                  <ReferenceDot
                    key={photo.id}
                    x={photo.chartDistance}
                    y={photo.chartElevation}
                    r={isDragging ? 8 : 6}
                    fill="#3b82f6"
                    stroke="white"
                    strokeWidth={2}
                    style={{ cursor: onPhotoKmChange ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }}
                    // Recharts předává props na <circle>
                    onPointerDown={(e: any) => onPointerDown(e, photo.id)}
                  />
                );
              })}

              {currentChartPoint && (
                <ReferenceDot
                  x={currentChartPoint.distance}
                  y={currentChartPoint.elevation}
                  r={6}
                  fill="#ef4444"
                  stroke="white"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {onPhotoKmChange && photosOnChart.length > 0 && (
          <div className="text-[10px] text-muted-foreground text-center mt-1">
            Tip: modré tečky můžeš přetáhnout — fotka se spustí na dané vzdálenosti
          </div>
        )}
      </div>
    </div>
  );
});

ElevationChart.displayName = 'ElevationChart';
