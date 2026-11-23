import React from 'react';
import { fetchEnrouteForecast } from '../api/backend';
import type { EnrouteForecast, RouteWeather } from '../types/route';

export const MIN_ALTITUDE_FT = 500;
export const MAX_ALTITUDE_FT = 18000;
const ALTITUDE_KEY = 'cruiseAltitudeFt';
const DEFAULT_ALTITUDE_FT = 3000;

export const validAltitude = (ft: number) => ft >= MIN_ALTITUDE_FT && ft <= MAX_ALTITUDE_FT;

/** The cruise altitude, remembered in this browser. */
export function useCruiseAltitude(): [number, (ft: number) => void] {
  const [ft, setFt] = React.useState(() => {
    try {
      const saved = Number(localStorage.getItem(ALTITUDE_KEY));
      return validAltitude(saved) ? saved : DEFAULT_ALTITUDE_FT;
    } catch {
      return DEFAULT_ALTITUDE_FT;
    }
  });
  const set = React.useCallback((value: number) => {
    setFt(value);
    if (validAltitude(value)) {
      try { localStorage.setItem(ALTITUDE_KEY, String(value)); } catch { /* not remembered; fine */ }
    }
  }, []);
  return [ft, set];
}

export interface EnrouteForecastState {
  data: EnrouteForecast | null;
  loading: boolean;
  error: string | null;
}

/**
 * The forecast along a trip at an altitude, from a departure (null = now). Asks only while
 * `enabled` (the loading and fuel work out), and waits for typing to settle first.
 */
export function useEnrouteForecast(trip: RouteWeather | null, altitudeFt: number, departure: Date | null,
  enabled: boolean): EnrouteForecastState {
  const from = trip?.departure.code ?? '';
  const to = trip?.arrival.code ?? '';
  const viaKey = (trip?.waypoints ?? []).map(w => w.code).join(',');
  // Whole minutes, so re-renders with an equal time don't ask again.
  const departureMs = departure ? Math.floor(departure.getTime() / 60_000) * 60_000 : 0;
  const [state, setState] = React.useState<EnrouteForecastState>({ data: null, loading: false, error: null });

  React.useEffect(() => {
    if (!enabled || !from || !to || !validAltitude(altitudeFt)) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      fetchEnrouteForecast(from, to, viaKey ? viaKey.split(',') : [], altitudeFt, departureMs ? new Date(departureMs) : null)
        .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
        .catch((e: unknown) => {
          if (!cancelled) setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Could not load the forecast.' });
        });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, from, to, viaKey, altitudeFt, departureMs]);

  return state;
}
