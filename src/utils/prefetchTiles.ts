/**
 * Přednačtení mapových dlaždic podél trasy do HTTP cache prohlížeče,
 * aby se satelit / podklad během průletu nerenderoval postupně.
 */

export type BasemapId = 'terrain' | 'satellite' | 'cyclosm' | 'darkmatter';

const TILE_URLS: Record<BasemapId, { url: string; maxzoom: number }> = {
  terrain: { url: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png', maxzoom: 17 },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 19,
  },
  cyclosm: { url: 'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', maxzoom: 20 },
  darkmatter: { url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', maxzoom: 20 },
};

const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const DEM_MAXZOOM = 15;

function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
function latToTileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z));
}

function tileUrl(template: string, z: number, x: number, y: number) {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

function loadTile(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/** Sada dlaždic pokrývající body trasy (+ okolní prstenec) na dané úrovni zoomu. */
function tilesForPoints(
  points: { lat: number; lon: number }[],
  z: number,
  ring: number
): Set<string> {
  const set = new Set<string>();
  const max = Math.pow(2, z);
  for (const p of points) {
    const tx = lonToTileX(p.lon, z);
    const ty = latToTileY(p.lat, z);
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= max || y >= max) continue;
        set.add(`${z}/${x}/${y}`);
      }
    }
  }
  return set;
}

export interface PrefetchOptions {
  /** Hlavní zoom průletu */
  zoom: number;
  basemap: BasemapId;
  /** Kolik dlaždic okolo trasy na každou stranu */
  ring?: number;
  /** Max. počet stahovaných dlaždic (ochrana proti přetížení) */
  maxTiles?: number;
  /** Paralelní stahování */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Přednačte dlaždice podkladu (a terénního DEM) pro celou trasu.
 */
export async function prefetchTilesForTrack(
  points: { lat: number; lon: number }[],
  opts: PrefetchOptions
): Promise<{ loaded: number; total: number }> {
  const {
    zoom,
    basemap,
    ring = 1,
    maxTiles = 900,
    concurrency = 8,
    onProgress,
    signal,
  } = opts;

  if (points.length === 0) return { loaded: 0, total: 0 };

  // Vzorkovat trasu, ať nepočítáme desetitisíce bodů
  const stride = Math.max(1, Math.floor(points.length / 600));
  const sampled = points.filter((_, i) => i % stride === 0);
  if (points.length > 1) sampled.push(points[points.length - 1]);

  const base = TILE_URLS[basemap];
  const baseZoom = Math.min(Math.round(zoom), base.maxzoom);

  // Zoomy: hlavní zoom průletu + o úroveň níž (pro outro oddálení)
  const zoomLevels = Array.from(new Set([baseZoom, Math.max(0, baseZoom - 1), Math.max(0, baseZoom - 3)]));

  const jobs: string[] = [];
  for (const z of zoomLevels) {
    const r = z === baseZoom ? ring : 0;
    for (const key of tilesForPoints(sampled, z, r)) {
      const [zz, xx, yy] = key.split('/').map(Number);
      jobs.push(tileUrl(base.url, zz, xx, yy));
    }
  }

  // DEM pro 3D terén
  const demZoom = Math.min(baseZoom, DEM_MAXZOOM);
  for (const key of tilesForPoints(sampled, demZoom, 1)) {
    const [zz, xx, yy] = key.split('/').map(Number);
    jobs.push(tileUrl(DEM_URL, zz, xx, yy));
  }

  const unique = Array.from(new Set(jobs)).slice(0, maxTiles);
  const total = unique.length;
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < unique.length) {
      if (signal?.aborted) return;
      const url = unique[cursor++];
      await loadTile(url);
      done++;
      onProgress?.(done, total);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));

  return { loaded: done, total };
}
