import { useMemo } from 'react';
import { GPXData } from '@/types/gpx';

interface ChartDataPoint {
  distance: number;
  elevation: number;
  originalElevation: number;
  originalIndex: number;
}

interface ElevationDataResult {
  chartData: ChartDataPoint[];
  currentChartPoint: ChartDataPoint | null;
}

export function useElevationData(
  gpxData: GPXData | null,
  currentPosition: number,
  flyingIndex: number | null,
  elevationExaggeration: number
): ElevationDataResult {
  return useMemo(() => {
    if (!gpxData || gpxData.tracks.length === 0) {
      return { chartData: [], currentChartPoint: null };
    }

    const track = gpxData.tracks[0];
    const pointsWithElevation = track.points.filter(point => point.ele !== undefined);

    if (pointsWithElevation.length === 0) {
      return { chartData: [], currentChartPoint: null };
    }

    const baseElevation = Math.min(...pointsWithElevation.map(p => p.ele!));

    const chartData: ChartDataPoint[] = pointsWithElevation.map((point, index) => {
      const originalEle = point.ele!;
      const exaggeratedEle = baseElevation + (originalEle - baseElevation) * elevationExaggeration;
      return {
        distance: (index / (pointsWithElevation.length - 1)) * (track.totalDistance / 1000),
        elevation: exaggeratedEle,
        originalElevation: originalEle,
        originalIndex: track.points.indexOf(point),
      };
    });

    const totalPoints = track.points.length;
    const currentPointIndex = flyingIndex !== null
      ? flyingIndex
      : Math.floor((currentPosition / 100) * (totalPoints - 1));
    const currentPoint = track.points[currentPointIndex];

    let currentChartPoint: ChartDataPoint | null = null;
    if (currentPoint && currentPoint.ele !== undefined) {
      const chartIndex = chartData.findIndex(data => data.originalIndex === currentPointIndex);
      if (chartIndex >= 0) {
        currentChartPoint = chartData[chartIndex];
      }
    } else {
      let minDistance = Infinity;
      pointsWithElevation.forEach((elevPoint, elevIndex) => {
        const elevOriginalIndex = track.points.indexOf(elevPoint);
        const distance = Math.abs(elevOriginalIndex - currentPointIndex);
        if (distance < minDistance) {
          minDistance = distance;
          currentChartPoint = chartData[elevIndex];
        }
      });
    }

    return { chartData, currentChartPoint };
  }, [gpxData, currentPosition, flyingIndex, elevationExaggeration]);
}
