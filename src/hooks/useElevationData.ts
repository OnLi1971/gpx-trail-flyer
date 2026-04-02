import { useMemo } from 'react';
import { GPXData, PhotoPoint } from '@/types/gpx';

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

interface ElevationDataResult {
  chartData: ChartDataPoint[];
  currentChartPoint: ChartDataPoint | null;
  photosOnChart: PhotoOnChart[];
}

export function useElevationData(
  gpxData: GPXData | null,
  photos: PhotoPoint[],
  currentPosition: number,
  flyingIndex: number | null,
  elevationExaggeration: number
): ElevationDataResult {
  return useMemo(() => {
    if (!gpxData || gpxData.tracks.length === 0) {
      return { chartData: [], currentChartPoint: null, photosOnChart: [] };
    }

    const track = gpxData.tracks[0];
    const pointsWithElevation = track.points.filter(point => point.ele !== undefined);

    if (pointsWithElevation.length === 0) {
      return { chartData: [], currentChartPoint: null, photosOnChart: [] };
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

    // Current position on chart
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

    // Photo positions on chart
    const photosOnChart: PhotoOnChart[] = photos.map(photo => {
      let closestPoint = track.points[0];
      let minDist = Number.MAX_VALUE;

      track.points.forEach(point => {
        const dist = Math.sqrt(
          Math.pow(point.lat - photo.lat, 2) + Math.pow(point.lon - photo.lon, 2)
        );
        if (dist < minDist) {
          minDist = dist;
          closestPoint = point;
        }
      });

      const pointIndex = track.points.indexOf(closestPoint);
      const chartPoint = chartData.find(data => data.originalIndex === pointIndex);

      return {
        id: photo.id,
        chartDistance: chartPoint?.distance || 0,
        chartElevation: chartPoint?.elevation || closestPoint.ele || 0,
      };
    });

    return { chartData, currentChartPoint, photosOnChart };
  }, [gpxData, photos, currentPosition, flyingIndex, elevationExaggeration]);
}
