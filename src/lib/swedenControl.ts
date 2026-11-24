import data from '../data/swedenControl.json';
import { crossingsAlong } from './airspace';
import type { RoutePosition } from './openMeteo';
import type { AirspaceView } from '../types/route';

/**
 * Who to call in Swedish class G: Sweden Control (or Sweden Information in the south), on the
 * frequency of the ACC sector below FL 245. The sector outlines were traced from the AIP's ENR 6.1
 * "COM FREQ ACC below FL 245/285" charts (see `source`), so they are approximate near boundaries.
 */
export interface SwedenControlSector {
  /** e.g. "ESOS 3", "ESMM K/L". */
  sector: string;
  callsign: 'SWEDEN CONTROL' | 'SWEDEN INFORMATION';
  frequency: string;
  /**
   * False where the chart shows only higher sectors here, so the one with the lowest floor is
   * given; or, with `alternative`, where the chart doesn't settle which of two applies.
   */
  exact: boolean;
  alternative?: { sector: string; callsign: string; frequency: string };
}

interface Entry extends SwedenControlSector {
  /** Polygons of [lon, lat] rings, outer first. */
  polygons: number[][][][];
}

const SECTORS = (data as { sectors: Entry[] }).sectors;
export const SWEDEN_CONTROL_SOURCE: string = data.source;
export const SWEDEN_CONTROL_URL: string = data.sourceUrl;

/** Treated as in a sector when this close to it (the tracing leaves slivers between sectors). */
const SNAP_NM = 1.5;
/** Another frequency this close is mentioned as well. */
const BOUNDARY_NM = 2;

function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lon: number, lat: number, rings: number[][][]): boolean {
  return inRing(lon, lat, rings[0]) && !rings.slice(1).some(h => inRing(lon, lat, h));
}

/** Distance in NM from a point to a polygon's edges (flat-earth, fine over a few miles). */
function edgeDistanceNm(lon: number, lat: number, rings: number[][][]): number {
  const kx = 60 * Math.cos((lat * Math.PI) / 180), ky = 60;
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lon) * kx, ay = (ring[i - 1][1] - lat) * ky;
      const bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

function strip(e: Entry): SwedenControlSector {
  const { sector, callsign, frequency, exact, alternative } = e;
  return alternative ? { sector, callsign, frequency, exact, alternative } : { sector, callsign, frequency, exact };
}

export interface SwedenControlHere {
  sector: SwedenControlSector;
  /** Other frequencies within about 2 NM: near a boundary, so either may be right. */
  nearby: SwedenControlSector[];
}

/** The Sweden Control sector at a point in the Swedish FIR, or null outside it. */
export function swedenControlAt(lat: number, lon: number): SwedenControlHere | null {
  const scored = SECTORS.map(s => ({
    s,
    d: s.polygons.some(p => inPolygon(lon, lat, p)) ? 0 : Math.min(...s.polygons.map(p => edgeDistanceNm(lon, lat, p))),
  })).sort((a, b) => a.d - b.d || Number(b.s.exact) - Number(a.s.exact));
  const first = scored[0];
  if (!first || first.d > SNAP_NM) return null;
  const nearby: SwedenControlSector[] = [];
  for (const { s, d } of scored.slice(1)) {
    if (d > BOUNDARY_NM) break;
    if (s.frequency !== first.s.frequency && !nearby.some(n => n.frequency === s.frequency)) nearby.push(strip(s));
  }
  return { sector: strip(first.s), nearby };
}

const CALLSIGN_TEXT: Record<string, string> = { 'SWEDEN CONTROL': 'Sweden Control', 'SWEDEN INFORMATION': 'Sweden Information' };

/** "Sweden Control 131.130". */
export function swedenControlText(s: { callsign: string; frequency: string }): string {
  return `${CALLSIGN_TEXT[s.callsign] ?? s.callsign} ${s.frequency}`;
}

/** One sentence for a pilot in class G at a point. */
export function swedenControlAdvice(here: SwedenControlHere): string {
  const s = here.sector;
  const alt = s.alternative ? ` or ${swedenControlText(s.alternative)} (the chart doesn't settle which here)` : '';
  const near = here.nearby.length ? `; near the boundary with ${here.nearby.map(swedenControlText).join(', ')}` : '';
  const approx = !s.exact && !s.alternative ? ' (approximate here)' : '';
  return `Call ${swedenControlText(s)}${alt} for flight information or flight following, sector ${s.sector}${approx}${near}.`;
}

/** A stretch of the route in one Sweden Control frequency. */
export interface SwedenControlLeg {
  fromNm: number;
  toNm: number;
  sector: SwedenControlSector;
}

const AS_AIRSPACES: Array<AirspaceView & { entry: Entry }> = SECTORS.flatMap((s, i) => s.polygons.map((p, j) => ({
  id: `sc-${i}-${j}`, name: s.sector, type: 'FIS', icaoClass: 'G', activation: null,
  lower: { ft: 0, datum: 'GND' as const, label: 'GND' }, upper: { ft: 9500, datum: 'STD' as const, label: 'FL95' },
  polygon: p[0] as Array<[number, number]>, frequencies: [], entry: s,
})));

/** The Sweden Control frequencies along a route, in order; stretches outside Sweden are left out. */
export function swedenControlAlong(route: RoutePosition[]): SwedenControlLeg[] {
  const crossings = crossingsAlong(route, AS_AIRSPACES)
    .map(c => ({ fromNm: c.fromNm, toNm: c.toNm, entry: (c.airspace as typeof AS_AIRSPACES[number]).entry }))
    .sort((a, b) => a.fromNm - b.fromNm);
  const legs: SwedenControlLeg[] = [];
  for (const c of crossings) {
    const last = legs[legs.length - 1];
    if (last && last.sector.frequency === c.entry.frequency && c.fromNm <= last.toNm + 1) {
      last.toNm = Math.max(last.toNm, c.toNm);
      continue;
    }
    // Slivers from where two traced outlines overlap.
    if (last && c.toNm <= last.toNm) continue;
    legs.push({ fromNm: last ? Math.max(c.fromNm, last.toNm) : c.fromNm, toNm: c.toNm, sector: strip(c.entry) });
  }
  return legs.filter(l => l.toNm - l.fromNm >= 1 || legs.length === 1);
}
