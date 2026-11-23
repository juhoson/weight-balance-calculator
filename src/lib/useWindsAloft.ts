import React from 'react';
import { fetchWindsAloft } from '../api/backend';
import type { RouteWeather, WindsAloft } from '../types/route';

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

export interface WindsAloftState {
  data: WindsAloft | null;
  loading: boolean;
  error: string | null;
}

/** Forecast winds along a trip at an altitude; waits for typing to settle before asking. */
export function useWindsAloft(trip: RouteWeather | null, altitudeFt: number, generation = 0): WindsAloftState {
  const from = trip?.departure.code ?? '';
  const to = trip?.arrival.code ?? '';
  const viaKey = (trip?.waypoints ?? []).map(w => w.code).join(',');
  const [state, setState] = React.useState<WindsAloftState>({ data: null, loading: false, error: null });

  React.useEffect(() => {
    if (!from || !to || !validAltitude(altitudeFt)) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      fetchWindsAloft(from, to, viaKey ? viaKey.split(',') : [], altitudeFt)
        .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
        .catch((e: unknown) => {
          if (!cancelled) setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Could not load the winds.' });
        });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [from, to, viaKey, altitudeFt, generation]);

  return state;
}
