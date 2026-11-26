/**
 * Keeping a route's map for flying without a connection: the base map and airspace tiles along the
 * route go into the browser's cache, which the service worker (public/sw.js) answers them from.
 */

/** The cache public/sw.js reads tiles from; keep the two in step. */
export const TILE_CACHE = 'nav-tiles-v1';
/** Cleared before a download once it holds this many tiles, so routes don't pile up for ever. */
const MAX_CACHED_TILES = 20_000;

type At = { lat: number; lon: number };
export interface TileSpec { z: number; x: number; y: number }

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** How far either side of the route each zoom is kept: wide when zoomed out, the route's surroundings when in. */
export function bufferNm(z: number): number {
  if (z <= 8) return 50;
  if (z <= 10) return 25;
  return 12;
}

/**
 * The tiles covering the route (straight legs) and bufferNm(z) either side, for each zoom from min
 * to max; `buffer` instead of bufferNm, e.g. a fixed radius around a single point.
 */
export function tilesAlong(route: At[], minZoom: number, maxZoom: number, buffer: (z: number) => number = bufferNm): TileSpec[] {
  if (route.length === 0 || maxZoom < minZoom) return [];
  // Points at most 2 NM apart along the legs.
  const samples: At[] = [route[0]];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const nm = Math.hypot((b.lat - a.lat) * 60, (b.lon - a.lon) * 60 * Math.cos((a.lat * Math.PI) / 180));
    const steps = Math.max(1, Math.ceil(nm / 2));
    for (let k = 1; k <= steps; k++) samples.push({ lat: a.lat + ((b.lat - a.lat) * k) / steps, lon: a.lon + ((b.lon - a.lon) * k) / steps });
  }
  const out: TileSpec[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const seen = new Set<string>();
    const buf = buffer(z);
    const n = 2 ** z;
    for (const p of samples) {
      const dLat = buf / 60, dLon = buf / (60 * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)));
      const x0 = tileX(p.lon - dLon, z), x1 = tileX(p.lon + dLon, z);
      const y0 = tileY(p.lat + dLat, z), y1 = tileY(p.lat - dLat, z);
      for (let x = x0; x <= x1; x++) {
        for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) {
          const wx = ((x % n) + n) % n;
          const key = `${wx}/${y}`;
          if (!seen.has(key)) { seen.add(key); out.push({ z, x: wx, y }); }
        }
      }
    }
  }
  return out;
}

export const tileUrl = (template: string, t: TileSpec) =>
  new URL(template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), window.location.href).href;

export interface OfflineProgress { done: number; total: number; failed: number }

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

/** Whether this browser can keep tiles (Cache Storage, which needs https). */
export const canKeepOffline = () => typeof window !== 'undefined' && 'caches' in window;

/**
 * Downloads the tiles not cached yet, a few at a time, waiting and trying again when the server
 * says to slow down. Tiles that don't exist (204) are kept as such, so they're not asked again.
 */
export async function keepOffline(urls: string[], onProgress: (p: OfflineProgress) => void, signal: AbortSignal,
  retryMs = 1000): Promise<OfflineProgress> {
  const progress: OfflineProgress = { done: 0, total: urls.length, failed: 0 };
  if (!canKeepOffline()) return { ...progress, failed: urls.length };
  let cache = await caches.open(TILE_CACHE);
  if ((await cache.keys()).length > MAX_CACHED_TILES) {
    await caches.delete(TILE_CACHE);
    cache = await caches.open(TILE_CACHE);
  }
  let next = 0;
  const one = async (url: string) => {
    if (await cache.match(url, { ignoreVary: true })) return true;
    for (let attempt = 0; attempt < 5 && !signal.aborted; attempt++) {
      try {
        const res = await fetch(url, { signal });
        if (res.status === 429 || res.status >= 500) { await sleep(2 * retryMs * (attempt + 1), signal); continue; }
        if (res.status === 200 || res.status === 204) { await cache.put(url, res); return true; }
        return false;
      } catch {
        if (signal.aborted) return false;
        await sleep(retryMs * (attempt + 1), signal);
      }
    }
    return false;
  };
  const worker = async () => {
    while (next < urls.length && !signal.aborted) {
      const url = urls[next++];
      if (!(await one(url))) progress.failed++;
      progress.done++;
      onProgress({ ...progress });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return progress;
}
