/**
 * Trail statistics from OSM data via Overpass API.
 *
 * Three independent fetchers:
 *  - fetchSurfaceStats        — % distribution of road surface (asphalt, gravel…)
 *  - fetchHikingTrailStats    — % of route on KČT marked hiking trails by colour
 *  - fetchLandcoverStats      — % of route surrounded by forest / meadow / built-up
 *
 * All return a normalized list of buckets: { key, label, percent, color }.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export interface StatBucket {
  key: string;
  label: string;
  percent: number;
  /** HSL color string, e.g. "hsl(220, 70%, 55%)" */
  color: string;
}

interface TrackPoint {
  lat: number;
  lon: number;
}

// ---------- helpers ----------

async function runOverpass(query: string): Promise<any> {
  let lastError: unknown = null;
  for (let round = 0; round < 2; round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, 1500));
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        return await response.json();
      } catch (err) {
        lastError = err;
      }
    }
  }
  throw new Error(
    `Overpass API selhala. ${lastError instanceof Error ? lastError.message : ''}`
  );
}

/** Approx meters between two lat/lon points (equirectangular). */
function distanceMeters(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

/** Decimate a track to roughly target step distance in meters. */
function decimateTrack(points: TrackPoint[], stepMeters: number): TrackPoint[] {
  if (points.length === 0) return [];
  const result: TrackPoint[] = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += distanceMeters(points[i - 1], points[i]);
    if (acc >= stepMeters) {
      result.push(points[i]);
      acc = 0;
    }
  }
  const last = points[points.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

function computeBBox(points: TrackPoint[], bufferDeg = 0.005): BBox {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const p of points) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
  }
  return {
    south: south - bufferDeg,
    west: west - bufferDeg,
    north: north + bufferDeg,
    east: east + bufferDeg,
  };
}

/** Squared distance from point P to segment AB in lat/lon (degree^2, scaled by cos lat). */
function pointToSegmentDistMeters(
  p: TrackPoint,
  a: TrackPoint,
  b: TrackPoint
): number {
  // project to local meters using equirectangular
  const cosLat = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lon - p.lon) * cosLat;
  const ay = a.lat - p.lat;
  const bx = (b.lon - p.lon) * cosLat;
  const by = b.lat - p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? -(ax * dx + ay * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  // 1 deg lat ≈ 111_320 m
  const distDeg = Math.sqrt(cx * cx + cy * cy);
  return distDeg * 111320;
}

/** Find min distance (meters) from point to a polyline (array of coords). */
function pointToWayDistMeters(
  p: TrackPoint,
  way: TrackPoint[]
): number {
  let min = Infinity;
  for (let i = 1; i < way.length; i++) {
    const d = pointToSegmentDistMeters(p, way[i - 1], way[i]);
    if (d < min) min = d;
  }
  return min;
}

/** Ray-casting point-in-polygon. */
function pointInPolygon(p: TrackPoint, poly: TrackPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon, yi = poly[i].lat;
    const xj = poly[j].lon, yj = poly[j].lat;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Quick bbox check before expensive PIP. */
function pointInBBox(p: TrackPoint, bbox: BBox): boolean {
  return p.lat >= bbox.south && p.lat <= bbox.north && p.lon >= bbox.west && p.lon <= bbox.east;
}

function bboxOfPolygon(poly: TrackPoint[]): BBox {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const p of poly) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
  }
  return { south, west, north, east };
}

function bucketsToStats<T extends { label: string; color: string }>(
  buckets: Map<string, { meta: T; weight: number }>,
  totalWeight: number
): StatBucket[] {
  if (totalWeight <= 0) return [];
  const list: StatBucket[] = [];
  for (const [key, { meta, weight }] of buckets) {
    if (weight <= 0) continue;
    list.push({
      key,
      label: meta.label,
      color: meta.color,
      percent: Math.round((weight / totalWeight) * 1000) / 10,
    });
  }
  list.sort((a, b) => b.percent - a.percent);
  return list;
}

// ---------- 1) SURFACE ----------

const SURFACE_BUCKETS: Record<string, { label: string; color: string }> = {
  asphalt:       { label: 'Asfalt',            color: 'hsl(0, 0%, 25%)' },
  gravel:        { label: 'Šotolina',          color: 'hsl(35, 35%, 55%)' },
  dirt:          { label: 'Lesní/polní cesta', color: 'hsl(25, 45%, 40%)' },
  grass:         { label: 'Tráva',             color: 'hsl(110, 45%, 45%)' },
  paving_stones: { label: 'Dlažba',            color: 'hsl(220, 10%, 55%)' },
  sand:          { label: 'Písek',             color: 'hsl(45, 70%, 70%)' },
  unknown:       { label: 'Neznámý povrch',    color: 'hsl(220, 10%, 70%)' },
};

function classifySurface(tag: string | undefined): keyof typeof SURFACE_BUCKETS {
  if (!tag) return 'unknown';
  const t = tag.toLowerCase();
  if (['asphalt', 'paved', 'concrete', 'chipseal', 'asphalt;concrete'].includes(t)) return 'asphalt';
  if (['gravel', 'fine_gravel', 'compacted', 'pebblestone', 'rock'].includes(t)) return 'gravel';
  if (['dirt', 'ground', 'earth', 'mud', 'unpaved'].includes(t)) return 'dirt';
  if (t === 'grass') return 'grass';
  if (['paving_stones', 'cobblestone', 'sett', 'unhewn_cobblestone'].includes(t)) return 'paving_stones';
  if (t === 'sand') return 'sand';
  return 'unknown';
}

export async function fetchSurfaceStats(points: TrackPoint[]): Promise<StatBucket[]> {
  if (points.length < 2) return [];

  // Decimate based on track length
  const totalLen = points.reduce(
    (acc, p, i) => (i === 0 ? 0 : acc + distanceMeters(points[i - 1], p)),
    0
  );
  const stepM = totalLen > 100_000 ? 200 : totalLen > 30_000 ? 100 : 50;
  const decimated = decimateTrack(points, stepM);

  const bbox = computeBBox(decimated, 0.003);
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  const query = `[out:json][timeout:30];
(
  way["highway"](${bboxStr});
);
out tags geom;`;

  const data = await runOverpass(query);
  const ways: { surface?: string; highway?: string; geom: TrackPoint[] }[] =
    (data.elements || [])
      .filter((el: any) => el.type === 'way' && Array.isArray(el.geometry))
      .map((el: any) => ({
        surface: el.tags?.surface,
        highway: el.tags?.highway,
        geom: el.geometry.map((g: any) => ({ lat: g.lat, lon: g.lon })),
      }));

  // For each segment of the decimated track, find nearest way (within 30m) and assign its surface.
  const buckets = new Map<string, { meta: { label: string; color: string }; weight: number }>();
  for (const k of Object.keys(SURFACE_BUCKETS)) {
    buckets.set(k, { meta: SURFACE_BUCKETS[k], weight: 0 });
  }

  let totalUsed = 0;
  for (let i = 1; i < decimated.length; i++) {
    const a = decimated[i - 1];
    const b = decimated[i];
    const segLen = distanceMeters(a, b);
    const mid: TrackPoint = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };

    let bestDist = Infinity;
    let bestSurface: string | undefined;
    for (const w of ways) {
      const d = pointToWayDistMeters(mid, w.geom);
      if (d < bestDist) {
        bestDist = d;
        bestSurface = w.surface;
      }
    }

    let bucketKey: keyof typeof SURFACE_BUCKETS;
    if (bestDist > 30) {
      bucketKey = 'unknown';
    } else {
      bucketKey = classifySurface(bestSurface);
    }
    buckets.get(bucketKey)!.weight += segLen;
    totalUsed += segLen;
  }

  return bucketsToStats(buckets, totalUsed);
}

// ---------- 2) HIKING TRAILS (KČT) ----------

const TRAIL_COLOR_BUCKETS: Record<string, { label: string; color: string }> = {
  red:    { label: 'Červená KČT',  color: 'hsl(0, 75%, 50%)' },
  blue:   { label: 'Modrá KČT',    color: 'hsl(220, 75%, 50%)' },
  green:  { label: 'Zelená KČT',   color: 'hsl(130, 60%, 40%)' },
  yellow: { label: 'Žlutá KČT',    color: 'hsl(48, 90%, 50%)' },
  other:  { label: 'Jiná značka',  color: 'hsl(280, 40%, 55%)' },
  none:   { label: 'Bez značky',   color: 'hsl(220, 10%, 65%)' },
};

function classifyTrailColor(colour: string | undefined, osmcSymbol: string | undefined): keyof typeof TRAIL_COLOR_BUCKETS {
  const sources = [colour, osmcSymbol].filter(Boolean).join(' ').toLowerCase();
  if (!sources) return 'other';
  if (/\bred\b/.test(sources)) return 'red';
  if (/\bblue\b/.test(sources)) return 'blue';
  if (/\bgreen\b/.test(sources)) return 'green';
  if (/\byellow\b/.test(sources)) return 'yellow';
  return 'other';
}

export async function fetchHikingTrailStats(points: TrackPoint[]): Promise<StatBucket[]> {
  if (points.length < 2) return [];

  const totalLen = points.reduce(
    (acc, p, i) => (i === 0 ? 0 : acc + distanceMeters(points[i - 1], p)),
    0
  );
  const stepM = totalLen > 100_000 ? 200 : totalLen > 30_000 ? 100 : 50;
  const decimated = decimateTrack(points, stepM);

  const bbox = computeBBox(decimated, 0.005);
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  // Hiking route relations + their member ways with geometry
  const query = `[out:json][timeout:30];
relation["route"="hiking"](${bboxStr});
way(r);
out tags geom;`;

  const data = await runOverpass(query);

  // Each way may belong to multiple routes — but we don't have that info here.
  // We'll tag each way by its OWN tags (osmc:symbol/colour) if present; otherwise classify as 'other'.
  const ways: { colour?: string; osmcSymbol?: string; geom: TrackPoint[] }[] =
    (data.elements || [])
      .filter((el: any) => el.type === 'way' && Array.isArray(el.geometry))
      .map((el: any) => ({
        colour: el.tags?.colour,
        osmcSymbol: el.tags?.['osmc:symbol'],
        geom: el.geometry.map((g: any) => ({ lat: g.lat, lon: g.lon })),
      }));

  const buckets = new Map<string, { meta: { label: string; color: string }; weight: number }>();
  for (const k of Object.keys(TRAIL_COLOR_BUCKETS)) {
    buckets.set(k, { meta: TRAIL_COLOR_BUCKETS[k], weight: 0 });
  }

  let totalUsed = 0;
  for (let i = 1; i < decimated.length; i++) {
    const a = decimated[i - 1];
    const b = decimated[i];
    const segLen = distanceMeters(a, b);
    const mid: TrackPoint = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };

    let bestDist = Infinity;
    let bestWay: typeof ways[number] | null = null;
    for (const w of ways) {
      const d = pointToWayDistMeters(mid, w.geom);
      if (d < bestDist) {
        bestDist = d;
        bestWay = w;
      }
    }

    let bucketKey: keyof typeof TRAIL_COLOR_BUCKETS;
    if (!bestWay || bestDist > 25) {
      bucketKey = 'none';
    } else {
      bucketKey = classifyTrailColor(bestWay.colour, bestWay.osmcSymbol);
    }
    buckets.get(bucketKey)!.weight += segLen;
    totalUsed += segLen;
  }

  return bucketsToStats(buckets, totalUsed);
}

// ---------- 3) LANDCOVER ----------

const LANDCOVER_BUCKETS: Record<string, { label: string; color: string }> = {
  forest:      { label: 'Les',            color: 'hsl(130, 50%, 30%)' },
  meadow:      { label: 'Louky a pole',   color: 'hsl(85, 55%, 50%)' },
  builtup:     { label: 'Zástavba',       color: 'hsl(20, 15%, 50%)' },
  water:       { label: 'Vodní plocha',   color: 'hsl(205, 75%, 50%)' },
  scrub:       { label: 'Křoviny / vřes', color: 'hsl(80, 35%, 40%)' },
  other:       { label: 'Otevřená krajina', color: 'hsl(50, 30%, 70%)' },
};

function classifyLandcover(tags: any): keyof typeof LANDCOVER_BUCKETS | null {
  if (!tags) return null;
  const lu = tags.landuse;
  const nat = tags.natural;
  if (nat === 'wood' || lu === 'forest') return 'forest';
  if (lu === 'meadow' || lu === 'farmland' || lu === 'orchard' || lu === 'vineyard' || nat === 'grassland') return 'meadow';
  if (['residential', 'industrial', 'commercial', 'retail'].includes(lu)) return 'builtup';
  if (nat === 'water' || lu === 'reservoir' || lu === 'basin') return 'water';
  if (nat === 'scrub' || nat === 'heath') return 'scrub';
  return null;
}

export async function fetchLandcoverStats(points: TrackPoint[]): Promise<StatBucket[]> {
  if (points.length < 2) return [];

  const totalLen = points.reduce(
    (acc, p, i) => (i === 0 ? 0 : acc + distanceMeters(points[i - 1], p)),
    0
  );
  const stepM = totalLen > 100_000 ? 250 : totalLen > 30_000 ? 120 : 60;
  const decimated = decimateTrack(points, stepM);

  const bbox = computeBBox(decimated, 0.005);
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  const query = `[out:json][timeout:30];
(
  way["landuse"~"^(forest|meadow|farmland|orchard|vineyard|residential|industrial|commercial|retail|reservoir|basin)$"](${bboxStr});
  way["natural"~"^(wood|water|grassland|scrub|heath)$"](${bboxStr});
);
out tags geom;`;

  const data = await runOverpass(query);

  interface Polygon {
    bucket: keyof typeof LANDCOVER_BUCKETS;
    poly: TrackPoint[];
    bbox: BBox;
  }
  const polys: Polygon[] = [];
  for (const el of (data.elements || [])) {
    if (el.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 3) continue;
    const bucket = classifyLandcover(el.tags);
    if (!bucket) continue;
    const poly = el.geometry.map((g: any) => ({ lat: g.lat, lon: g.lon }));
    polys.push({ bucket, poly, bbox: bboxOfPolygon(poly) });
  }

  const buckets = new Map<string, { meta: { label: string; color: string }; weight: number }>();
  for (const k of Object.keys(LANDCOVER_BUCKETS)) {
    buckets.set(k, { meta: LANDCOVER_BUCKETS[k], weight: 0 });
  }

  let totalUsed = 0;
  for (const p of decimated) {
    let chosen: keyof typeof LANDCOVER_BUCKETS | null = null;
    // Forest takes priority if multiple polygons overlap
    const matches: (keyof typeof LANDCOVER_BUCKETS)[] = [];
    for (const poly of polys) {
      if (!pointInBBox(p, poly.bbox)) continue;
      if (pointInPolygon(p, poly.poly)) matches.push(poly.bucket);
    }
    if (matches.length > 0) {
      const priority: (keyof typeof LANDCOVER_BUCKETS)[] = ['water', 'forest', 'builtup', 'meadow', 'scrub'];
      for (const pri of priority) {
        if (matches.includes(pri)) { chosen = pri; break; }
      }
      if (!chosen) chosen = matches[0];
    } else {
      chosen = 'other';
    }
    buckets.get(chosen)!.weight += 1;
    totalUsed += 1;
  }

  return bucketsToStats(buckets, totalUsed);
}
