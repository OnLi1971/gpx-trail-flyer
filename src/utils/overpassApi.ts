export interface POIPoint {
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  type: 'peak' | 'place';
  placeType?: string; // city, town, village
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
}): Promise<POIPoint[]> {
  // Add buffer (~2km) around bounds
  const buffer = 0.02;
  const south = bounds.minLat - buffer;
  const north = bounds.maxLat + buffer;
  const west = bounds.minLon - buffer;
  const east = bounds.maxLon + buffer;

  const bbox = `${south},${west},${north},${east}`;

  // Single union query — both peaks and places in one (...); group, single out body
  const query = `[out:json][timeout:25];
(
  node["natural"="peak"]["name"](${bbox});
  node["place"~"^(city|town|village|hamlet)$"]["name"](${bbox});
);
out body 300;`;

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

      const result: POIPoint[] = (data.elements || []).map((el: any) => {
        const isPeak = el.tags?.natural === 'peak';
        return {
          name: el.tags?.name || '',
          lat: el.lat,
          lon: el.lon,
          ele: isPeak && el.tags?.ele ? Math.round(parseFloat(el.tags.ele)) : undefined,
          type: isPeak ? 'peak' : 'place',
          placeType: !isPeak ? el.tags?.place : undefined,
        } as POIPoint;
      }).filter((p: POIPoint) => p.name);

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
