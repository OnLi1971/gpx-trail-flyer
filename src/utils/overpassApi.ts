export type POIType = 'peak' | 'place' | 'viewpoint' | 'castle' | 'saddle' | 'pub' | 'river';

export interface POIPoint {
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  type: POIType;
  /** Pro 'place': city/town/village/hamlet */
  placeType?: string;
  /** Pro 'viewpoint': 'viewpoint' | 'tower' (rozhledna) */
  viewpointKind?: 'viewpoint' | 'tower';
  /** Pro 'castle': castle/ruins/fort/manor… */
  castleKind?: string;
  /** Pro 'pub': pub/bar/restaurant/cafe */
  pubKind?: string;
  /** Pro 'river': river/stream/canal */
  waterwayKind?: string;
  /** Geometrie liniových POI (hlavně řeky/potoky) pro filtrování podle průsečíku s trasou */
  geometry?: { lat: number; lon: number }[];
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

type TrackPoint = { lat: number; lon: number };

async function fetchOverpassJson(query: string) {
  let lastError: unknown = null;
  const MAX_ROUNDS = 2;

  for (let round = 0; round < MAX_ROUNDS; round++) {
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

  throw new Error(`Všechny Overpass servery selhaly. ${lastError instanceof Error ? lastError.message : ''}`);
}

function distanceKm(a: TrackPoint, b: TrackPoint) {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function sampleTrackPoints(trackPoints: TrackPoint[], spacingKm: number, maxPoints = 45) {
  if (trackPoints.length <= 2) return trackPoints;

  const sampled: TrackPoint[] = [trackPoints[0]];
  let sinceLast = 0;
  for (let i = 1; i < trackPoints.length; i++) {
    sinceLast += distanceKm(trackPoints[i - 1], trackPoints[i]);
    if (sinceLast >= spacingKm) {
      sampled.push(trackPoints[i]);
      sinceLast = 0;
    }
  }
  sampled.push(trackPoints[trackPoints.length - 1]);

  if (sampled.length <= maxPoints) return sampled;
  const step = (sampled.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => sampled[Math.round(i * step)]);
}

export async function fetchPeaksAndPlaces(bounds: {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}, bufferKm: number = 2): Promise<POIPoint[]> {
  // Buffer in degrees (~111 km / °)
  const buffer = bufferKm / 111;
  const south = bounds.minLat - buffer;
  const north = bounds.maxLat + buffer;
  const west = bounds.minLon - buffer;
  const east = bounds.maxLon + buffer;

  const bbox = `${south},${west},${north},${east}`;

  // Běžné bodové POI. Vodní prvky se načítají samostatně podél trasy,
  // protože široký bbox + limit odpovědi je dřív často uřízl.
  const query = `[out:json][timeout:30];
(
  node["natural"="peak"]["name"](${bbox});
  node["place"~"^(city|town|village|hamlet)$"]["name"](${bbox});
  node["tourism"="viewpoint"]["name"](${bbox});
  node["man_made"="tower"]["tower:type"="observation"]["name"](${bbox});
  node["historic"~"^(castle|fort|ruins|manor)$"]["name"](${bbox});
  node["natural"~"^(saddle|mountain_pass)$"]["name"](${bbox});
  node["mountain_pass"="yes"]["name"](${bbox});
  node["amenity"~"^(pub|bar|restaurant|cafe|biergarten)$"]["name"](${bbox});
);
out tags center 2000;`;

  const data = await fetchOverpassJson(query);
      const result: POIPoint[] = (data.elements || [])
        .map((el: any): POIPoint | null => {
          const tags = el.tags || {};
          const name = tags.name;
          if (!name) return null;

          // U ways (řeky) je souřadnice v center.{lat,lon}
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (lat == null || lon == null) return null;

          const base = { name, lat, lon };

          // Vrchol
          if (tags.natural === 'peak') {
            return {
              ...base,
              type: 'peak',
              ele: tags.ele ? Math.round(parseFloat(tags.ele)) : undefined,
            };
          }

          // Sedlo / horský průsmyk
          if (tags.natural === 'saddle' || tags.natural === 'mountain_pass' || tags.mountain_pass === 'yes') {
            return {
              ...base,
              type: 'saddle',
              ele: tags.ele ? Math.round(parseFloat(tags.ele)) : undefined,
            };
          }

          // Sídlo
          if (tags.place && /^(city|town|village|hamlet)$/.test(tags.place)) {
            return { ...base, type: 'place', placeType: tags.place };
          }

          // Rozhledna (man_made=tower s tower:type=observation)
          if (tags.man_made === 'tower' && tags['tower:type'] === 'observation') {
            return {
              ...base,
              type: 'viewpoint',
              viewpointKind: 'tower',
              ele: tags.ele ? Math.round(parseFloat(tags.ele)) : undefined,
            };
          }

          // Vyhlídka
          if (tags.tourism === 'viewpoint') {
            return { ...base, type: 'viewpoint', viewpointKind: 'viewpoint' };
          }

          // Hrad / zřícenina / pevnost / panské sídlo
          if (tags.historic && /^(castle|fort|ruins|manor)$/.test(tags.historic)) {
            return { ...base, type: 'castle', castleKind: tags.historic };
          }

          // Hospoda / restaurace / kavárna / bar
          if (tags.amenity && /^(pub|bar|restaurant|cafe|biergarten)$/.test(tags.amenity)) {
            return { ...base, type: 'pub', pubKind: tags.amenity };
          }

          // Řeka / potok / kanál (way nebo relation)
          const waterwayKind = tags.waterway || (tags.natural === 'water' && tags.water === 'river' ? 'river' : undefined) || (tags.type === 'waterway' ? 'river' : undefined);
          if (waterwayKind && /^(river|stream|canal)$/.test(waterwayKind)) {
            let geometry: { lat: number; lon: number }[] | undefined;
            if (Array.isArray(el.geometry)) {
              geometry = el.geometry
                .map((point: any) => ({ lat: point.lat, lon: point.lon }))
                .filter((p: { lat: number; lon: number }) => p.lat != null && p.lon != null);
            } else if (Array.isArray(el.members)) {
              // relation — sloučit geometrii všech členů (main_stream/side_stream/way)
              geometry = el.members.flatMap((m: any) =>
                Array.isArray(m.geometry)
                  ? m.geometry
                      .map((p: any) => ({ lat: p.lat, lon: p.lon }))
                      .filter((p: { lat: number; lon: number }) => p.lat != null && p.lon != null)
                  : []
              );
              if (geometry && geometry.length === 0) geometry = undefined;
            }

            return { ...base, type: 'river', waterwayKind, geometry };
          }

          return null;
        })
        .filter((p: POIPoint | null): p is POIPoint => p !== null);

      // Deduplikace řek podle názvu — Vltava může přijít jako relace + mnoho ways.
      // Necháme variantu s nejdelší geometrií (typicky relace).
      const riverByName = new Map<string, POIPoint>();
      const deduped: POIPoint[] = [];
      for (const p of result) {
        if (p.type !== 'river') { deduped.push(p); continue; }
        const key = p.name.toLowerCase();
        const existing = riverByName.get(key);
        if (!existing || (p.geometry?.length ?? 0) > (existing.geometry?.length ?? 0)) {
          riverByName.set(key, p);
        }
      }
      deduped.push(...riverByName.values());

      return deduped;
}

export async function fetchWaterwaysAlongTrack(
  trackPoints: TrackPoint[],
  radiusKm = 0.8
): Promise<POIPoint[]> {
  // Polyline around: Overpass umí radius kolem celé navzorkované linie v jediném klauzuli.
  // Vzorkujeme hustě (~150 m) a bereme až 500 bodů, aby se ani u dlouhých tras nepřeskočila řeka.
  const sampled = sampleTrackPoints(trackPoints, 0.15, 500);
  if (sampled.length < 2) return [];
  const radiusMeters = Math.max(300, Math.round(radiusKm * 1000));
  const coords = sampled.map(p => `${p.lat},${p.lon}`).join(',');
  const around = `(around:${radiusMeters},${coords})`;

  const query = `[out:json][timeout:60];
(
  way["waterway"~"^(river|stream|canal)$"]["name"]${around};
  way["natural"="water"]["water"="river"]["name"]${around};
  relation["waterway"="river"]["name"]${around};
);
out tags geom;`;

  const data = await fetchOverpassJson(query);
  const byName = new Map<string, { poi: POIPoint; distSq: number }>();

  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const name = tags.name;
    if (!name) continue;

    const geometry: TrackPoint[] | undefined = Array.isArray(el.geometry)
      ? el.geometry.map((p: any) => ({ lat: p.lat, lon: p.lon })).filter((p: TrackPoint) => p.lat != null && p.lon != null)
      : undefined;
    if (!geometry || geometry.length === 0) continue;

    const closest = findClosestPointOnLineToTrack(geometry, trackPoints);
    if (!closest) continue;

    const poi: POIPoint = {
      name,
      lat: closest.closest.lat,
      lon: closest.closest.lon,
      type: 'river',
      waterwayKind: tags.waterway || tags.water || 'river',
      geometry,
    };

    const key = name.toLowerCase();
    const existing = byName.get(key);
    // Dedup podle blízkosti k trase, ne podle délky geometrie.
    if (!existing || closest.distanceSq < existing.distSq) {
      byName.set(key, { poi, distSq: closest.distanceSq });
    }
  }

  return [...byName.values()].map(v => v.poi);
}

function distanceToSegmentSquared(
  point: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
) {
  // Korekce délky stupně longitude podle zeměpisné šířky (cos(lat)).
  const cosLat = Math.cos((point.lat * Math.PI) / 180);
  const x = point.lon * cosLat;
  const y = point.lat;
  const x1 = a.lon * cosLat;
  const y1 = a.lat;
  const x2 = b.lon * cosLat;
  const y2 = b.lat;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dXc = x - projX;
  const dYc = y - projY;

  // Pro vrácenou souřadnici převedeme zpátky lon = projX / cosLat (lineární interp.).
  const closestLon = cosLat === 0 ? a.lon : projX / cosLat;
  const closestLat = projY;

  return { distanceSq: dYc * dYc + dXc * dXc, closest: { lat: closestLat, lon: closestLon } };
}

function findClosestPointOnLineToTrack(
  line: { lat: number; lon: number }[],
  trackPoints: { lat: number; lon: number }[]
) {
  let best: { distanceSq: number; closest: { lat: number; lon: number } } | null = null;

  for (let i = 0; i < line.length - 1; i++) {
    for (const trackPoint of trackPoints) {
      const candidate = distanceToSegmentSquared(trackPoint, line[i], line[i + 1]);
      if (!best || candidate.distanceSq < best.distanceSq) best = candidate;
    }
  }

  return best;
}

/** Filter POIs to those within ~maxDistKm of any track point */
export function filterPOIsNearTrack(
  pois: POIPoint[],
  trackPoints: { lat: number; lon: number }[],
  maxDistKm = 2
): POIPoint[] {
  const threshold = maxDistKm / 111; // hrubý práh ve stupních (po cos-korekci konzistentní)
  const thresholdSq = threshold * threshold;

  return pois.reduce<POIPoint[]>((nearby, poi) => {
    if (poi.type === 'river' && poi.geometry && poi.geometry.length > 1) {
      const closest = findClosestPointOnLineToTrack(poi.geometry, trackPoints);
      if (closest && closest.distanceSq < thresholdSq) {
        nearby.push({ ...poi, lat: closest.closest.lat, lon: closest.closest.lon });
      }
      return nearby;
    }

    const isNearby = trackPoints.some(tp => {
      const cosLat = Math.cos((tp.lat * Math.PI) / 180);
      const dLat = poi.lat - tp.lat;
      const dLon = (poi.lon - tp.lon) * cosLat;
      return dLat * dLat + dLon * dLon < thresholdSq;
    });

    if (isNearby) nearby.push(poi);
    return nearby;
  }, []);
}
