import React from 'react';
import { fetchRouteWeather } from '../api/backend';
import type { RouteWeather } from '../types/route';

export interface RouteWeatherState {
  data: RouteWeather | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Route weather for two airport codes; refetched when they change or on refresh(). */
export function useRouteWeather(from: string, to: string): RouteWeatherState {
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
    fetchRouteWeather(from, to)
      .then(r => { if (!cancelled) setData(r); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setData(null);
        setError(e instanceof Error ? e.message : 'Could not load the route.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to, generation]);

  return { data, loading, error, refresh };
}
