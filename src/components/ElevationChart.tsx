import React from 'react';
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
}

export const ElevationChart = React.memo<ElevationChartProps>(({
  chartData,
  currentChartPoint,
  photosOnChart,
}) => {
  if (chartData.length === 0) return null;

  return (
    <div className="w-full h-40 bg-white/95 backdrop-blur-sm border-t-2 border-trail-color/30">
      <div className="h-full p-3">
        <div className="h-32 relative">
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
              />

              {photosOnChart.map(photo => (
                <ReferenceDot
                  key={photo.id}
                  x={photo.chartDistance}
                  y={photo.chartElevation}
                  r={4}
                  fill="#3b82f6"
                  stroke="white"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                />
              ))}

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
