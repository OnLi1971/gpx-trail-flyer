import { GPXData, GPXTrack } from '@/types/gpx';

export const STAGE_COLORS = [
  '#ff0000',
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
];

export interface Stage {
  id: string;
  gpx: GPXData;
  name: string;
  color: string;
  durationSec?: number;
  zoomAdjust?: number;
}

export interface StageSegment {
  startIdx: number;
  endIdx: number; // exclusive
  color: string;
  name: string;
  durationSec?: number;
  zoomAdjust?: number;
}

export function stageColorAt(index: number) {
  return STAGE_COLORS[index % STAGE_COLORS.length];
}

/**
 * Spojí etapy do jedné GPXData (body za sebou) a vrátí hranice etap
 * pro barevné vykreslení a orbit pauzy mezi trasami.
 */
export function mergeStages(stages: Stage[]): { gpx: GPXData | null; segments: StageSegment[] } {
  const valid = stages.filter((s) => s.gpx?.tracks?.[0]?.points?.length);
  if (valid.length === 0) return { gpx: null, segments: [] };
  if (valid.length === 1) {
    const t = valid[0].gpx.tracks[0];
    return {
      gpx: valid[0].gpx,
      segments: [{ startIdx: 0, endIdx: t.points.length, color: valid[0].color, name: valid[0].name, durationSec: valid[0].durationSec, zoomAdjust: valid[0].zoomAdjust }],
    };
  }

  const segments: StageSegment[] = [];
  const merged: GPXTrack = {
    name: valid.map((s) => s.name).join(' + '),
    points: [],
    totalDistance: 0,
    elevationGain: 0,
    elevationLoss: 0,
  };

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

  for (const stage of valid) {
    const track = stage.gpx.tracks[0];
    const startIdx = merged.points.length;
    merged.points.push(...track.points);
    segments.push({
      startIdx,
      endIdx: merged.points.length,
      color: stage.color,
      name: stage.name,
      durationSec: stage.durationSec,
      zoomAdjust: stage.zoomAdjust,
    });
    merged.totalDistance += track.totalDistance || 0;
    merged.elevationGain += track.elevationGain || 0;
    merged.elevationLoss += track.elevationLoss || 0;
    minLat = Math.min(minLat, stage.gpx.bounds.minLat);
    maxLat = Math.max(maxLat, stage.gpx.bounds.maxLat);
    minLon = Math.min(minLon, stage.gpx.bounds.minLon);
    maxLon = Math.max(maxLon, stage.gpx.bounds.maxLon);
  }

  return {
    gpx: { tracks: [merged], bounds: { minLat, maxLat, minLon, maxLon } },
    segments,
  };
}
