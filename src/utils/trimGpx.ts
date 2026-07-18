import { GPXData, GPXPoint, GPXTrack } from '@/types/gpx';

function haversine(a: GPXPoint, b: GPXPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Vrátí celkovou délku trasy v km (první track). */
export function totalDistanceKm(data: GPXData): number {
  const t = data.tracks[0];
  if (!t) return 0;
  return (t.totalDistance || 0) / 1000;
}

/** Ořízne první track dle rozsahu km od–do (počítáno od startu). */
export function trimGpxByKm(data: GPXData, fromKm: number, toKm: number): GPXData {
  if (!data.tracks[0]) return data;
  const src = data.tracks[0];
  const pts = src.points;
  if (pts.length < 2) return data;

  const fromM = Math.max(0, fromKm) * 1000;
  const toM = Math.max(fromM, toKm) * 1000;

  const kept: GPXPoint[] = [];
  let acc = 0;
  let elevGain = 0;
  let elevLoss = 0;
  let prevKept: GPXPoint | null = null;
  let prevEle: number | null = null;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) acc += haversine(pts[i - 1], p);
    if (acc < fromM) continue;
    if (acc > toM) break;
    kept.push(p);
    if (prevKept && p.ele !== undefined && prevEle !== null) {
      const d = p.ele - prevEle;
      if (d > 0) elevGain += d; else elevLoss += -d;
    }
    prevKept = p;
    if (p.ele !== undefined) prevEle = p.ele;
  }

  if (kept.length < 2) return data;

  let dist = 0;
  for (let i = 1; i < kept.length; i++) dist += haversine(kept[i - 1], kept[i]);

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of kept) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const track: GPXTrack = {
    name: src.name,
    points: kept,
    totalDistance: dist,
    elevationGain: elevGain,
    elevationLoss: elevLoss,
  };

  return {
    tracks: [track, ...data.tracks.slice(1)],
    bounds: { minLat, maxLat, minLon, maxLon },
  };
}
