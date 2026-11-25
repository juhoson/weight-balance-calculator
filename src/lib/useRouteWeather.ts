import React from 'react';
import { fetchAerodrome, fetchRouteWeather } from '../api/backend';
import type { AerodromeInfo, RouteWeather } from '../types/route';
import { namePosition, positionCode, routeLabels } from './routePoint';

/** A visual reporting point of one of the route's airports, with the code that routes through it. */
export interface RouteReportingPoint {
  airport: string;
  name: string;
  lat: number;
  lon: number;
  compulsory: boolean;
  code: string;
}

export interface RouteWeatherState {
  data: RouteWeather | null;
  /** The reporting points of the departure, arrival and airports on the way (none until looked up). */
  reportingPoints: RouteReportingPoint[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Legs between positions are named WP1, WP2, … as everywhere else, not by the position's code. */
function withNames(r: RouteWeather): RouteWeather {
  const labels = routeLabels([r.departure, ...(r.waypoints ?? []), r.arrival].map(a => a.code));
  if (!r.legs || r.legs.length !== labels.length - 1) return r;
  return { ...r, legs: r.legs.map((l, i) => ({ ...l, from: labels[i], to: labels[i + 1] })) };
}

const aerodromes = new Map<string, Promise<AerodromeInfo | null>>();
/** An airport's reporting points, asked once per page load; null when they can't be had. */
function aerodromeOf(code: string): Promise<AerodromeInfo | null> {
  let p = aerodromes.get(code);
  if (!p) {
    p = Promise.resolve().then(() => fetchAerodrome(code)).then(a => a ?? null, () => null);
    aerodromes.set(code, p);
    // A failure is asked again next time.
    p.then(a => { if (!a) aerodromes.delete(code); });
  }
  return p;
}

/** Test hook. */
export function resetAerodromes(): void {
  aerodromes.clear();
}

/** The route's airports' reporting points, each named after itself so the route can go through it. */
async function reportingPointsOf(r: RouteWeather): Promise<RouteReportingPoint[]> {
  const airports = [r.departure, ...(r.waypoints ?? []), r.arrival]
    .filter((a, i, all) => a.type !== 'point' && all.findIndex(b => b.code === a.code) === i);
  const infos = await Promise.all(airports.map(a => aerodromeOf(a.code)));
  return infos.flatMap((info, i) => (info?.reportingPoints ?? []).map(p => {
    const code = positionCode(p.lat, p.lon, true);
    namePosition(code, p.name);
    return { airport: airports[i].code, ...p, code };
  }));
}

/** Route weather for two airport codes; refetched when they change or on refresh(). */
export function useRouteWeather(from: string, to: string, via: string[] = []): RouteWeatherState {
  const viaKey = via.join(',');
  const [data, setData] = React.useState<RouteWeather | null>(null);
  const [reportingPoints, setReportingPoints] = React.useState<RouteReportingPoint[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [generation, setGeneration] = React.useState(0);
  const refresh = React.useCallback(() => setGeneration(g => g + 1), []);

  React.useEffect(() => {
    if (!from || !to) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRouteWeather(from, to, viaKey ? viaKey.split(',') : [])
      .then(r => {
        if (cancelled) return;
        setData(withNames(r));
        // Then the reporting points, which also name the legs that go through them.
        reportingPointsOf(r).then(points => {
          if (cancelled) return;
          setReportingPoints(points);
          if (points.length) setData(withNames(r));
        });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : 'Could not load the route.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, viaKey, generation]);

  return { data, reportingPoints, loading, error, refresh };
}
