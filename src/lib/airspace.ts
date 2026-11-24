import { distanceNm, intermediate, type RoutePosition } from './openMeteo';
import type { AirspaceView } from '../types/route';

/** Sample spacing along the route; airspace corners smaller than this can be missed. */
export const SAMPLE_NM = 0.25;
/** Passing this close above or below an airspace is flagged. */
export const MARGIN_FT = 500;
/**
 * An AGL limit is above sea level by however high the ground is, which isn't known here. To err
 * on the side of "inside", an AGL floor is taken as over sea-level ground and an AGL ceiling as
 * over the highest route airport; within this much of either counts as "close".
 */
export const AGL_MARGIN_FT = 1000;

/** Where the route is inside an airspace's outline, NM from the departure. */
export interface Crossing {
  airspace: AirspaceView;
  fromNm: number;
  toNm: number;
}

export type VerticalStatus = 'inside' | 'close' | 'above' | 'below';

export interface AirspaceCheck extends Crossing {
  status: VerticalStatus;
  /** The flight's lowest and highest altitude while under the outline. */
  minFt: number;
  maxFt: number;
  /** The limits in feet above sea level, as compared. */
  floorFt: number;
  ceilingFt: number;
}

/** Altitude above sea level along the route. */
export type AltitudeAt = (nm: number) => number;

/** Climb, cruise, descent: a path from the departure field to circuit height over the arrival. */
export interface PathProfile {
  departureFt: number;
  arrivalFt: number;
  topFt: number;
  tocNm: number;
  todNm: number;
  totalNm: number;
}

export function altitudeAlong(p: PathProfile): AltitudeAt {
  return nm => {
    if (nm <= p.tocNm) return p.tocNm <= 0 ? p.topFt : p.departureFt + (p.topFt - p.departureFt) * Math.max(0, nm) / p.tocNm;
    if (nm <= p.todNm) return p.topFt;
    const left = p.totalNm - p.todNm;
    return left <= 0 ? p.arrivalFt : p.topFt + (p.arrivalFt - p.topFt) * Math.min(1, (nm - p.todNm) / left);
  };
}

/** Altitude along a path given by its corners, straight between them. */
export function altitudeAlongPoints(path: Array<{ nm: number; ft: number }>): AltitudeAt {
  return nm => {
    if (path.length === 0) return 0;
    if (nm <= path[0].nm) return path[0].ft;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (nm <= b.nm) return b.nm - a.nm < 1e-9 ? b.ft : a.ft + (b.ft - a.ft) * (nm - a.nm) / (b.nm - a.nm);
    }
    return path[path.length - 1].ft;
  };
}

/** The corners of a climb–cruise–descent profile. */
export const pointsOf = (p: PathProfile) =>
  [{ nm: 0, ft: p.departureFt }, { nm: p.tocNm, ft: p.topFt }, { nm: p.todNm, ft: p.topFt }, { nm: p.totalNm, ft: p.arrivalFt }];

/**
 * The same climb and descent without wind, for when there's no forecast plan: climb at the Vy
 * true airspeed, descend at the cruise one, and top out lower where the route is too short.
 */
export function stillAirProfile(totalNm: number, v: {
  cruiseFt: number; departureFt: number; arrivalFt: number; climbTasKt: number; climbFpm: number;
  cruiseTasKt: number; descentFpm: number;
}): PathProfile {
  const climbNm = (top: number) => (Math.max(0, top - v.departureFt) / v.climbFpm / 60) * v.climbTasKt;
  const descentNm = (top: number) => (Math.max(0, top - v.arrivalFt) / v.descentFpm / 60) * v.cruiseTasKt;
  let top = v.cruiseFt;
  if (climbNm(top) + descentNm(top) > totalNm) {
    let lo = Math.min(v.cruiseFt, Math.max(v.departureFt, v.arrivalFt)), hi = v.cruiseFt;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (climbNm(mid) + descentNm(mid) <= totalNm) lo = mid; else hi = mid;
    }
    top = lo;
  }
  const toc = Math.min(totalNm, climbNm(top));
  return { departureFt: v.departureFt, arrivalFt: v.arrivalFt, topFt: top, tocNm: toc,
    todNm: Math.max(toc, totalNm - descentNm(top)), totalNm };
}

function insidePolygon(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Where the route (straight legs between the positions) is inside each airspace's outline, in route order. */
export function crossingsAlong(route: RoutePosition[], airspaces: AirspaceView[]): Crossing[] {
  const samples: Array<{ nm: number; lat: number; lon: number }> = [];
  let start = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const d = distanceNm(a.lat, a.lon, b.lat, b.lon);
    const n = Math.max(1, Math.ceil(d / SAMPLE_NM));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      const [lat, lon] = intermediate(a.lat, a.lon, b.lat, b.lon, k / n);
      samples.push({ nm: start + (d * k) / n, lat, lon });
    }
    start += d;
  }
  if (route.length === 1) samples.push({ nm: 0, lat: route[0].lat, lon: route[0].lon });

  const out: Crossing[] = [];
  for (const airspace of airspaces) {
    const ring = airspace.polygon;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    let open: Crossing | null = null;
    for (const s of samples) {
      const inside = s.lat >= minLat && s.lat <= maxLat && s.lon >= minLon && s.lon <= maxLon
        && insidePolygon(s.lon, s.lat, ring);
      if (inside) {
        if (open) open.toNm = s.nm;
        else open = { airspace, fromNm: s.nm, toNm: s.nm };
      } else if (open) {
        out.push(open);
        open = null;
      }
    }
    if (open) out.push(open);
  }
  return out.sort((a, b) => a.fromNm - b.fromNm || a.toNm - b.toNm);
}

/** A limit in feet above sea level; an AGL limit is placed over the given ground elevation. */
function limitFt(l: AirspaceView['lower'], groundFt: number): number {
  return l.datum === 'GND' ? (l.ft === 0 ? -Infinity : l.ft + groundFt) : l.ft;
}

/** Whether the flight is inside each airspace vertically too, or how close it passes. */
/**
 * @param extraNm  where the path bends (top of climb, top of descent)
 * @param groundFt the highest route airport's elevation, for AGL ceilings
 * @param landing  the route length and arrival field elevation: the path ends at circuit height,
 *                 but the flight goes on down to the runway, so airspace over the arrival counts down to it
 */
export function checkCrossings(crossings: Crossing[], altitudeAt: AltitudeAt, extraNm: number[], groundFt: number,
  landing?: { totalNm: number; fieldFt: number }): AirspaceCheck[] {
  return crossings.map(c => {
    // The path is straight between these, so its extremes over the crossing are at them.
    const at = [c.fromNm, c.toNm, ...extraNm.filter(nm => nm > c.fromNm && nm < c.toNm)].map(altitudeAt);
    if (landing && c.toNm >= landing.totalNm - 1) at.push(landing.fieldFt);
    const minFt = Math.min(...at), maxFt = Math.max(...at);
    const floorFt = limitFt(c.airspace.lower, 0);
    const ceilingFt = c.airspace.upper.datum === 'GND' && c.airspace.upper.ft === 0 ? -Infinity : limitFt(c.airspace.upper, groundFt);
    const floorMargin = c.airspace.lower.datum === 'GND' ? AGL_MARGIN_FT : MARGIN_FT;
    const ceilingMargin = c.airspace.upper.datum === 'GND' ? AGL_MARGIN_FT : MARGIN_FT;
    let status: VerticalStatus;
    if (maxFt >= floorFt && minFt <= ceilingFt) status = 'inside';
    else if (minFt > ceilingFt) status = minFt - ceilingFt < ceilingMargin ? 'close' : 'above';
    else status = floorFt - maxFt < floorMargin ? 'close' : 'below';
    return { ...c, status, minFt, maxFt, floorFt, ceilingFt };
  });
}

/** What a pilot needs to do about an airspace type, as a short hint. */
export function adviceFor(a: AirspaceView): { label: string; severity: 'prohibited' | 'restricted' | 'clearance' | 'contact' | 'info'; hint: string } {
  const cls = a.icaoClass ? ` (class ${a.icaoClass})` : '';
  const controlled = a.icaoClass !== null && 'ABCD'.includes(a.icaoClass);
  switch (a.type) {
  case 'P': return { label: 'Prohibited area', severity: 'prohibited', hint: 'No flight inside.' };
  case 'R': return { label: 'Restricted area', severity: 'restricted', hint: 'Check whether it is active and what is allowed.' };
  case 'D': return { label: 'Danger area', severity: 'restricted', hint: 'Check whether it is active.' };
  case 'TRA': case 'TSA': case 'MTA': return { label: a.type, severity: 'restricted', hint: 'Check whether it is active.' };
  case 'CTR': case 'MCTR': return { label: `Control zone${cls}`, severity: 'clearance', hint: controlled ? 'Clearance needed.' : 'Check the class and its rules.' };
  case 'TMA': return { label: `Terminal area${cls}`, severity: controlled ? 'clearance' : 'info', hint: controlled ? 'Clearance needed.' : 'Check the class and its rules.' };
  case 'CTA': return { label: `Control area${cls}`, severity: controlled ? 'clearance' : 'info', hint: controlled ? 'Clearance needed.' : 'Check the class and its rules.' };
  case 'GLIDING': return { label: 'Gliding sector', severity: 'info', hint: 'Check whether it is active.' };
  case 'SPORT': return { label: 'Sport or recreation area', severity: 'info', hint: 'Check its activity.' };
  case 'TMZ': return { label: 'Transponder zone', severity: 'contact', hint: 'Transponder required.' };
  case 'RMZ': return { label: 'Radio zone', severity: 'contact', hint: 'Radio contact required.' };
  case 'ATZ': case 'MATZ': case 'TIZ': case 'TIA': case 'HTZ':
    return { label: a.type, severity: 'contact', hint: 'Call the unit before entering.' };
  default: return { label: a.type === 'OTHER' ? `Airspace${cls}` : `${a.type.replace(/_/g, ' ').toLowerCase()}${cls}`, severity: controlled ? 'clearance' : 'info',
    hint: controlled ? 'Clearance needed.' : 'Check its rules.' };
  }
}
