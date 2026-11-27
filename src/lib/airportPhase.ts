/**
 * Close to a field: whether the aircraft is over a runway (taking off, until past its end), the zoom
 * that keeps the field's layout in view, and a go-around noticed from the GPS.
 */
import type { AirportLayout } from './airportLayout';

type LatLon = [number, number];

/** Metres east and north of `from` (flat over a field). */
function local(from: LatLon, p: LatLon): [number, number] {
  const m = 111_320;
  return [(p[1] - from[1]) * m * Math.cos((from[0] * Math.PI) / 180), (p[0] - from[0]) * m];
}

/** Off the centre line by no more than this, m, counts as over the runway. */
const RUNWAY_CORRIDOR_M = 100;

/** Over one of the fields' runways, between its ends (so not yet past the end on a takeoff). */
export function overRunway(layouts: AirportLayout[], at: { lat: number; lon: number }): boolean {
  return layouts.some(l => l.features.some(f => {
    if (f.kind !== 'runway' || f.points.length < 2) return false;
    const a = f.points[0], b = f.points[f.points.length - 1];
    const [ex, ny] = local(a, b), [px, py] = local(a, [at.lat, at.lon]);
    const len = Math.hypot(ex, ny);
    if (len < 1) return false;
    const along = (px * ex + py * ny) / len, cross = Math.abs(px * ny - py * ex) / len;
    return along >= 0 && along <= len && cross <= RUNWAY_CORRIDOR_M;
  }));
}

/** Taking off: the field's layout stays in view until past the runway's end or this high above the field. */
export const DEPARTURE_KEEP_FT = 300;
/** On the way in: the layout comes into view this low above the field (not climbing). */
export const APPROACH_SHOW_FT = 200;
/** Climbing faster than this, ft/min, is not an approach. */
const CLIMBING_FPM = 200;
/** Close enough in to see the runway and its taxiways with the aircraft moving fast. */
export const RUNWAY_ZOOM = 15;

/**
 * Near a field whose layout is drawn and flying (faster than a taxi): the runway zoom while over the
 * runway below DEPARTURE_KEEP_FT, or on the way in at APPROACH_SHOW_FT or lower; null otherwise.
 */
export function runwayZoom(o: { aglFt: number | null; vsFpm: number | null | undefined; overRunway: boolean }): number | null {
  if (o.aglFt == null) return null;
  if (o.overRunway && o.aglFt < DEPARTURE_KEEP_FT) return RUNWAY_ZOOM;
  if (o.aglFt <= APPROACH_SHOW_FT && (o.vsFpm ?? 0) < CLIMBING_FPM) return RUNWAY_ZOOM;
  return null;
}

/** The field the aircraft is close to, with its height above it. */
export interface NearField { code: string; aglFt: number; nm: number }

/** What the go-around watch has seen of an approach. */
export interface ApproachWatch {
  /** Descending low near this field; null when not on an approach. */
  field: string | null;
  lowestAglFt: number;
  /** True track on the way down: the runway it was lined up with. */
  trackDeg: number | null;
}

export const newApproachWatch = (): ApproachWatch => ({ field: null, lowestAglFt: Infinity, trackDeg: null });

/** An approach is watched from this low above the field, within APPROACH_NM of it. */
const APPROACH_AGL_FT = 500;
const APPROACH_NM = 3;
const DESCENDING_FPM = -150;
/** Climbing at this rate, this far above the lowest point of the approach, is a go-around (or a touch and go). */
const GO_AROUND_FPM = 300;
const GO_AROUND_GAIN_FT = 100;
/** Slower than this is on the ground: landed, no go-around. */
const FLYING_KT = 40;

export interface GoAround { field: string; trackDeg: number | null }

/** The next state of the watch for a fix, and a go-around when one has just begun. */
export function watchApproach(w: ApproachWatch, fix: { speedKt: number | null; trackDeg: number | null; vsFpm?: number | null },
  near: NearField | null): { watch: ApproachWatch; goAround: GoAround | null } {
  const flying = (fix.speedKt ?? 0) >= FLYING_KT;
  if (!near || !flying || near.nm > APPROACH_NM) return { watch: newApproachWatch(), goAround: null };
  const vs = fix.vsFpm ?? 0;
  if (w.field === near.code) {
    const lowest = Math.min(w.lowestAglFt, near.aglFt);
    if (vs >= GO_AROUND_FPM && near.aglFt >= lowest + GO_AROUND_GAIN_FT) {
      return { watch: newApproachWatch(), goAround: { field: near.code, trackDeg: w.trackDeg } };
    }
    return { watch: { field: w.field, lowestAglFt: lowest, trackDeg: vs <= DESCENDING_FPM ? fix.trackDeg ?? w.trackDeg : w.trackDeg }, goAround: null };
  }
  if (near.aglFt < APPROACH_AGL_FT && vs <= DESCENDING_FPM) {
    return { watch: { field: near.code, lowestAglFt: near.aglFt, trackDeg: fix.trackDeg }, goAround: null };
  }
  return { watch: newApproachWatch(), goAround: null };
}
