// The en-route forecast, fetched by the browser straight from Open-Meteo (https://open-meteo.com,
// free for non-commercial use, CC BY 4.0). From the browser each pilot's own address counts
// against Open-Meteo's limits: from the server every request shared one cloud address, which
// Open-Meteo kept blocking.
//
// The route is split into segments of about 25 NM; each gets the forecast at its middle,
// interpolated to the cruise altitude, plus an estimated cloud base, the freezing level and cloud
// by height, hourly from the departure. Forecasts are cached per 0.1° grid point for 30 minutes.
import type { CloudLayer, EnrouteForecast, EnrouteSegment } from '../types/route';

const BASE = 'https://api.open-meteo.com/v1/forecast';
/** DWD ICON: every pressure level (the default model mix lacks 975, 950, 900 and 800 hPa). */
const MODEL = 'icon_seamless';
export const LEVELS_HPA = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500];
export const SEGMENT_NM = 25;
export const MAX_SEGMENTS = 60;
/** Hours returned from the departure hour: enough for a long flight. */
export const HOURS = 12;
/** How far ahead a departure may be planned. */
export const MAX_LEAD_HOURS = 48;
const CACHE_MS = 30 * 60_000;
/** Cloud cover from which a layer counts as a ceiling (broken). */
const CEILING_COVER = 50;
const FT_PER_M = 3.28084;
const EARTH_RADIUS_NM = 3440.065;

export interface RoutePosition {
  code: string;
  lat: number;
  lon: number;
}

/** One height at one hour: above sea level; null where the model has no value. */
export interface Sample {
  heightM: number | null;
  dirTrue: number | null;
  speedKt: number | null;
  tempC: number | null;
  cloudCover: number | null;
}

export interface Forecast {
  elevationM: number;
  /** Epoch seconds, hourly. */
  times: number[];
  surface: Sample[];
  /** Per pressure level (LEVELS_HPA order), per hour. */
  levels: Sample[][];
}

// --- Great-circle helpers (spherical earth, good enough for planning) ---

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = rad(lat1), p2 = rad(lat2), dp = p2 - p1, dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function courseDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function intermediate(lat1: number, lon1: number, lat2: number, lon2: number, f: number): [number, number] {
  const p1 = rad(lat1), l1 = rad(lon1), p2 = rad(lat2), l2 = rad(lon2);
  const d = distanceNm(lat1, lon1, lat2, lon2) / EARTH_RADIUS_NM;
  if (d < 1e-9) return [lat1, lon1];
  const a = Math.sin((1 - f) * d) / Math.sin(d), b = Math.sin(f * d) / Math.sin(d);
  const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
  const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
  const z = a * Math.sin(p1) + b * Math.sin(p2);
  return [deg(Math.atan2(z, Math.sqrt(x * x + y * y))), deg(Math.atan2(y, x))];
}

// --- Segments ---

export interface PlannedSegment {
  leg: number;
  startNm: number;
  distanceNm: number;
  trueCourseDeg: number;
  lat: number;
  lon: number;
  /** 0.1° grid point the forecast comes from. */
  key: string;
}

/** Each leg in equal segments of at most SEGMENT_NM (longer when the route is very long). */
export function segmentsOf(route: RoutePosition[]): PlannedSegment[] {
  const dist = route.slice(1).map((b, i) => distanceNm(route[i].lat, route[i].lon, b.lat, b.lon));
  let spacing = SEGMENT_NM;
  let count: number[] = [];
  for (;;) {
    count = dist.map(d => Math.max(1, Math.ceil(d / spacing - 1e-9)));
    if (count.reduce((s, n) => s + n, 0) <= MAX_SEGMENTS || spacing > 10_000) break;
    spacing *= 1.25;
  }
  const out: PlannedSegment[] = [];
  let along = 0;
  dist.forEach((d, i) => {
    const a = route[i], b = route[i + 1], n = count[i];
    for (let k = 0; k < n; k++) {
      const start = intermediate(a.lat, a.lon, b.lat, b.lon, k / n);
      const end = intermediate(a.lat, a.lon, b.lat, b.lon, (k + 1) / n);
      const mid = intermediate(a.lat, a.lon, b.lat, b.lon, (k + 0.5) / n);
      out.push({
        leg: i, startNm: along + (d * k) / n, distanceNm: d / n,
        trueCourseDeg: d < 0.1 ? 0 : courseDeg(start[0], start[1], end[0], end[1]),
        lat: mid[0], lon: mid[1], key: `${Math.round(mid[0] * 10)},${Math.round(mid[1] * 10)}`,
      });
    }
    along += d;
  });
  return out;
}

// --- Fetching ---

const cache = new Map<string, { at: number; forecast: Forecast }>();

/** For tests. */
export function clearForecastCache(): void {
  cache.clear();
}

export function forecastUrl(points: Array<{ lat: number; lon: number }>, hours: number): string {
  const vars = ['wind_speed_10m', 'wind_direction_10m'];
  for (const level of LEVELS_HPA) {
    for (const v of ['wind_speed', 'wind_direction', 'temperature', 'geopotential_height', 'cloud_cover']) {
      vars.push(`${v}_${level}hPa`);
    }
  }
  const lats = points.map(p => p.lat.toFixed(2)).join(',');
  const lons = points.map(p => p.lon.toFixed(2)).join(',');
  return `${BASE}?latitude=${lats}&longitude=${lons}&hourly=${vars.join(',')}`
    + `&models=${MODEL}&wind_speed_unit=kn&timeformat=unixtime&timezone=GMT&forecast_hours=${hours}`;
}

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseOne(n: Json): Forecast {
  const h = (n.hourly ?? {}) as Record<string, unknown[]>;
  const times = (h.time ?? []).map(t => Number(t));
  const value = (field: string, i: number) => num(h[field]?.[i]);
  const elevationM = num(n.elevation) ?? 0;
  const surface = times.map((_, i) => ({
    heightM: elevationM + 10, dirTrue: value('wind_direction_10m', i), speedKt: value('wind_speed_10m', i),
    tempC: null, cloudCover: null,
  }));
  const levels = LEVELS_HPA.map(level => times.map((_, i) => ({
    heightM: value(`geopotential_height_${level}hPa`, i), dirTrue: value(`wind_direction_${level}hPa`, i),
    speedKt: value(`wind_speed_${level}hPa`, i), tempC: value(`temperature_${level}hPa`, i),
    cloudCover: value(`cloud_cover_${level}hPa`, i),
  })));
  return { elevationM, times, surface, levels };
}

/** One point answers with an object, several with an array in the order asked. */
export function parseForecasts(body: unknown): Forecast[] {
  return Array.isArray(body) ? body.map(n => parseOne(n as Json)) : [parseOne(body as Json)];
}

async function forecastsFor(keys: string[], now: number): Promise<Map<string, Forecast>> {
  const out = new Map<string, Forecast>();
  const missing: string[] = [];
  for (const key of Array.from(new Set(keys))) {
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_MS) out.set(key, hit.forecast);
    else missing.push(key);
  }
  if (missing.length > 0) {
    const points = missing.map(k => { const [a, b] = k.split(',').map(Number); return { lat: a / 10, lon: b / 10 }; });
    const response = await fetch(forecastUrl(points, MAX_LEAD_HOURS + HOURS + 1));
    if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
    const fetched = parseForecasts(await response.json());
    missing.forEach((key, i) => {
      if (!fetched[i]) return;
      cache.set(key, { at: now, forecast: fetched[i] });
      out.set(key, fetched[i]);
    });
  }
  return out;
}

// --- Interpolation ---

/** A wind as the vector the air moves along (u east, v north, knots), so winds interpolate. */
export interface Wind { u: number; v: number; tempC: number | null }

const windOf = (fromDeg: number, kt: number, tempC: number | null): Wind =>
  ({ u: -kt * Math.sin(rad(fromDeg)), v: -kt * Math.cos(rad(fromDeg)), tempC });
export const speedOf = (w: Wind) => Math.hypot(w.u, w.v);
export const fromOf = (w: Wind) => (deg(Math.atan2(-w.u, -w.v)) + 360) % 360;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The pressure levels above the ground with a height, lowest first. */
function aboveGround(f: Forecast, hour: number): Array<Sample & { heightM: number }> {
  const ground = f.elevationM + 10;
  return f.levels.map(level => level[hour])
    .filter((l): l is Sample & { heightM: number } => !!l && l.heightM !== null && l.heightM > ground)
    .sort((a, b) => a.heightM - b.heightM);
}

/**
 * The wind at an altitude, linear between the levels above and below it (the 10 m wind and the
 * pressure levels above ground). Outside them, the nearest. Null when the hour has no data.
 */
export function windAtAltitude(f: Forecast, hour: number, altitudeM: number): Wind | null {
  const points: Array<{ h: number; w: Wind }> = [];
  const s = f.surface[hour];
  if (s && s.dirTrue !== null && s.speedKt !== null) points.push({ h: s.heightM ?? f.elevationM + 10, w: windOf(s.dirTrue, s.speedKt, null) });
  for (const l of aboveGround(f, hour)) {
    if (l.dirTrue !== null && l.speedKt !== null) points.push({ h: l.heightM, w: windOf(l.dirTrue, l.speedKt, l.tempC) });
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.h - b.h);
  let wind: Wind;
  const lowest = points[0], highest = points[points.length - 1];
  if (altitudeM <= lowest.h) wind = lowest.w;
  else if (altitudeM >= highest.h) wind = highest.w;
  else {
    let i = 1;
    while (points[i].h < altitudeM) i++;
    const lo = points[i - 1], hi = points[i], t = (altitudeM - lo.h) / (hi.h - lo.h);
    wind = { u: lerp(lo.w.u, hi.w.u, t), v: lerp(lo.w.v, hi.w.v, t), tempC: null };
  }
  const temps = points.filter(p => p.w.tempC !== null).map(p => [p.h, p.w.tempC as number] as const);
  return { u: wind.u, v: wind.v, tempC: temperatureAt(temps, altitudeM) };
}

function temperatureAt(byHeight: ReadonlyArray<readonly [number, number]>, altitudeM: number): number | null {
  if (byHeight.length === 0) return null;
  if (altitudeM <= byHeight[0][0]) return byHeight[0][1];
  for (let i = 1; i < byHeight.length; i++) {
    const [h0, t0] = byHeight[i - 1], [h1, t1] = byHeight[i];
    if (altitudeM <= h1) return lerp(t0, t1, (altitudeM - h0) / (h1 - h0));
  }
  return byHeight[byHeight.length - 1][1];
}

/**
 * Where the cloud cover first reaches 50% going up, interpolated between levels (the ground counts
 * as clear). Null when no level reaches it. An estimate: the levels are 100-1000 m apart.
 */
export function cloudBaseM(f: Forecast, hour: number): number | null {
  let prevHeight = f.elevationM, prevCover = 0;
  for (const l of aboveGround(f, hour)) {
    if (l.cloudCover === null) continue;
    if (l.cloudCover >= CEILING_COVER) {
      const t = (CEILING_COVER - prevCover) / (l.cloudCover - prevCover);
      return prevHeight + (l.heightM - prevHeight) * Math.max(0, Math.min(1, t));
    }
    prevHeight = l.heightM;
    prevCover = l.cloudCover;
  }
  return null;
}

/** The lowest height where the temperature falls to 0 °C; the ground when the lowest level is already freezing. */
export function freezingLevelM(f: Forecast, hour: number): number | null {
  let prev: { h: number; t: number } | null = null;
  for (const l of aboveGround(f, hour)) {
    if (l.tempC === null) continue;
    if (l.tempC <= 0) {
      if (!prev) return f.elevationM;
      return prev.h + (l.heightM - prev.h) * (prev.t / (prev.t - l.tempC));
    }
    prev = { h: l.heightM, t: l.tempC };
  }
  return null;
}

const feet = (m: number | null) => (m === null ? null : Math.round((m * FT_PER_M) / 100) * 100);
const round1 = (v: number) => Math.round(v * 10) / 10;

// --- The forecast along a route ---

/**
 * The forecast along departure, any waypoints and arrival, at an altitude (ft above sea level),
 * hourly from the departure (null or past = now; at most two days ahead). `available: false` when
 * Open-Meteo could not be reached.
 */
export async function forecastAlongRoute(route: RoutePosition[], altitudeFt: number, departure: Date | null,
  now: Date = new Date()): Promise<EnrouteForecast> {
  if (route.length < 2) throw new Error('A route needs a departure and an arrival');
  const from = !departure || departure < now ? now : departure;
  if (from.getTime() > now.getTime() + MAX_LEAD_HOURS * 3600_000) throw new Error('The forecast reaches two days ahead.');
  const planned = segmentsOf(route);

  let byKey: Map<string, Forecast>;
  try {
    byKey = await forecastsFor(planned.map(p => p.key), now.getTime());
  } catch {
    return { available: false, altitudeFt, times: [], segments: [] };
  }

  const first = Math.floor(from.getTime() / 3600_000) * 3600;
  const times = Array.from({ length: HOURS }, (_, h) => first + h * 3600);
  const altitudeM = altitudeFt / FT_PER_M;
  const segments: EnrouteSegment[] = planned.map(p => {
    const f = byKey.get(p.key);
    const hours = times.map(t => (f ? f.times.indexOf(t) : -1));
    const winds = hours.map(h => (h < 0 || !f ? null : windAtAltitude(f, h, altitudeM)));
    return {
      leg: p.leg, startNm: round1(p.startNm), distanceNm: round1(p.distanceNm), trueCourseDeg: Math.round(p.trueCourseDeg),
      lat: Math.round(p.lat * 1000) / 1000, lon: Math.round(p.lon * 1000) / 1000,
      groundFt: f ? Math.round(f.elevationM * FT_PER_M) : null,
      windDirTrue: winds.map(w => (w === null ? null : speedOf(w) < 0.5 ? 0 : Math.round(fromOf(w)) % 360)),
      windKt: winds.map(w => (w === null ? null : Math.round(speedOf(w)))),
      tempC: winds.map(w => (w === null || w.tempC === null ? null : Math.round(w.tempC))),
      cloudBaseFt: hours.map(h => (h < 0 || !f ? null : feet(cloudBaseM(f, h)))),
      freezingLevelFt: hours.map(h => (h < 0 || !f ? null : feet(freezingLevelM(f, h)))),
      layers: hours.map(h => (h < 0 || !f ? [] : aboveGround(f, h)
        .filter(l => l.cloudCover !== null)
        .map((l): CloudLayer => ({ heightFt: Math.round(l.heightM * FT_PER_M), cloudCover: Math.round(l.cloudCover as number) })))),
    };
  });
  return { available: true, altitudeFt, times: times.map(t => new Date(t * 1000).toISOString()), segments };
}
