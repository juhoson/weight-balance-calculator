// Flying the route in the forecast: heading, groundspeed, time and weather per segment of about
// 25 NM, each in the forecast for the time it is flown.
import { model as magneticModel } from 'geomagnetism';
import type { CloudLayer, EnrouteForecast, EnrouteSegment, RouteLeg, RouteWeather } from '../types/route';

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const norm360 = (d: number) => ((d % 360) + 360) % 360;

export interface Wind {
  /** Where it blows from, degrees true. */
  fromTrue: number;
  kt: number;
  tempC: number | null;
}

export interface Triangle {
  /** Wind correction angle: positive = into a wind from the right. */
  wcaDeg: number;
  headingTrue: number;
  groundSpeedKt: number;
  /** Positive = headwind. */
  headwindKt: number;
}

/** The wind triangle for a true course and airspeed. Null when the wind is too strong to hold the course. */
export function windTriangle(courseTrue: number, tasKt: number, wind: Pick<Wind, 'fromTrue' | 'kt'>): Triangle | null {
  const angle = rad(wind.fromTrue - courseTrue);
  const cross = wind.kt * Math.sin(angle);
  const head = wind.kt * Math.cos(angle);
  if (!(tasKt > 0) || Math.abs(cross) >= tasKt) return null;
  const wca = Math.asin(cross / tasKt);
  const gs = tasKt * Math.cos(wca) - head;
  if (gs <= 1) return null;
  return { wcaDeg: deg(wca), headingTrue: norm360(courseTrue + deg(wca)), groundSpeedKt: gs, headwindKt: head };
}

type WindSeries = Pick<EnrouteSegment, 'windDirTrue' | 'windKt' | 'tempC'>;

/** The forecast wind at a moment, between the hours on either side. Null outside the forecast or without data. */
export function windAt(times: string[], series: WindSeries, at: Date): Wind | null {
  const t = at.getTime();
  const ms = times.map(s => Date.parse(s));
  if (ms.length === 0 || t < ms[0] - 30 * 60_000 || t > ms[ms.length - 1] + 30 * 60_000) return null;
  let i = ms.findIndex(x => x > t);
  if (i === -1) i = ms.length - 1;
  const lo = Math.max(0, i - 1);
  const f = i === lo ? 0 : Math.min(1, Math.max(0, (t - ms[lo]) / (ms[i] - ms[lo])));
  const vec = (k: number) => {
    const d = series.windDirTrue[k], s = series.windKt[k];
    return d === null || s === null || d === undefined || s === undefined
      ? null : { u: -s * Math.sin(rad(d)), v: -s * Math.cos(rad(d)), temp: series.tempC[k] ?? null };
  };
  const a = vec(lo), b = vec(i);
  if (!a || !b) return toWind(a ?? b); // one hour missing: the other one, if any
  const u = a.u + (b.u - a.u) * f, v = a.v + (b.v - a.v) * f;
  const temp = a.temp !== null && b.temp !== null ? a.temp + (b.temp - a.temp) * f : a.temp ?? b.temp;
  return toWind({ u, v, temp });
}

function toWind(x: { u: number; v: number; temp: number | null } | null): Wind | null {
  if (!x) return null;
  return { fromTrue: norm360(deg(Math.atan2(-x.u, -x.v))), kt: Math.hypot(x.u, x.v), tempC: x.temp };
}

/** The forecast hour nearest a moment, or -1 outside the forecast. */
export function nearestHour(times: string[], at: Date): number {
  let best = -1, bestDiff = Infinity;
  times.forEach((s, i) => {
    const diff = Math.abs(Date.parse(s) - at.getTime());
    if (diff < bestDiff) { best = i; bestDiff = diff; }
  });
  return bestDiff <= 45 * 60_000 ? best : -1;
}

let modelCache: { day: string; model: ReturnType<typeof magneticModel> } | null = null;

/** Magnetic variation (declination), degrees: east positive. World Magnetic Model 2025. */
export function variationAt(lat: number, lon: number, date: Date): number {
  const day = date.toISOString().slice(0, 10);
  if (modelCache?.day !== day) modelCache = { day, model: magneticModel(date, { allowOutOfBoundsModel: true }) };
  return modelCache.model.point([lat, lon]).decl;
}

/** True to magnetic: east variation is subtracted ("east is least"). */
export const toMagnetic = (trueDeg: number, variationDeg: number) => norm360(trueDeg - variationDeg);

export interface SegmentPlan {
  segment: EnrouteSegment;
  wind: Wind;
  triangle: Triangle;
  variationDeg: number;
  magneticCourse: number;
  magneticHeading: number;
  /** Unrounded; with a climb or descent in the segment, at its mix of speeds. */
  minutes: number;
  /** Average over the segment (lower where it includes the climb). */
  groundSpeedKt: number;
  departs: Date;
  arrives: Date;
  /** The forecast hour used for cloud and freezing level (nearest the middle of the segment). */
  hour: number;
  cloudBaseFt: number | null;
  freezingLevelFt: number | null;
  layers: CloudLayer[];
  /** The altitude it's flown at: the cruise altitude, or a hold's. */
  altitudeFt: number;
  /** Cruise true airspeed at that altitude. */
  tasKt: number;
}

export interface LegPlan {
  leg: RouteLeg;
  segments: SegmentPlan[];
  minutes: number;
}

/** Climb at Vy from the departure field, cruise, descend at cruise speed to circuit altitude. */
export interface VerticalProfile {
  cruiseFt: number;
  /** Departure field elevation. */
  departureFt: number;
  /** Where the descent ends: circuit altitude over the arrival field. */
  arrivalFt: number;
  /** Vy as true airspeed. */
  climbTasKt: number;
  climbFpm: number;
  descentFpm: number;
  /** Stretches flown at another altitude (under or over an airspace); the rest at the cruise altitude. */
  holds?: AltitudeHold[];
}

/** "At 2,000 ft from 20 to 40 NM": the descent into it ends before it starts, the climb out starts after it ends. */
export interface AltitudeHold {
  fromNm: number;
  toNm: number;
  ft: number;
  /** Why, e.g. "Under STOCKHOLM TMA". */
  note?: string;
}

/** A corner of the flight path: altitude at a distance from the departure, straight lines between. */
export interface PathPoint {
  nm: number;
  ft: number;
}

export interface ProfilePlan {
  /** The highest altitude reached: the cruise altitude, or lower when the route is too short for it. */
  topFt: number;
  reachesCruise: boolean;
  departureFt: number;
  arrivalFt: number;
  /** Top of climb and top of descent, NM from the departure. */
  tocNm: number;
  todNm: number;
  climbMinutes: number;
  descentMinutes: number;
  tocAt: Date;
  todAt: Date;
  /** The whole path, departure to circuit altitude over the arrival. */
  path: PathPoint[];
  /** Holds the climb or descent can't reach in time at these rates (the path is steeper there). */
  missed: AltitudeHold[];
}

export type RoutePlan =
  | { ok: true; legs: LegPlan[]; segments: SegmentPlan[]; minutes: number; profile: ProfilePlan | null }
  /** No forecast for some segment at that time, or a wind the aircraft can't fly against. */
  | { ok: false; reason: 'no-forecast' | 'too-windy'; leg: RouteLeg };

/** The route's legs; a route without per-leg data is one leg. */
export function legsOf(route: RouteWeather): RouteLeg[] {
  return route.legs?.length
    ? route.legs
    : [{ from: route.departure.code, to: route.arrival.code, distanceNm: route.distanceNm, trueCourseDeg: route.trueCourseDeg }];
}

/**
 * Each segment in the forecast for the middle of the time it's flown: the wind an hour into the
 * flight is the forecast for that hour at that place.
 */
export function planRoute(legs: RouteLeg[], forecast: EnrouteForecast, airspeed: Airspeed, departure: Date,
  vertical?: VerticalProfile): RoutePlan {
  const segments: SegmentPlan[] = [];
  let at = departure.getTime();
  for (const segment of forecast.segments) {
    const leg = legs[segment.leg];
    if (!leg) return { ok: false, reason: 'no-forecast', leg: legs[legs.length - 1] };
    const altitudeFt = levelAt(segment.startNm + segment.distanceNm / 2, vertical?.cruiseFt ?? forecast.altitudeFt, vertical?.holds);
    const tasKt = tasAt(airspeed, altitudeFt);
    // Guess the middle of the segment at airspeed, then once more at the groundspeed found.
    let minutes = (segment.distanceNm / tasKt) * 60;
    let found: { wind: Wind; triangle: Triangle } | null = null;
    for (let pass = 0; pass < 2; pass++) {
      const wind = windAt(forecast.times, segment, new Date(at + (minutes / 2) * 60_000));
      if (!wind) return { ok: false, reason: 'no-forecast', leg };
      const triangle = windTriangle(segment.trueCourseDeg, tasKt, wind);
      if (!triangle) return { ok: false, reason: 'too-windy', leg };
      found = { wind, triangle };
      minutes = (segment.distanceNm / triangle.groundSpeedKt) * 60;
    }
    if (!found) return { ok: false, reason: 'no-forecast', leg };
    const departs = new Date(at);
    const middle = new Date(at + (minutes / 2) * 60_000);
    const hour = nearestHour(forecast.times, middle);
    const variation = variationAt(segment.lat, segment.lon, departs);
    segments.push({
      segment, ...found, minutes, groundSpeedKt: found.triangle.groundSpeedKt, departs, arrives: new Date(at + minutes * 60_000), hour,
      variationDeg: variation,
      magneticCourse: toMagnetic(segment.trueCourseDeg, variation),
      magneticHeading: toMagnetic(found.triangle.headingTrue, variation),
      cloudBaseFt: hour < 0 ? null : segment.cloudBaseFt[hour] ?? null,
      freezingLevelFt: hour < 0 ? null : segment.freezingLevelFt[hour] ?? null,
      layers: hour < 0 ? [] : segment.layers[hour] ?? [],
      altitudeFt, tasKt,
    });
    at += minutes * 60_000;
  }
  if (segments.length === 0) return { ok: false, reason: 'no-forecast', leg: legs[0] };
  const profile = vertical ? withProfile(segments, vertical, departure, tasAt(airspeed, vertical.cruiseFt)) : null;
  const legPlans: LegPlan[] = legs.map((leg, i) => {
    const own = segments.filter(s => s.segment.leg === i);
    return { leg, segments: own, minutes: own.reduce((sum, s) => sum + s.minutes, 0) };
  });
  return { ok: true, legs: legPlans, segments, minutes: segments.reduce((sum, s) => sum + s.minutes, 0), profile };
}

/** The altitude flown at a point: a hold's there, otherwise the cruise altitude. */
export function levelAt(nm: number, cruiseFt: number, holds: AltitudeHold[] = []): number {
  return holds.find(h => nm >= h.fromNm && nm <= h.toNm)?.ft ?? cruiseFt;
}

/** Holds sorted, inside the route, without overlaps (a later one wins where they overlap). */
export function tidyHolds(holds: AltitudeHold[], totalNm: number): AltitudeHold[] {
  const out: AltitudeHold[] = [];
  for (const h of holds) {
    const c = { ...h, fromNm: Math.max(0, h.fromNm), toNm: Math.min(totalNm, h.toNm) };
    if (c.toNm - c.fromNm < 0.1) continue;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].fromNm < c.toNm && out[i].toNm > c.fromNm) out.splice(i, 1);
    out.push(c);
  }
  return out.sort((x, y) => x.fromNm - y.fromNm);
}

/**
 * The path with holds, in still air: climb at Vy from the departure, cruise, holds and the descent to
 * circuit altitude. The descent into a hold ends where it starts and the climb out starts where it
 * ends; between holds too short to get back to the cruise altitude, the flight stays where it is.
 */
export function steppedPath(totalNm: number, v: VerticalProfile, cruiseTasKt: number): { path: PathPoint[]; missed: AltitudeHold[]; climbs: Array<[number, number]> } {
  const climbNm = (dFt: number) => (dFt / v.climbFpm / 60) * v.climbTasKt;
  const descentNm = (dFt: number) => (dFt / v.descentFpm / 60) * cruiseTasKt;
  const change = (from: number, to: number) => (to > from ? climbNm(to - from) : descentNm(from - to));
  const holds = tidyHolds(v.holds ?? [], totalNm);
  // The route in stretches: the cruise altitude between holds (free to change in), and the holds (fixed).
  const stretches: Array<{ s: number; e: number; ft: number; hold?: AltitudeHold }> = [];
  let at = 0;
  for (const h of holds) {
    if (h.fromNm > at) stretches.push({ s: at, e: h.fromNm, ft: v.cruiseFt });
    stretches.push({ s: h.fromNm, e: h.toNm, ft: h.ft, hold: h });
    at = h.toNm;
  }
  if (at < totalNm) stretches.push({ s: at, e: totalNm, ft: v.cruiseFt });

  const path: PathPoint[] = [{ nm: 0, ft: v.departureFt }];
  const missed: AltitudeHold[] = [];
  const climbs: Array<[number, number]> = [];
  let cur = path[0];
  /** Level at `start`, then straight to `ft` over the distance it takes. */
  const go = (ft: number, start: number) => {
    if (start > cur.nm) path.push({ nm: start, ft: cur.ft });
    const p = { nm: Math.min(totalNm, start + change(cur.ft, ft)), ft };
    path.push(p);
    if (ft > cur.ft) climbs.push([start, p.nm]);
    cur = p;
  };
  stretches.forEach((st, k) => {
    if (st.ft === cur.ft) return;
    const d = change(cur.ft, st.ft);
    if (st.hold) {
      // Into a hold: as late as still gets there in time, or straight away climbing out of the departure.
      const start = cur.nm === 0 && st.ft > cur.ft ? 0 : Math.max(cur.nm, st.s - d);
      // Drawn as flown: still changing inside it. That matters only on the wrong side of it: still
      // below one above the cruise altitude (over something), or above one below it (under something).
      const wrongSide = st.ft > cur.ft ? st.ft > v.cruiseFt : st.ft < v.cruiseFt;
      if (start + d > st.s + 0.05 && wrongSide) missed.push(st.hold);
      go(st.ft, start);
      return;
    }
    // Back to the cruise altitude only if there's room to get there and on to what follows.
    const start = Math.max(cur.nm, st.s);
    const next = stretches[k + 1]?.ft ?? v.arrivalFt;
    if (start + d + change(st.ft, next) > st.e) return;
    go(st.ft, start);
  });
  if (cur.ft !== v.arrivalFt) {
    // The descent to circuit altitude, steeper if it must be to end over the field.
    const d = change(cur.ft, v.arrivalFt);
    const start = Math.max(cur.nm, totalNm - d);
    if (start > cur.nm) path.push({ nm: start, ft: cur.ft });
    if (v.arrivalFt > cur.ft) climbs.push([start, totalNm]);
    path.push({ nm: totalNm, ft: v.arrivalFt });
  } else if (cur.nm < totalNm) path.push({ nm: totalNm, ft: cur.ft });
  return { path, missed, climbs };
}

/**
 * Adds the climb and descent: finds the top of climb (at Vy, in each segment's wind) and the top of
 * descent (at cruise speed, so it costs no extra time), retimes the segments the climb slows down,
 * and lowers the top when the route is too short to reach the cruise altitude. With holds, the path
 * comes from steppedPath and every climb slows the segments it's in. Segments are changed in place.
 */
function withProfile(segments: SegmentPlan[], v: VerticalProfile, departure: Date, cruiseTasKt: number): ProfilePlan {
  const start = (i: number) => segments[i].segment.startNm;
  const dist = (i: number) => segments[i].segment.distanceNm;
  const total = start(segments.length - 1) + dist(segments.length - 1);
  const cruiseGs = segments.map(s => s.triangle.groundSpeedKt);
  const climbGs = segments.map((s, i) => windTriangle(s.segment.trueCourseDeg, v.climbTasKt, s.wind)?.groundSpeedKt ?? cruiseGs[i]);

  let path: PathPoint[];
  let climbs: Array<[number, number]>;
  let missed: AltitudeHold[] = [];
  let top: number, toc: number, tod: number;
  if (v.holds?.length) {
    ({ path, climbs, missed } = steppedPath(total, v, cruiseTasKt));
    top = Math.max(...path.map(p => p.ft));
    toc = path[1]?.nm ?? 0;
    tod = path.length > 2 ? path[path.length - 2].nm : toc;
  } else {
    // Where along the route a number of minutes at these groundspeeds ends, from the start or the end.
    const forward = (gs: number[], minutes: number) => {
      let t = 0;
      for (let i = 0; i < segments.length; i++) {
        const m = (dist(i) / gs[i]) * 60;
        if (t + m >= minutes) return start(i) + ((minutes - t) / 60) * gs[i];
        t += m;
      }
      return total;
    };
    const backward = (gs: number[], minutes: number) => {
      let t = 0;
      for (let i = segments.length - 1; i >= 0; i--) {
        const m = (dist(i) / gs[i]) * 60;
        if (t + m >= minutes) return start(i) + dist(i) - ((minutes - t) / 60) * gs[i];
        t += m;
      }
      return 0;
    };
    const tocOf = (h: number) => forward(climbGs, Math.max(0, h - v.departureFt) / v.climbFpm);
    const todOf = (h: number) => backward(cruiseGs, Math.max(0, h - v.arrivalFt) / v.descentFpm);

    top = v.cruiseFt;
    if (tocOf(top) > todOf(top)) {
      // Too short: the highest altitude where the climb and the descent meet.
      let lo = Math.min(v.cruiseFt, Math.max(v.departureFt, v.arrivalFt)), hi = v.cruiseFt;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (tocOf(mid) <= todOf(mid)) lo = mid; else hi = mid;
      }
      top = lo;
    }
    toc = tocOf(top);
    tod = Math.max(toc, todOf(top));
    path = [{ nm: 0, ft: v.departureFt }, { nm: toc, ft: top }, { nm: tod, ft: top }, { nm: total, ft: v.arrivalFt }];
    climbs = [[0, toc]];
  }

  // Retime: the parts of each segment that climb are flown at the climb groundspeed.
  const climbingIn = (a: number, b: number) => climbs.reduce((sum, [c0, c1]) => sum + Math.max(0, Math.min(b, c1) - Math.max(a, c0)), 0);
  let at = departure.getTime();
  let tocAt = departure, todAt = departure;
  segments.forEach((s, i) => {
    const s0 = start(i), s1 = s0 + dist(i);
    const climbPart = climbingIn(s0, s1);
    const minutes = (climbPart / climbGs[i] + (dist(i) - climbPart) / cruiseGs[i]) * 60;
    const timeAt = (nm: number) => {
      const c = climbingIn(s0, nm);
      return at + ((c / climbGs[i] + (nm - s0 - c) / cruiseGs[i]) * 60) * 60_000;
    };
    if (toc >= s0 && toc <= s1) tocAt = new Date(timeAt(toc));
    if (tod >= s0 && tod <= s1) todAt = new Date(timeAt(tod));
    s.departs = new Date(at);
    s.minutes = minutes;
    s.groundSpeedKt = (dist(i) / minutes) * 60;
    at += minutes * 60_000;
    s.arrives = new Date(at);
  });
  const firstFt = path[1]?.ft ?? v.departureFt;
  const lastFt = path.length > 2 ? path[path.length - 2].ft : firstFt;
  return {
    topFt: top, reachesCruise: v.holds?.length ? path.some(p => Math.abs(p.ft - v.cruiseFt) < 1) || path.length <= 2 : top >= v.cruiseFt - 1,
    departureFt: v.departureFt, arrivalFt: v.arrivalFt,
    tocNm: toc, todNm: tod,
    climbMinutes: Math.max(0, firstFt - v.departureFt) / v.climbFpm,
    descentMinutes: Math.max(0, lastFt - v.arrivalFt) / v.descentFpm,
    tocAt, todAt, path, missed,
  };
}

/** The book cruise speed is taken as the true airspeed at this altitude. */
export const BOOK_SPEED_AT_FT = 3000;

/** Where full throttle can no longer hold the power (normally aspirated): about 7,000 ft at 75%, 3,000 ft higher per 10% less. */
export const fullThrottleFt = (powerPct: number) => 7000 + (75 - Math.min(100, Math.max(40, powerPct))) * 300;

/**
 * Cruise true airspeed at an altitude, an estimate: at the same power about 1.5% faster per 1,000 ft
 * up to full-throttle altitude, then about 1% slower per 1,000 ft as the power falls off.
 */
export function cruiseTas(bookKt: number, ft: number, powerPct = 75): number {
  const top = fullThrottleFt(powerPct);
  const gain = (h: number) => (0.015 * Math.min(h, top) - 0.01 * Math.max(0, h - top)) / 1000;
  return (bookKt * (1 + gain(Math.max(0, ft)))) / (1 + gain(BOOK_SPEED_AT_FT));
}

/** The cruise true airspeed: the same at every altitude, or by altitude. */
export type Airspeed = number | ((ft: number) => number);
export const tasAt = (airspeed: Airspeed, ft: number) => (typeof airspeed === 'number' ? airspeed : airspeed(ft));

/** Circuit altitude: the descent ends this far above the arrival field. */
export const CIRCUIT_HEIGHT_FT = 1000;

/** True airspeed from indicated: about 2% more per 1,000 ft (rule of thumb). */
export const trueAirspeed = (iasKt: number, altitudeFt: number) => iasKt * (1 + 0.02 * Math.max(0, altitudeFt) / 1000);

/** Within this much of the cloud base counts as too close (VFR clearance from cloud). */
export const CLOUD_MARGIN_FT = 500;
/** Less than this above the (averaged) terrain is flagged. */
export const TERRAIN_MARGIN_FT = 1000;

export interface PlanWarnings {
  /** Segments where the forecast cloud base is below or near the cruise altitude. */
  nearCloud: SegmentPlan[];
  lowestBaseFt: number | null;
  /** Segments less than 1,000 ft above the model terrain. */
  lowTerrain: SegmentPlan[];
  /** Segments where the cruise is at or above the freezing level inside cloud: icing. */
  icing: SegmentPlan[];
}

export function warningsOf(segments: SegmentPlan[], cruiseFt: number): PlanWarnings {
  const alt = (s: SegmentPlan) => s.altitudeFt ?? cruiseFt;
  const nearCloud = segments.filter(s => s.cloudBaseFt !== null && s.cloudBaseFt < alt(s) + CLOUD_MARGIN_FT);
  const bases = nearCloud.map(s => s.cloudBaseFt as number);
  return {
    nearCloud,
    lowestBaseFt: bases.length ? Math.min(...bases) : null,
    lowTerrain: segments.filter(s => s.segment.groundFt !== null && alt(s) < s.segment.groundFt + TERRAIN_MARGIN_FT),
    icing: segments.filter(s => s.cloudBaseFt !== null && s.cloudBaseFt <= alt(s)
      && s.freezingLevelFt !== null && s.freezingLevelFt <= alt(s)),
  };
}

/** Minutes rounded up to 5, at least 5 (as the flight time without wind). */
export const roundUpTo5 = (minutes: number) => (minutes > 0 ? Math.max(5, Math.ceil(minutes / 5) * 5) : 0);
