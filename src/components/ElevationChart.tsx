import React from 'react';
import { Area, LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';

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
      ? 'w-full h-24 bg-background/85 backdrop-blur-md rounded-xl shadow-lg border border-border/50 overflow-hidden'
      : 'w-full h-24 bg-background/95 backdrop-blur-md border-t-2 border-trail-color/30 overflow-hidden';

  const innerClass = variant === 'overlay' ? 'h-full px-2 py-1' : 'h-full p-2';
  const chartHeight = variant === 'overlay' ? 'h-full' : 'h-20';

  // Progressive reveal: line/fill drawn only up to current position; rest is hidden.
  const progressive = !!currentChartPoint;
  const cutoff = currentChartPoint ? currentChartPoint.distance : Infinity;
  const displayData = progressive
    ? chartData.map((d) => ({
        ...d,
        elevationPast: d.distance <= cutoff ? d.originalElevation : null,
      }))
    : chartData.map((d) => ({ ...d, elevationPast: d.originalElevation }));

  const lineWidth = Math.max(trailWidth, 2.5);

  return (
    <div className={wrapperClass}>
      <div className={innerClass}>
        <div className={`${chartHeight} relative`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={displayData} margin={{ top: 6, right: 10, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trailColor} stopOpacity={0.75} />
                  <stop offset="50%" stopColor={trailColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={trailColor} stopOpacity={0.05} />
                </linearGradient>
                <pattern id="topoPattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M0 20 Q 10 15 20 20 T 40 20" fill="none" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.18" />
                  <path d="M0 10 Q 10 5 20 10 T 40 10" fill="none" stroke="currentColor" strokeWidth="0.5" strokeOpacity={0.10" />
                </pattern>
                <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="1 3" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.25} strokeWidth={0.5} />
              <XAxis
                dataKey="distance"
                tickFormatter={(value) => `${Math.round(value)}km`}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                tickCount={9}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
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
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="elevationPast"
                stroke="none"
                fill="url(#elevationGradient)"
                isAnimationActive={false}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="elevationPast"
                stroke="none"
                fill="url(#topoPattern)"
                fillOpacity={0.7}
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="elevationPast"
                stroke="hsl(var(--background))"
                strokeWidth={lineWidth + 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={
                  trailStyle === 'dashed' ? '4 3' :
                  trailStyle === 'dotted' ? '1 2' :
                  undefined
                }
                dot={false}
                fill="none"
                isAnimationActive={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="elevationPast"
                stroke={trailColor}
                strokeWidth={lineWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={
                  trailStyle === 'dashed' ? '4 3' :
                  trailStyle === 'dotted' ? '1 2' :
                  undefined
                }
                dot={false}
                fill="none"
                filter="url(#lineGlow)"
                isAnimationActive={false}
                connectNulls={false}
              />

              {currentChartPoint && (
                <ReferenceDot
                  x={currentChartPoint.distance}
                  y={currentChartPoint.originalElevation}
                  r={5}
                  fill="hsl(var(--destructive))"
                  stroke="hsl(var(--background))"
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


