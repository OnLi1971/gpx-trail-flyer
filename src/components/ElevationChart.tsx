import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceDot } from 'recharts';
import { GPXData } from '@/types/gpx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ElevationChartProps {
  gpxData: GPXData | null;
  currentPosition: number;
}

export const ElevationChart: React.FC<ElevationChartProps> = ({ gpxData, currentPosition }) => {
  if (!gpxData || gpxData.tracks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profil nadmořské výšky</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Nahraj GPX soubor pro zobrazení profilu výšky
          </div>
        </CardContent>
      </Card>
    );
  }

  const track = gpxData.tracks[0];
  const pointsWithElevation = track.points.filter(point => point.ele !== undefined);

  if (pointsWithElevation.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profil nadmořské výšky</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            GPX soubor neobsahuje data o nadmořské výšce
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data with distance in kilometers
  const chartData = pointsWithElevation.map((point, index) => ({
    distance: (index / (pointsWithElevation.length - 1)) * (track.totalDistance / 1000),
    elevation: point.ele!,
    originalIndex: track.points.indexOf(point)
  }));

  // Calculate current position in chart data
  const totalPoints = track.points.length;
  const currentPointIndex = Math.floor((currentPosition / 100) * (totalPoints - 1));
  const currentChartPoint = chartData.find(data => data.originalIndex <= currentPointIndex);

  // Calculate statistics
  const elevations = pointsWithElevation.map(p => p.ele!);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);

  const formatElevation = (value: number) => `${Math.round(value)}m`;
  const formatDistance = (value: number) => `${value.toFixed(1)}km`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Profil nadmořské výšky</span>
          <div className="text-sm text-muted-foreground space-x-4">
            <span>Min: {formatElevation(minElevation)}</span>
            <span>Max: {formatElevation(maxElevation)}</span>
            <span>↗ {Math.round(track.elevationGain)}m</span>
            <span>↘ {Math.round(track.elevationLoss)}m</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="distance" 
                tickFormatter={formatDistance}
                className="text-xs"
              />
              <YAxis 
                tickFormatter={formatElevation}
                domain={['dataMin - 10', 'dataMax + 10']}
                className="text-xs"
              />
              <defs>
                <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--trail-color))" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="hsl(var(--trail-color))" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <Line 
                type="monotone" 
                dataKey="elevation" 
                stroke="hsl(var(--trail-color))"
                strokeWidth={2}
                dot={false}
                fill="url(#elevationGradient)"
                fillOpacity={0.3}
              />
              {currentChartPoint && (
                <ReferenceDot 
                  x={currentChartPoint.distance} 
                  y={currentChartPoint.elevation}
                  r={6}
                  fill="hsl(var(--trail-active))"
                  stroke="white"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};