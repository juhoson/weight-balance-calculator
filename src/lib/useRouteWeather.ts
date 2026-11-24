import React from 'react';
import { fetchRouteWeather } from '../api/backend';
import type { RouteWeather } from '../types/route';
import { routeLabels } from './routePoint';

export interface RouteWeatherState {
  data: RouteWeather | null;
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

/** Route weather for two airport codes; refetched when they change or on refresh(). */
export function useRouteWeather(from: string, to: string, via: string[] = []): RouteWeatherState {
  const viaKey = via.join(',');
  const [data, setData] = React.useState<RouteWeather | null>(null);
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
      .then(r => { if (!cancelled) setData(withNames(r)); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : 'Could not load the route.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, viaKey, generation]);

  return { data, loading, error, refresh };
}
