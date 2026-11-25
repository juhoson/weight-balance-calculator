/**
 * The navigation mode's sums: the GPS fix, which airspace the aircraft is in, the leg it's on,
 * and the airfields within gliding range. A VFR navigation aid: the pilot stays responsible.
 */
import type { AirportInfo, AirspaceView } from '../types/route';
import { containsAltitude, contactFrequencies } from './frequencies';
import { adviceFor, type Crossing } from './airspace';
import { courseDeg, distanceNm, intermediate } from './openMeteo';

export const MS_TO_KT = 1.943844;
export const M_TO_FT = 3.28084;
const FT_PER_NM = 6076.12;
/** Arrive over an airfield at least this high: a glide that only just reaches it doesn't count. */
export const ARRIVAL_MARGIN_FT = 500;
/** A conservative still-air glide ratio for a light single, when the pilot hasn't set one. */
export const DEFAULT_GLIDE_RATIO = 8;

type At = { lat: number; lon: number };

export interface Fix extends At {
  /** Ground speed. */
  speedKt: number | null;
  /** Track over the ground, true; null when not moving. */
  trackDeg: number | null;
  /** GPS altitude, above sea level (not pressure altitude). */
  altFt: number | null;
  accuracyM: number | null;
  /** ms since the epoch. */
  at: number;
}

/** Below this the GPS's own track is noise. */
const MOVING_MS = 1.5;

/** A fix from the browser's position, with speed and track worked out from the last one when the GPS doesn't give them. */
export function fixFrom(c: Pick<GeolocationCoordinates, 'latitude' | 'longitude' | 'speed' | 'heading' | 'altitude' | 'accuracy'>,
  at: number, prev: Fix | null): Fix {
  const lat = c.latitude, lon = c.longitude;
  const dt = prev ? (at - prev.at) / 1000 : 0;
  const movedNm = prev ? distanceNm(prev.lat, prev.lon, lat, lon) : 0;
  let speedKt = c.speed != null && Number.isFinite(c.speed) ? c.speed * MS_TO_KT : null;
  if (speedKt == null && prev && dt > 0) speedKt = movedNm / (dt / 3600);
  let trackDeg: number | null = null;
  if (c.heading != null && Number.isFinite(c.heading) && (c.speed ?? 0) >= MOVING_MS) trackDeg = c.heading;
  else if (prev && movedNm * 1852 > 25) trackDeg = courseDeg(prev.lat, prev.lon, lat, lon);
  else if (prev && (speedKt ?? 0) >= MOVING_MS * MS_TO_KT) trackDeg = prev.trackDeg;
  return {
    lat, lon, speedKt, trackDeg,
    altFt: c.altitude != null && Number.isFinite(c.altitude) ? c.altitude * M_TO_FT : null,
    accuracyM: Number.isFinite(c.accuracy) ? c.accuracy : null,
    at,
  };
}

/** Whether a point is inside a ring of [lon, lat] (ray casting). */
export function insidePolygon(lat: number, lon: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The airspaces at a position: those the aircraft is in (all above the point when the altitude is
 * unknown), lowest first, and those overhead, lowest floor first.
 */
export function airspacesHere(list: AirspaceView[], at: At, altFt: number | null): { inside: AirspaceView[]; above: AirspaceView[] } {
  const over = list.filter(a => a.polygon.length > 2 && insidePolygon(at.lat, at.lon, a.polygon));
  const byFloor = (a: AirspaceView, b: AirspaceView) => a.lower.ft - b.lower.ft;
  if (altFt == null) return { inside: over.sort(byFloor), above: [] };
  return {
    inside: over.filter(a => containsAltitude(a, altFt)).sort(byFloor),
    above: over.filter(a => a.lower.ft > altFt).sort(byFloor),
  };
}

export const bearingDistance = (from: At, to: At) => ({
  nm: distanceNm(from.lat, from.lon, to.lat, to.lon),
  deg: courseDeg(from.lat, from.lon, to.lat, to.lon),
});

/** A point's distance off a leg and how far along it, in NM (flat over a leg's length, which is plenty here). */
function offLeg(a: At, b: At, p: At): { offNm: number; alongNm: number; fraction: number } {
  const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const bx = (b.lon - a.lon) * k * 60, by = (b.lat - a.lat) * 60;
  const px = (p.lon - a.lon) * k * 60, py = (p.lat - a.lat) * 60;
  const len2 = bx * bx + by * by;
  const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return { offNm: Math.hypot(px - f * bx, py - f * by), alongNm: f * Math.sqrt(len2), fraction: f };
}

/**
 * The leg the aircraft is on: the one it's closest to, the later one where two are about as close
 * (at a turning point). `alongNm` is the distance flown along the route to abeam the aircraft.
 */
export function activeLeg(route: At[], p: At): { index: number; offNm: number; alongNm: number } | null {
  if (route.length < 2) return null;
  let best: { index: number; offNm: number; alongNm: number } | null = null;
  let before = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const o = offLeg(route[i], route[i + 1], p);
    if (!best || o.offNm <= best.offNm + 0.1) best = { index: i, offNm: o.offNm, alongNm: before + o.alongNm };
    before += distanceNm(route[i].lat, route[i].lon, route[i + 1].lat, route[i + 1].lon);
  }
  return best;
}

/** How far a glide from this height reaches in still air, in NM. */
export const glideRangeNm = (heightFt: number, ratio: number) => Math.max(0, heightFt) * ratio / FT_PER_NM;

export interface NearAirfield {
  airport: AirportInfo;
  nm: number;
  deg: number;
  /** The longest runway, if known. */
  runway: { lengthFt: number | null; surface: string } | null;
  /** Reached in a still-air glide arriving ARRIVAL_MARGIN_FT above it; null when the altitude is unknown. */
  reachable: boolean | null;
}

/** The nearest airfields, nearest first. */
export function nearestAirfields(airports: AirportInfo[], p: At, altFt: number | null, ratio: number, n = 8): NearAirfield[] {
  return airports
    .map(a => ({ a, ...bearingDistance(p, a) }))
    .sort((x, y) => x.nm - y.nm)
    .slice(0, n)
    .map(({ a, nm, deg }) => {
      const longest = [...a.runways].sort((x, y) => (y.lengthFt ?? 0) - (x.lengthFt ?? 0))[0];
      return {
        airport: a, nm, deg,
        runway: longest ? { lengthFt: longest.lengthFt, surface: longest.surface } : null,
        reachable: altFt == null ? null : glideRangeNm(altFt - (a.elevationFt ?? 0) - ARRIVAL_MARGIN_FT, ratio) >= nm,
      };
    });
}

/** Where along the route an aircraft is after this many NM, and its track there (for the demo flight). */
export function positionAlong(route: At[], nm: number): At & { trackDeg: number; done: boolean } {
  let left = Math.max(0, nm);
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const len = distanceNm(a.lat, a.lon, b.lat, b.lon);
    if (left <= len || i === route.length - 2) {
      const f = len === 0 ? 1 : Math.min(1, left / len);
      const [lat, lon] = intermediate(a.lat, a.lon, b.lat, b.lon, f);
      return { lat, lon, trackDeg: courseDeg(a.lat, a.lon, b.lat, b.lon), done: left >= len && i === route.length - 2 };
    }
    left -= len;
  }
  return { ...route[0], trackDeg: 0, done: true };
}

/** "8 min", "1 h 05 min"; "-" without a speed. */
export function eteText(nm: number, kt: number | null): string {
  if (!kt || kt < 20) return '-';
  const min = Math.round((nm / kt) * 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export const pad3 = (deg: number) => String(Math.round(((deg % 360) + 360) % 360) % 360).padStart(3, '0');

/** Ahead this far, the next controlled airspace (and whom to call there) is shown. */
export const NEXT_AIRSPACE_NM = 10;

/** Controlled: entering it takes a clearance (a control zone, or class A–D). */
export const isControlled = (a: AirspaceView) => adviceFor(a).severity === 'clearance';

/**
 * The next controlled airspace with a frequency that the path enters within NEXT_AIRSPACE_NM, at
 * this altitude (any, when unknown), not counting one the aircraft is already in.
 */
export function nextAirspace(crossings: Crossing[], alongNm: number, altFt: number | null, insideIds: Set<string>):
  { airspace: AirspaceView; inNm: number } | null {
  const next = crossings
    .filter(c => c.fromNm > alongNm && c.fromNm - alongNm <= NEXT_AIRSPACE_NM && !insideIds.has(c.airspace.id)
      && isControlled(c.airspace) && contactFrequencies(c.airspace.frequencies).length > 0
      && (altFt == null || containsAltitude(c.airspace, altFt)))
    .sort((a, b) => a.fromNm - b.fromNm)[0];
  return next ? { airspace: next.airspace, inNm: next.fromNm - alongNm } : null;
}
