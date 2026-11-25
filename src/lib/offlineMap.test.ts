import { bufferNm, keepOffline, TILE_CACHE, tilesAlong } from './offlineMap';

const esow = { lat: 59.5894, lon: 16.6336 };
const essb = { lat: 59.3544, lon: 17.9417 };

test('the tiles along a route: every zoom, no duplicates, wider when zoomed out', () => {
  const tiles = tilesAlong([esow, essb], 6, 11);
  const keys = tiles.map(t => `${t.z}/${t.x}/${t.y}`);
  expect(new Set(keys).size).toBe(keys.length);
  for (let z = 6; z <= 11; z++) expect(tiles.some(t => t.z === z)).toBe(true);
  // Västerås's z10 tile is there, and one far away isn't.
  expect(keys).toContain('10/559/299');
  expect(keys).not.toContain('10/600/299');
  // A short route stays small: a few hundred tiles.
  expect(tiles.length).toBeGreaterThan(50);
  expect(tiles.length).toBeLessThan(600);
  expect(bufferNm(7)).toBeGreaterThan(bufferNm(11));
  expect(tilesAlong([], 6, 11)).toEqual([]);
});

describe('keepOffline', () => {
  const store = new Map<string, Response>();
  beforeEach(() => {
    store.clear();
    // Plain functions: the test setup resets jest.fn implementations before each test.
    const cache = {
      match: async (url: string) => store.get(url),
      put: async (url: string, res: Response) => { store.set(url, res); },
      keys: async () => Array.from(store.keys()),
    };
    (window as unknown as { caches: unknown }).caches = { open: async () => cache, delete: async () => true };
  });
  afterEach(() => { delete (window as unknown as { caches?: unknown }).caches; });

  test('keeps what it downloads, skips what it has, and tries again when told to slow down', async () => {
    store.set('https://x/a', new Response('cached'));
    let calls = 0;
    global.fetch = jest.fn(async (url: string) => {
      calls++;
      if (url === 'https://x/b' && calls === 1) return new Response(null, { status: 429 });
      if (url === 'https://x/gone') return new Response(null, { status: 404 });
      return new Response(url === 'https://x/c' ? null : 'tile', { status: url === 'https://x/c' ? 204 : 200 });
    }) as unknown as typeof fetch;
    const progress = jest.fn();
    const done = keepOffline(['https://x/a', 'https://x/b', 'https://x/c', 'https://x/gone'], progress, new AbortController().signal, 0);
    expect(await done).toEqual({ done: 4, total: 4, failed: 1 });
    expect(Array.from(store.keys()).sort()).toEqual(['https://x/a', 'https://x/b', 'https://x/c']);
    expect(progress).toHaveBeenLastCalledWith({ done: 4, total: 4, failed: 1 });
    expect(TILE_CACHE).toBe('nav-tiles-v1');
  });
});
