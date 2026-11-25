/**
 * The iOS/Android app's stand-in for public/sw.js, whose rules it follows: the app's web view runs
 * no service worker, so the app answers from the same caches itself.
 * - map tiles: from the cache the navigation mode filled for the route (lib/offlineMap.ts), else
 *   the network;
 * - the route's data (route, airspaces, airports along it): from the network, else the last answer.
 * The app's own files are inside the app, so they need nothing.
 */
import L from 'leaflet';
import { isNative } from './native';
import { TILE_CACHE } from './offlineMap';

const DATA_CACHE = 'nav-data-v1';
/** The network gets this long before the kept copy is used. */
const NETWORK_MS = 5000;
const TILE = /\/api\/map\/(base|airspace)\/\d+\/\d+\/\d+\.(mvt|png)$/;
const ROUTE_DATA = /\/api\/(map\/(status|airspaces|here|area|aerodrome\/)|airports(\/|$)|weather\/route$)/;

const hasCaches = () => typeof caches !== 'undefined';

/** Puts the cache in front of fetch, once. */
export function installTileCache(): void {
  if (!hasCaches() || (window.fetch as { cached?: boolean }).cached) return;
  const network = window.fetch.bind(window);
  const cachedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    if (req.method !== 'GET') return network(input, init);
    const path = new URL(req.url).pathname;
    if (TILE.test(path)) {
      const kept = await caches.match(req.url, { cacheName: TILE_CACHE, ignoreVary: true });
      return kept ?? network(input, init);
    }
    if (ROUTE_DATA.test(path)) return networkFirst(req, network);
    return network(input, init);
  };
  (cachedFetch as { cached?: boolean }).cached = true;
  window.fetch = cachedFetch as typeof window.fetch;
}

async function networkFirst(req: Request, network: typeof fetch): Promise<Response> {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await Promise.race([
      network(req.clone()),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), NETWORK_MS)),
    ]);
    if (res.ok) await cache.put(req.url, res.clone());
    return res;
  } catch (e) {
    const kept = await cache.match(req.url, { ignoreVary: true });
    if (kept) return kept;
    throw e;
  }
}

/**
 * A raster tile layer that loads its images through fetch, so the app's cache answers them; on the
 * web a plain one (the service worker answers its image requests).
 */
export function cachedTileLayer(url: string, options: L.TileLayerOptions): L.TileLayer {
  if (!isNative() || !hasCaches()) return L.tileLayer(url, options);
  const Layer = L.TileLayer.extend({
    createTile(this: L.TileLayer & { getTileUrl: (c: L.Coords) => string }, coords: L.Coords, done: L.DoneCallback) {
      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('role', 'presentation');
      fetch(this.getTileUrl(coords))
        .then(res => (res.status === 200 ? res.blob() : null))
        .then(blob => {
          if (!blob) { done(undefined, img); return; }
          const src = URL.createObjectURL(blob);
          img.onload = () => { URL.revokeObjectURL(src); done(undefined, img); };
          img.onerror = () => { URL.revokeObjectURL(src); done(new Error('tile'), img); };
          img.src = src;
        })
        .catch(e => done(e, img));
      return img;
    },
  });
  return new (Layer as unknown as new (u: string, o: L.TileLayerOptions) => L.TileLayer)(url, options);
}
