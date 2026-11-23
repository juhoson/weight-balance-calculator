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
  /** Unrounded. */
  minutes: number;
  departs: Date;
  arrives: Date;
  /** The forecast hour used for cloud and freezing level (nearest the middle of the segment). */
  hour: number;
  cloudBaseFt: number | null;
  freezingLevelFt: number | null;
  layers: CloudLayer[];
}

export interface LegPlan {
  leg: RouteLeg;
  segments: SegmentPlan[];
  minutes: number;
}

export type RoutePlan =
  | { ok: true; legs: LegPlan[]; segments: SegmentPlan[]; minutes: number }
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
export function planRoute(legs: RouteLeg[], forecast: EnrouteForecast, tasKt: number, departure: Date): RoutePlan {
  const segments: SegmentPlan[] = [];
  let at = departure.getTime();
  for (const segment of forecast.segments) {
    const leg = legs[segment.leg];
    if (!leg) return { ok: false, reason: 'no-forecast', leg: legs[legs.length - 1] };
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
      segment, ...found, minutes, departs, arrives: new Date(at + minutes * 60_000), hour,
      variationDeg: variation,
      magneticCourse: toMagnetic(segment.trueCourseDeg, variation),
      magneticHeading: toMagnetic(found.triangle.headingTrue, variation),
      cloudBaseFt: hour < 0 ? null : segment.cloudBaseFt[hour] ?? null,
      freezingLevelFt: hour < 0 ? null : segment.freezingLevelFt[hour] ?? null,
      layers: hour < 0 ? [] : segment.layers[hour] ?? [],
    });
    at += minutes * 60_000;
  }
  if (segments.length === 0) return { ok: false, reason: 'no-forecast', leg: legs[0] };
  const legPlans: LegPlan[] = legs.map((leg, i) => {
    const own = segments.filter(s => s.segment.leg === i);
    return { leg, segments: own, minutes: own.reduce((sum, s) => sum + s.minutes, 0) };
  });
  return { ok: true, legs: legPlans, segments, minutes: segments.reduce((sum, s) => sum + s.minutes, 0) };
}

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

export function warningsOf(segments: SegmentPlan[], altitudeFt: number): PlanWarnings {
  const nearCloud = segments.filter(s => s.cloudBaseFt !== null && s.cloudBaseFt < altitudeFt + CLOUD_MARGIN_FT);
  const bases = nearCloud.map(s => s.cloudBaseFt as number);
  return {
    nearCloud,
    lowestBaseFt: bases.length ? Math.min(...bases) : null,
    lowTerrain: segments.filter(s => s.segment.groundFt !== null && altitudeFt < s.segment.groundFt + TERRAIN_MARGIN_FT),
    icing: segments.filter(s => s.cloudBaseFt !== null && s.cloudBaseFt <= altitudeFt
      && s.freezingLevelFt !== null && s.freezingLevelFt <= altitudeFt),
  };
}

/** Minutes rounded up to 5, at least 5 (as the flight time without wind). */
export const roundUpTo5 = (minutes: number) => (minutes > 0 ? Math.max(5, Math.ceil(minutes / 5) * 5) : 0);
