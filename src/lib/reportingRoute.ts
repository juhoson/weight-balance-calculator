import { distanceNm } from './openMeteo';
import type { RouteReportingPoint } from './useRouteWeather';

type Place = { code: string; lat: number; lon: number };

/** A reporting point further than this from its airport isn't one to leave or join the circuit by. */
const MAX_FROM_AIRPORT_NM = 25;
/** Shorter flights than this aren't worth routing through reporting points. */
const MIN_FLIGHT_NM = 5;

const nm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => distanceNm(a.lat, a.lon, b.lat, b.lon);

/**
 * The reporting points to fly a departure-to-arrival route through: the departure's one that is
 * most on the way out, then the arrival's most on the way in. Compulsory points are used where
 * the airport has any. Empty when neither airport has one (or for a local flight).
 */
export function suggestReportingPoints(departure: Place, arrival: Place, points: RouteReportingPoint[]): RouteReportingPoint[] {
  if (departure.code === arrival.code || nm(departure, arrival) < MIN_FLIGHT_NM) return [];
  const best = (airport: Place, from: { lat: number; lon: number }, to: { lat: number; lon: number }) => {
    const own = points.filter(p => p.airport === airport.code && nm(p, airport) <= MAX_FROM_AIRPORT_NM);
    const pool = own.some(p => p.compulsory) ? own.filter(p => p.compulsory) : own;
    return pool
      .map(p => ({ p, d: nm(from, p) + nm(p, to) }))
      .sort((a, b) => a.d - b.d)[0]?.p;
  };
  const out = best(departure, departure, arrival);
  const into = best(arrival, out ?? departure, arrival);
  return [out, into].filter((p, i, all): p is RouteReportingPoint => !!p && all.findIndex(q => q?.code === p.code) === i);
}

/** How much longer the route is through these points than direct, in NM. */
export function extraNm(departure: Place, arrival: Place, via: Array<{ lat: number; lon: number }>): number {
  const route = [departure, ...via, arrival];
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) total += nm(route[i], route[i + 1]);
  return total - nm(departure, arrival);
}
