import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';

interface ChartDataPoint {
  distance: number;
  elevation: number;
  originalElevation: number;
  originalIndex: number;
}

interface ElevationChartProps {
  chartData: ChartDataPoint[];
  currentChartPoint: ChartDataPoint | null;
  variant?: 'overlay' | 'panel';
  trailColor?: string;
  trailStyle?: 'solid' | 'dashed' | 'dotted';
  trailWidth?: number;
}

export const ElevationChart = React.memo<ElevationChartProps>(({
  chartData,
  currentChartPoint,
  variant = 'overlay',
  trailColor = '#059669',
  trailStyle = 'solid',
  trailWidth = 2.5,
}) => {
  if (chartData.length === 0) return null;

  const minKm = chartData[0].distance;
  const maxKm = chartData[chartData.length - 1].distance;

  const wrapperClass =
    variant === 'overlay'
      ? 'w-full h-24 bg-white/40 backdrop-blur-sm rounded-lg shadow-md border border-white/30'
      : 'w-full h-24 bg-white/95 backdrop-blur-sm border-t-2 border-trail-color/30';

  const innerClass = variant === 'overlay' ? 'h-full px-2 py-1' : 'h-full p-2';
  const chartHeight = variant === 'overlay' ? 'h-full' : 'h-20';

  // Progressive reveal: line/fill drawn only up to current position; rest is hidden.
  const progressive = !!currentChartPoint;
  const cutoff = currentChartPoint ? currentChartPoint.distance : Infinity;
  const displayData = progressive
    ? chartData.map((d) => ({
        ...d,
        elevationPast: d.distance <= cutoff ? d.elevation : null,
      }))
    : chartData.map((d) => ({ ...d, elevationPast: d.elevation }));

  return (
    <div className={wrapperClass}>
      <div className={innerClass}>
        <div className={`${chartHeight} relative`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData} margin={{ top: 6, right: 10, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trailColor} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={trailColor} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="1 1" stroke="#9ca3af" strokeOpacity={0.4} strokeWidth={0.5} />
              <XAxis
                dataKey="distance"
                tickFormatter={(value) => `${Math.round(value)}km`}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                tickCount={9}
                tick={{ fontSize: 10, fill: '#374151' }}
                type="number"
                domain={[minKm, maxKm]}
              />
              <YAxis
                tickFormatter={(value) => `${Math.round(value)}`}
                domain={['dataMin - 10', 'dataMax + 10']}
                axisLine={false}
                tickLine={false}
                width={32}
                tickCount={6}
                tick={{ fontSize: 10, fill: '#374151' }}
              />
              <Line
                type="monotone"
                dataKey="elevationPast"
                stroke={trailColor}
                strokeWidth={trailWidth}
                strokeDasharray={
                  trailStyle === 'dashed' ? '4 3' :
                  trailStyle === 'dotted' ? '1 2' :
                  undefined
                }
                dot={false}
                fill="url(#elevationGradient)"
                fillOpacity={0.3}
                isAnimationActive={false}
                connectNulls={false}
              />

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
      </div>
    </div>
  );
});

ElevationChart.displayName = 'ElevationChart';
