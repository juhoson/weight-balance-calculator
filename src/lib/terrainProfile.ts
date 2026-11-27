import { fetchElevations } from './glide';
import { positionAlong, routeLengthNm } from './navigation';

type At = { lat: number; lon: number };

/** The ground under the route: elevation at a distance along it. */
export interface TerrainPoint { nm: number; ft: number }

/** At most this many samples (three calls); closer than this they'd add nothing at 90 m resolution. */
const MAX_SAMPLES = 300;
const MIN_SPACING_NM = 0.25;

/** Where to sample: evenly along the route, ends included. */
export function samplesAlong(route: At[]): Array<At & { nm: number }> {
  const length = routeLengthNm(route);
  if (route.length < 2 || !(length > 0)) return [];
  const n = Math.min(MAX_SAMPLES - 1, Math.max(4, Math.ceil(length / MIN_SPACING_NM)));
  return Array.from({ length: n + 1 }, (_, i) => {
    const nm = (length * i) / n;
    const p = positionAlong(route, nm);
    return { lat: p.lat, lon: p.lon, nm };
  });
}

const cache = new Map<string, Promise<TerrainPoint[]>>();
const keyOf = (route: At[]) => route.map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');

/** The elevation profile along a route (Open-Meteo), each route fetched once; unknown points left out. */
export function terrainProfile(route: At[]): Promise<TerrainPoint[]> {
  const key = keyOf(route);
  let p = cache.get(key);
  if (!p) {
    const samples = samplesAlong(route);
    p = samples.length
      ? fetchElevations(samples).then(ft => samples.map((s, i) => ({ nm: s.nm, ft: ft[i] })).filter(t => Number.isFinite(t.ft)))
      : Promise.resolve([]);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
