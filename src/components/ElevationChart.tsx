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
}

export const ElevationChart = React.memo<ElevationChartProps>(({
  chartData,
  currentChartPoint,
  variant = 'overlay',
}) => {
  if (chartData.length === 0) return null;

  const minKm = chartData[0].distance;
  const maxKm = chartData[chartData.length - 1].distance;

  const wrapperClass =
    variant === 'overlay'
      ? 'w-full h-28 bg-white/80 backdrop-blur-md rounded-lg shadow-lg border border-white/40'
      : 'w-full h-40 bg-white/95 backdrop-blur-sm border-t-2 border-trail-color/30';

  const innerClass = variant === 'overlay' ? 'h-full p-2' : 'h-full p-3';
  const chartHeight = variant === 'overlay' ? 'h-full' : 'h-32';

  return (
    <div className={wrapperClass}>
      <div className={innerClass}>
        <div className={`${chartHeight} relative`}>
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
