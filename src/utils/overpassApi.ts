export interface POIPoint {
  name: string;
  lat: number;
  lon: number;
  ele?: number;
  type: 'peak' | 'place';
  placeType?: string; // city, town, village
}

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

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

  const query = `
[out:json][timeout:15];
(
  node["natural"="peak"]["name"](${bbox});
);
out body 100;
(
  node["place"~"city|town|village|hamlet"]["name"](${bbox});
);
out body 200;
`;

  try {
    const response = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.warn('Overpass API error:', response.status);
      return [];
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

    const peaks = result.filter(p => p.type === 'peak').length;
    const places = result.filter(p => p.type === 'place').length;
    console.log(`[Overpass] Loaded ${result.length} POIs (${peaks} peaks, ${places} places)`);
    return result;
  } catch (err) {
    console.warn('Failed to fetch POIs from Overpass:', err);
    return [];
  }
}

/** Filter POIs to those within ~maxDistKm of any track point */
export function filterPOIsNearTrack(
  pois: POIPoint[],
  trackPoints: { lat: number; lon: number }[],
  maxDistKm = 2
): POIPoint[] {
  const threshold = maxDistKm / 111; // rough degree threshold

  const filtered = pois.filter(poi =>
    trackPoints.some(tp => {
      const dLat = poi.lat - tp.lat;
      const dLon = poi.lon - tp.lon;
      return Math.sqrt(dLat * dLat + dLon * dLon) < threshold;
    })
  );
  console.log(`[Overpass] After ${maxDistKm}km filter: ${filtered.length}/${pois.length} POIs near track`);
  return filtered;
}
