/*
 * Lets the navigation mode work without a connection (see src/lib/offlineMap.ts):
 * - map tiles (base map and airspace): from the cache the navigation mode filled for the route,
 *   else the network; tiles are only added by that download, so the cache can't grow by itself;
 * - the app's own files: the page from the network when it can be had (so a new release shows at
 *   once), else the last one kept; the hashed bundles from the cache once seen;
 * - the route's data (route, airspaces, airports along it): from the network, else the last answer.
 * Anything else (sign-in, saved routes) is left alone.
 */
const TILES = 'nav-tiles-v1';
const SHELL = 'app-shell-v1';
const DATA = 'nav-data-v1';
const KEEP = [TILES, SHELL, DATA];
/** The network gets this long before the kept copy is used. */
const NETWORK_MS = 5000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (!KEEP.includes(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

const TILE = /^\/api\/map\/(base|airspace)\/\d+\/\d+\/\d+\.(mvt|png)$/;
const ROUTE_DATA = /^\/api\/(map\/(status|airspaces|here|area|aerodrome\/)|airports(\/|$)|weather\/route$)/;

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (TILE.test(url.pathname)) event.respondWith(tile(req));
  else if (ROUTE_DATA.test(url.pathname)) event.respondWith(networkFirst(DATA, req));
  else if (req.mode === 'navigate') event.respondWith(networkFirst(SHELL, req));
  else if (url.pathname.startsWith('/static/')) event.respondWith(cacheFirst(SHELL, req));
});

async function tile(req) {
  const kept = await caches.match(req, { cacheName: TILES, ignoreVary: true });
  return kept || fetch(req);
}

async function cacheFirst(name, req) {
  const kept = await caches.match(req, { cacheName: name, ignoreVary: true });
  if (kept) return kept;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(name);
    await cache.put(req, res.clone());
    await trim(cache, 150);
  }
  return res;
}

/** Drops the oldest entries past `max` (bundles of earlier releases). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(name, req) {
  const cache = await caches.open(name);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NETWORK_MS)),
    ]);
    if (res.ok) {
      await cache.put(req, res.clone());
      // The page is the same at every address: kept as "/" too, for opening it offline from anywhere.
      if (req.mode === 'navigate') await cache.put('/', res.clone());
    }
    return res;
  } catch (e) {
    // A navigation offline gets the app's page, whatever its address.
    const kept = await cache.match(req, { ignoreVary: true })
      || (req.mode === 'navigate' ? await cache.match('/', { ignoreVary: true }) : undefined);
    if (kept) return kept;
    throw e;
  }
}
