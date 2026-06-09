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
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

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

  // Single union query — peaks, places, viewpoints (vč. rozhleden), hrady/zříceniny, sedla, hospody/restaurace, řeky/potoky
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
  way["waterway"~"^(river|stream|canal)$"]["name"](${bbox});
);
out tags center 1200;`;

  let lastError: unknown = null;
  // 2 pokusy přes všechny servery (s krátkou prodlevou mezi koly) — Overpass občas vrací 502/504 pod zátěží
  const MAX_ROUNDS = 2;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0) {
      await new Promise((r) => setTimeout(r, 1500));
    }
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

      const data = await response.json();

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

          // Řeka / potok / kanál
          if (tags.waterway && /^(river|stream|canal)$/.test(tags.waterway)) {
            return { ...base, type: 'river', waterwayKind: tags.waterway };
          }

          return null;
        })
        .filter((p: POIPoint | null): p is POIPoint => p !== null);

      return result;
    } catch (err) {
      lastError = err;
    }
    }
  }

  throw new Error(`Všechny Overpass servery selhaly. ${lastError instanceof Error ? lastError.message : ''}`);
}

/** Filter POIs to those within ~maxDistKm of any track point */
export function filterPOIsNearTrack(
  pois: POIPoint[],
  trackPoints: { lat: number; lon: number }[],
  maxDistKm = 2
): POIPoint[] {
  const threshold = maxDistKm / 111; // rough degree threshold

  return pois.filter(poi =>
    trackPoints.some(tp => {
      const dLat = poi.lat - tp.lat;
      const dLon = poi.lon - tp.lon;
      return Math.sqrt(dLat * dLat + dLon * dLon) < threshold;
    })
  );
}
