import React from 'react';
import { ApiError, fetchAirspacesAlong } from '../api/backend';
import type { AirspaceView, RouteWeather } from '../types/route';

export interface AirspacesState {
  data: AirspaceView[] | null;
  loading: boolean;
  /** "off" when the server has no openAIP key; "error" when openAIP couldn't be reached. */
  problem: 'off' | 'error' | null;
}

const cache = new Map<string, AirspaceView[]>();

/** Test hook. */
export function clearAirspaceCache(): void {
  cache.clear();
}

/** The airspaces near a route, once per route (the backend caches openAIP for a day). */
export function useAirspaces(trip: RouteWeather | null): AirspacesState {
  const key = trip
    ? [trip.departure, ...(trip.waypoints ?? []), trip.arrival].map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';')
    : '';
  const [state, setState] = React.useState<AirspacesState>({ data: null, loading: false, problem: null });
  React.useEffect(() => {
    if (!key) {
      setState({ data: null, loading: false, problem: null });
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setState({ data: cached, loading: false, problem: null });
      return;
    }
    let live = true;
    setState(s => ({ data: s.data, loading: true, problem: null }));
    const timer = setTimeout(() => {
      const points = key.split(';').map(p => { const [lat, lon] = p.split(',').map(Number); return { lat, lon }; });
      fetchAirspacesAlong(points)
        .then(data => {
          cache.set(key, data);
          if (live) setState({ data, loading: false, problem: null });
        })
        .catch(e => {
          if (live) setState({ data: null, loading: false, problem: e instanceof ApiError && e.status === 503 ? 'off' : 'error' });
        });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
    // The key covers the route's positions.
  }, [key]);
  return state;
}
