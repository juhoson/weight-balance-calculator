/**
 * The glide in the navigation mode: how far it reaches in each direction in the wind, ending where
 * it meets the ground (terrain from Open-Meteo's elevation model, fetched ahead while online), and
 * the heading to fly to an airfield. Wind as lib/openMeteo's Wind: the vector the air moves along.
 */
import type { Wind } from './openMeteo';
import { distanceNm } from './openMeteo';
import { pointAhead } from './navigation';

type At = { lat: number; lon: number };

const FT_PER_NM = 6076.12;
const FT_PER_M = 3.28084;
/** Out along each direction in steps of this, NM. */
const STEP_NM = 0.2;
/** Directions the reach is worked out in, degrees apart. */
const EVERY_DEG = 10;

/** Ground elevation on a regular grid, ft MSL; NaN where unknown. */
export interface TerrainGrid {
  south: number;
  west: number;
  dLat: number;
  dLon: number;
  rows: number;
  cols: number;
  ft: number[];
}

/** The ground's elevation at a point (nearest grid point), ft; null outside the grid. */
export function terrainAt(g: TerrainGrid | null, p: At): number | null {
  if (!g) return null;
  const r = Math.round((p.lat - g.south) / g.dLat), c = Math.round((p.lon - g.west) / g.dLon);
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null;
  const v = g.ft[r * g.cols + c];
  return Number.isFinite(v) ? v : null;
}

/**
 * At most this many points: Open-Meteo answers 100 a call, but counts each point against its free
 * limit (a few hundred a minute), so the grid gets coarser rather than bigger.
 */
const MAX_POINTS = 500;
/** Between calls, and after being told to slow down. */
const CALL_GAP_MS = 1000;
const RETRY_MS = 61_000;

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
});

/** The grid over the box around these points, `padNm` wider, at least `spacingNm` apart (coarser for a big box). */
export function terrainGridFor(points: At[], padNm: number, spacingNm = 1): Omit<TerrainGrid, 'ft'> | null {
  if (points.length === 0) return null;
  const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
  const k = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const south = Math.min(...lats) - padNm / 60, north = Math.max(...lats) + padNm / 60;
  const west = Math.min(...lons) - padNm / (60 * k), east = Math.max(...lons) + padNm / (60 * k);
  let spacing = spacingNm;
  const count = (s: number) => (Math.floor(((north - south) * 60) / s) + 1) * (Math.floor(((east - west) * 60 * k) / s) + 1);
  while (count(spacing) > MAX_POINTS) spacing *= 1.25;
  const dLat = spacing / 60, dLon = spacing / (60 * k);
  return { south, west, dLat, dLon, rows: Math.floor((north - south) / dLat) + 1, cols: Math.floor((east - west) / dLon) + 1 };
}

/** Elevations from Open-Meteo (Copernicus DEM, 90 m), ft (NaN unknown), 100 points a call, a second apart. */
export async function fetchElevations(pts: At[], signal?: AbortSignal): Promise<number[]> {
  const ft: number[] = [];
  for (let i = 0; i < pts.length; i += 100) {
    const part = pts.slice(i, i + 100);
    const url = 'https://api.open-meteo.com/v1/elevation?' + new URLSearchParams({
      latitude: part.map(p => p.lat.toFixed(4)).join(','), longitude: part.map(p => p.lon.toFixed(4)).join(','),
    });
    if (i > 0) await wait(CALL_GAP_MS, signal);
    let res = await fetch(url, { signal });
    if (res.status === 429) {
      await wait(RETRY_MS, signal);
      res = await fetch(url, { signal });
    }
    if (!res.ok) throw new Error(`Open-Meteo elevation answered ${res.status}`);
    const body = await res.json() as { elevation?: Array<number | null> };
    part.forEach((_, j) => { const m = body.elevation?.[j]; ft.push(typeof m === 'number' ? m * FT_PER_M : NaN); });
  }
  return ft;
}

/** The grid's elevations. */
export async function fetchTerrain(grid: Omit<TerrainGrid, 'ft'>, signal?: AbortSignal): Promise<TerrainGrid> {
  const pts: At[] = [];
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) pts.push({ lat: grid.south + r * grid.dLat, lon: grid.west + c * grid.dLon });
  return { ...grid, ft: await fetchElevations(pts, signal) };
}

/** The wind along a true direction (tail positive) and from its left (pushing right positive), kt. */
const components = (w: Wind | null, deg: number) => {
  if (!w) return { along: 0, right: 0 };
  const r = (deg * Math.PI) / 180;
  return { along: w.u * Math.sin(r) + w.v * Math.cos(r), right: w.u * Math.cos(r) - w.v * Math.sin(r) };
};

/** Ground speed along a track at a true airspeed in the wind, heading corrected for drift; 0 when it can't make way. */
export function groundSpeedKt(tasKt: number, w: Wind | null, trackDeg: number): number {
  const { along, right } = components(w, trackDeg);
  if (Math.abs(right) >= tasKt) return 0;
  return Math.max(0, Math.sqrt(tasKt * tasKt - right * right) + along);
}

/** The heading that flies a track in the wind at a true airspeed (the track itself without wind). */
export function headingFor(trackDeg: number, tasKt: number, w: Wind | null): number {
  const { right } = components(w, trackDeg);
  const wca = Math.abs(right) < tasKt ? (Math.asin(right / tasKt) * 180) / Math.PI : 0;
  return (((trackDeg - wca) % 360) + 360) % 360;
}

export interface GlideInput {
  at: At;
  altFt: number;
  ratio: number;
  /** Best glide speed, kt (true, near enough at these heights). */
  tasKt: number;
  wind: Wind | null;
  terrain: TerrainGrid | null;
  /** Where the grid has nothing: the ground taken as this (e.g. the nearest field's elevation). */
  groundFt: number;
}

/** Height lost per NM over the ground along a direction, ft; Infinity when no headway. */
function lossPerNm(g: GlideInput, deg: number): number {
  const gs = groundSpeedKt(g.tasKt, g.wind, deg);
  return gs <= 1 ? Infinity : (FT_PER_NM / g.ratio) * (g.tasKt / gs);
}

/** How far the glide goes along a direction before meeting the ground, NM. */
export function glideReachNm(g: GlideInput, deg: number): number {
  const loss = lossPerNm(g, deg);
  if (!Number.isFinite(loss)) return 0;
  const max = Math.max(0, g.altFt - g.groundFt) / loss + 2; // a little past, for ground lower than assumed
  for (let d = STEP_NM; d <= max + 1e-9; d += STEP_NM) {
    const ground = terrainAt(g.terrain, pointAhead(g.at, deg, d)) ?? g.groundFt;
    if (g.altFt - d * loss <= ground) return d - STEP_NM;
  }
  return max;
}

/** The reachable area: its edge every 10°, for drawing. */
export const glideArea = (g: GlideInput): At[] =>
  Array.from({ length: 360 / EVERY_DEG }, (_, i) => pointAhead(g.at, i * EVERY_DEG, glideReachNm(g, i * EVERY_DEG)));

/**
 * Whether an airfield is reached in the glide: arriving at least `marginFt` above it, and clear
 * of the ground on the way.
 */
export function reachesField(g: GlideInput, field: At & { elevationFt: number | null }, nm: number, deg: number, marginFt: number): boolean {
  const loss = lossPerNm(g, deg);
  if (!Number.isFinite(loss)) return false;
  if (g.altFt - nm * loss < (field.elevationFt ?? g.groundFt) + marginFt) return false;
  for (let d = STEP_NM; d < nm; d += STEP_NM) {
    const ground = terrainAt(g.terrain, pointAhead(g.at, deg, d));
    if (ground != null && g.altFt - d * loss <= ground) return false;
  }
  return true;
}

/** "TURN RIGHT", "TURN LEFT" or on course (within 10°), from the track now to the one wanted. */
export function turnTo(trackNowDeg: number | null, wantedDeg: number): 'left' | 'right' | 'on' {
  if (trackNowDeg == null) return 'on';
  const diff = ((wantedDeg - trackNowDeg + 540) % 360) - 180;
  return Math.abs(diff) <= 10 ? 'on' : diff > 0 ? 'right' : 'left';
}

/** Lower than this over the ground, away from an airfield, is a warning. */
export const LOW_AGL_FT = 500;
/** Within this of an airfield, low is expected (arriving, departing): no terrain warnings. */
export const NEAR_FIELD_NM = 3;
/** Ground ahead less than this below the path flown now is a warning. */
export const AHEAD_CLEAR_FT = 300;

export type TerrainAlert =
  | { kind: 'ahead'; nm: number; groundFt: number; clearFt: number }
  | { kind: 'low'; aglFt: number };

/**
 * The terrain warning now: ground rising within about a minute ahead on the track to less than
 * AHEAD_CLEAR_FT below the path (descending as now), or the aircraft under LOW_AGL_FT over the
 * ground and not climbing. Nothing near an airfield, or without terrain or an altitude.
 */
export function terrainAlert(at: At, trackDeg: number | null, altFt: number | null, gsKt: number | null, vsFpm: number | null,
  terrain: TerrainGrid | null, fields: At[]): TerrainAlert | null {
  if (altFt == null || !terrain) return null;
  if (fields.some(f => distanceNm(at.lat, at.lon, f.lat, f.lon) <= NEAR_FIELD_NM)) return null;
  const here = terrainAt(terrain, at);
  if (trackDeg != null && gsKt != null && gsKt > 20) {
    const look = Math.min(3, Math.max(1, gsKt / 60));
    for (let d = STEP_NM; d <= look + 1e-9; d += STEP_NM) {
      const groundFt = terrainAt(terrain, pointAhead(at, trackDeg, d));
      if (groundFt == null) continue;
      const pathFt = altFt + Math.min(0, vsFpm ?? 0) * ((d / gsKt) * 60);
      // Rising ground (flat ground is "low", below), or a path that meets the ground.
      const rising = here == null || groundFt >= here + 100;
      if ((rising && pathFt - groundFt < AHEAD_CLEAR_FT) || pathFt <= groundFt) {
        return { kind: 'ahead', nm: d, groundFt, clearFt: pathFt - groundFt };
      }
    }
  }
  if (here != null && altFt - here < LOW_AGL_FT && (vsFpm == null || vsFpm <= 100)) return { kind: 'low', aglFt: altFt - here };
  return null;
}
