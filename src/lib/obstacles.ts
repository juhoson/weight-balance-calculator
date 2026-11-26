/**
 * Sweden's air navigation obstacles of 100 m (328 ft) or more: masts, wind turbines, stacks, from
 * the AIP's ENR 5.4 (LFV's AREA1 obstacle dataset; scripts/update-aip.py keeps the file current).
 * LFV notes the set is not complete, and lower obstacles aren't in it at all.
 *
 * Thousands of them: the file loads on first use (loadObstacles), not with the app.
 */
import { activeLeg, bearingDistance } from './navigation';
import { aipOutOfDate, airacText, type AipDates } from './aipData';

type At = { lat: number; lon: number };

export interface Obstacle {
  lat: number;
  lon: number;
  /** Its top, ft above mean sea level. */
  topFt: number;
  /** Its height above the ground, ft. */
  heightFt: number;
  /** As the dataset has it: WINDMILL, ANTENNA, STACK, BUILDING, TOWER, ... */
  type: string;
  name: string;
  lit: boolean;
}

interface ObstacleFile extends AipDates {
  source: string;
  sourceUrl: string;
  obstacles: Array<[number, number, number, number, string, string, boolean]>;
}

/** Within this of the route, an obstacle is listed while planning. */
export const OBSTACLE_CORRIDOR_NM = 5;
/** Less clearance than this over an obstacle's top is a warning (SERA's 500 ft, and more over a congested area). */
export const OBSTACLE_MARGIN_FT = 500;
/** In the navigation mode, an obstacle this far ahead or nearer is called out (further at speed: a minute and a half). */
export const OBSTACLE_AHEAD_NM = 2;
/** ... within this many degrees either side of the track. */
const AHEAD_CONE_DEG = 30;

let loaded: Promise<{ obstacles: Obstacle[]; dates: AipDates & { source: string } }> | null = null;

/** The obstacles and the dataset's dates, loaded once. */
export function loadObstacles() {
  if (!loaded) {
    loaded = import('../data/swedenObstacles.json').then(m => {
      const file = (m.default ?? m) as unknown as ObstacleFile;
      return {
        obstacles: file.obstacles.map(([lat, lon, topFt, heightFt, type, name, lit]) => ({ lat, lon, topFt, heightFt, type, name, lit })),
        dates: { effective: file.effective, checked: file.checked, source: file.source },
      };
    });
    loaded.catch(() => { loaded = null; });
  }
  return loaded;
}

export const obstaclesOutOfDate = (d: AipDates, now = Date.now()) => aipOutOfDate(d, now);
export const obstaclesAiracText = (d: AipDates) => airacText(d);

/** "Wind turbine", "Mast", ... for the dataset's type. */
export function obstacleKind(type: string): string {
  return ({ WINDMILL: 'Wind turbine', ANTENNA: 'Mast', STACK: 'Chimney', TOWER: 'Tower', BUILDING: 'Building', CRANE: 'Crane',
    BRIDGE: 'Bridge', POLE: 'Pole', SPIRE: 'Spire', TANK: 'Tank' } as Record<string, string>)[type] ?? 'Obstacle';
}

export interface RouteObstacle extends Obstacle {
  /** Off the route, NM. */
  offNm: number;
  /** Along the route to abeam it, NM. */
  alongNm: number;
  /** The planned altitude abeam it, ft. */
  plannedFt: number;
  /** Planned altitude minus its top: under OBSTACLE_MARGIN_FT is a warning. */
  clearanceFt: number;
}

/**
 * The obstacles within `nm` of the route, with the clearance at the planned altitude abeam each
 * (altitudeAt: ft at a distance along the route). Least clearance first.
 */
export function obstaclesAlong(all: Obstacle[], route: At[], altitudeAt: (nm: number) => number, nm = OBSTACLE_CORRIDOR_NM): RouteObstacle[] {
  if (route.length < 2) return [];
  const lats = route.map(p => p.lat), lons = route.map(p => p.lon);
  const pad = nm / 60, padLon = nm / (60 * Math.cos((Math.max(...lats.map(Math.abs)) * Math.PI) / 180));
  const box = { s: Math.min(...lats) - pad, n: Math.max(...lats) + pad, w: Math.min(...lons) - padLon, e: Math.max(...lons) + padLon };
  const out: RouteObstacle[] = [];
  for (const o of all) {
    if (o.lat < box.s || o.lat > box.n || o.lon < box.w || o.lon > box.e) continue;
    const leg = activeLeg(route, o);
    if (!leg || leg.offNm > nm) continue;
    const plannedFt = altitudeAt(leg.alongNm);
    out.push({ ...o, offNm: leg.offNm, alongNm: leg.alongNm, plannedFt, clearanceFt: plannedFt - o.topFt });
  }
  return out.sort((a, b) => a.clearanceFt - b.clearanceFt);
}

/** The obstacles in a box, e.g. a map's view. */
export const obstaclesIn = (all: Obstacle[], s: number, w: number, n: number, e: number) =>
  all.filter(o => o.lat >= s && o.lat <= n && o.lon >= w && o.lon <= e);

export interface ObstacleAhead extends Obstacle {
  nm: number;
  bearingDeg: number;
  /** Altitude minus its top, ft (negative: it's higher than the aircraft). */
  clearanceFt: number;
}

/**
 * The nearest obstacle the aircraft is heading for: within OBSTACLE_AHEAD_NM, inside the cone
 * ahead of the track, with less than OBSTACLE_MARGIN_FT clearance at the altitude now.
 */
export function obstacleAhead(all: Obstacle[], at: At, trackDeg: number | null, altFt: number | null,
  aheadNm = OBSTACLE_AHEAD_NM): ObstacleAhead | null {
  if (altFt == null || trackDeg == null) return null;
  const pad = aheadNm / 60, padLon = pad / Math.cos((at.lat * Math.PI) / 180);
  let best: ObstacleAhead | null = null;
  for (const o of all) {
    if (Math.abs(o.lat - at.lat) > pad || Math.abs(o.lon - at.lon) > padLon) continue;
    const clearanceFt = altFt - o.topFt;
    if (clearanceFt >= OBSTACLE_MARGIN_FT) continue;
    const { nm, deg } = bearingDistance(at, o);
    if (nm > aheadNm) continue;
    const off = Math.abs(((deg - trackDeg + 540) % 360) - 180);
    // Right next to it, any direction counts.
    if (off > AHEAD_CONE_DEG && nm > 0.3) continue;
    if (!best || nm < best.nm) best = { ...o, nm, bearingDeg: deg, clearanceFt };
  }
  return best;
}

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));
const ft = (n: number) => Math.round(n).toLocaleString('en');

/** The chart symbol: an inverted V with a dot; a lit obstacle has the light's rays. Red when warned. */
export function obstacleSvg(o: Obstacle, warn = false): string {
  const c = warn ? '#dc2626' : '#b45309';
  const rays = o.lit ? `<path d="M9 1.5v2M4.5 3l1.2 1.4M13.5 3l-1.2 1.4" stroke="${c}" stroke-width="1.2"/>` : '';
  return `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">${rays}`
    + `<path d="M3.5 16 L9 5.5 L14.5 16" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`
    + `<circle cx="9" cy="13" r="1.6" fill="${c}"/></svg>`;
}

/** "Wind turbine ÅSBERGET 4, 1,312 ft MSL" for a marker's title. */
export const obstacleText = (o: Obstacle) => `${obstacleKind(o.type)} ${o.name}, ${ft(o.topFt)} ft MSL`;

/** A tapped obstacle's popup (HTML). */
export function obstaclePopup(o: Obstacle, dates?: AipDates): string {
  const stale = dates && obstaclesOutOfDate(dates);
  return `<strong>${escape(obstacleKind(o.type))}</strong> ${escape(o.name)}`
    + `<br><strong>${ft(o.topFt)} ft MSL</strong> · ${ft(o.heightFt)} ft AGL${o.lit ? ' · lit' : ''}`
    + `<br>AIP ENR 5.4${dates ? `, ${stale ? `<strong>${airacText(dates)}, out of date: check the AIP.</strong>` : airacText(dates)}` : ''}`;
}
