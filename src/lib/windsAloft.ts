// Flying the route in the forecast wind: heading, groundspeed and time per leg.
import type { RouteLeg, RouteWeather, WindsAloft, WindsAloftLeg } from '../types/route';

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm = (d: number) => ((d % 360) + 360) % 360;

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
  return { wcaDeg: deg(wca), headingTrue: norm(courseTrue + deg(wca)), groundSpeedKt: gs, headwindKt: head };
}

/** The forecast for a leg at a moment, between the hours on either side. Null outside the forecast or without data. */
export function windAt(times: string[], leg: WindsAloftLeg, at: Date): Wind | null {
  const t = at.getTime();
  const ms = times.map(s => Date.parse(s));
  if (ms.length === 0 || t < ms[0] - 30 * 60_000 || t > ms[ms.length - 1]) return null;
  let i = ms.findIndex(x => x > t);
  if (i === -1) i = ms.length - 1;
  const lo = Math.max(0, i - 1);
  const f = i === lo ? 0 : Math.min(1, Math.max(0, (t - ms[lo]) / (ms[i] - ms[lo])));
  const vec = (k: number) => {
    const d = leg.windDirTrue[k], s = leg.windKt[k];
    return d === null || s === null ? null : { u: -s * Math.sin(rad(d)), v: -s * Math.cos(rad(d)), temp: leg.tempC[k] };
  };
  const a = vec(lo), b = vec(i);
  if (!a || !b) return toWind(a ?? b); // one hour missing: the other one, if any
  const u = a.u + (b.u - a.u) * f, v = a.v + (b.v - a.v) * f;
  const temp = a.temp !== null && b.temp !== null ? a.temp + (b.temp - a.temp) * f : a.temp ?? b.temp;
  return toWind({ u, v, temp });
}

function toWind(x: { u: number; v: number; temp: number | null } | null): Wind | null {
  if (!x) return null;
  return { fromTrue: norm(deg(Math.atan2(-x.u, -x.v))), kt: Math.hypot(x.u, x.v), tempC: x.temp };
}

export interface LegPlan {
  leg: RouteLeg;
  wind: Wind;
  triangle: Triangle;
  /** Unrounded. */
  minutes: number;
  departs: Date;
}

export type RoutePlan =
  | { ok: true; legs: LegPlan[]; minutes: number }
  /** No forecast for some leg at that time, or a wind the aircraft can't fly against. */
  | { ok: false; reason: 'no-forecast' | 'too-windy'; leg: RouteLeg };

/** The route's legs; a route without per-leg data is one leg. */
export function legsOf(route: RouteWeather): RouteLeg[] {
  return route.legs?.length
    ? route.legs
    : [{ from: route.departure.code, to: route.arrival.code, distanceNm: route.distanceNm, trueCourseDeg: route.trueCourseDeg }];
}

/** Each leg in the wind forecast for the middle of the time it's flown. */
export function planRoute(legs: RouteLeg[], winds: WindsAloft, tasKt: number, departure: Date): RoutePlan {
  const out: LegPlan[] = [];
  let at = departure.getTime();
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const forecast = winds.legs[i];
    if (!forecast) return { ok: false, reason: 'no-forecast', leg };
    // Guess the middle of the leg at airspeed, then once more at the groundspeed found.
    let minutes = (leg.distanceNm / tasKt) * 60;
    let found: { wind: Wind; triangle: Triangle } | null = null;
    for (let pass = 0; pass < 2; pass++) {
      const wind = windAt(winds.times, forecast, new Date(at + (minutes / 2) * 60_000));
      if (!wind) return { ok: false, reason: 'no-forecast', leg };
      const triangle = windTriangle(leg.trueCourseDeg, tasKt, wind);
      if (!triangle) return { ok: false, reason: 'too-windy', leg };
      found = { wind, triangle };
      minutes = (leg.distanceNm / triangle.groundSpeedKt) * 60;
    }
    if (!found) return { ok: false, reason: 'no-forecast', leg };
    out.push({ leg, ...found, minutes, departs: new Date(at) });
    at += minutes * 60_000;
  }
  return { ok: true, legs: out, minutes: out.reduce((sum, l) => sum + l.minutes, 0) };
}

/** Minutes rounded up to 5, at least 5 (as the flight time without wind). */
export const roundUpTo5 = (minutes: number) => (minutes > 0 ? Math.max(5, Math.ceil(minutes / 5) * 5) : 0);
