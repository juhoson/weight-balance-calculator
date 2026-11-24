import React from 'react';
import { forecastAlongRoute } from './openMeteo';
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
 * The forecast along a trip at an altitude, from a departure (null = now), fetched by the browser
 * from Open-Meteo. Asks only while `enabled` (the loading and fuel work out), and waits for typing
 * to settle first.
 */
export function useEnrouteForecast(trip: RouteWeather | null, altitudeFt: number, departure: Date | null,
  enabled: boolean): EnrouteForecastState {
  // The route's positions, as a stable key so an equal route doesn't ask again.
  const routeKey = trip
    ? [trip.departure, ...(trip.waypoints ?? []), trip.arrival].map(a => `${a.code}:${a.lat}:${a.lon}`).join('|')
    : '';
  // Whole minutes, so re-renders with an equal time don't ask again.
  const departureMs = departure ? Math.floor(departure.getTime() / 60_000) * 60_000 : 0;
  const [state, setState] = React.useState<EnrouteForecastState>({ data: null, loading: false, error: null });

  React.useEffect(() => {
    if (!enabled || !routeKey || !validAltitude(altitudeFt)) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      const route = routeKey.split('|').map(p => { const [code, lat, lon] = p.split(':'); return { code, lat: Number(lat), lon: Number(lon) }; });
      forecastAlongRoute(route, altitudeFt, departureMs ? new Date(departureMs) : null)
        .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
        .catch((e: unknown) => {
          if (!cancelled) setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Could not load the forecast.' });
        });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, routeKey, altitudeFt, departureMs]);

  return state;
}

export const MIN_RATE_FPM = 100;
export const MAX_RATE_FPM = 3000;
const RATES_KEY = 'climbRates.v1';
const DEFAULT_RATES = { climbFpm: 500, descentFpm: 500 };

export interface ClimbRates {
  climbFpm: number;
  descentFpm: number;
}

export const validRate = (fpm: number) => fpm >= MIN_RATE_FPM && fpm <= MAX_RATE_FPM;

function loadRates(): Record<string, ClimbRates> {
  try {
    const saved = JSON.parse(localStorage.getItem(RATES_KEY) ?? '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/** Climb and descent rates from the pilot (from the POH), remembered per aircraft in this browser. */
export function useClimbRates(aircraftKey: string): [ClimbRates, (patch: Partial<ClimbRates>) => void] {
  const [all, setAll] = React.useState(loadRates);
  const saved = all[aircraftKey];
  const rates: ClimbRates = {
    climbFpm: typeof saved?.climbFpm === 'number' ? saved.climbFpm : DEFAULT_RATES.climbFpm,
    descentFpm: typeof saved?.descentFpm === 'number' ? saved.descentFpm : DEFAULT_RATES.descentFpm,
  };
  const set = React.useCallback((patch: Partial<ClimbRates>) => {
    setAll(prev => {
      const current = { ...DEFAULT_RATES, ...prev[aircraftKey] };
      const next = { ...prev, [aircraftKey]: { ...current, ...patch } };
      const valid = validRate(next[aircraftKey].climbFpm) && validRate(next[aircraftKey].descentFpm);
      if (valid) {
        try { localStorage.setItem(RATES_KEY, JSON.stringify(next)); } catch { /* not remembered; fine */ }
      }
      return next;
    });
  }, [aircraftKey]);
  return [rates, set];
}

/** The lowest altitude compared for a suggestion. */
export const SUGGEST_FROM_FT = 1000;
export const DEFAULT_SUGGEST_MAX_FT = 10000;
const SUGGEST_MAX_KEY = 'suggestMaxFt';
export const validSuggestMax = (ft: number) => ft >= SUGGEST_FROM_FT + 500 && ft <= MAX_ALTITUDE_FT;

/** The altitudes compared: every 500 ft from 1,000 ft up to the highest the pilot will go. */
export const altitudesUpTo = (maxFt: number) =>
  Array.from({ length: Math.max(0, Math.floor((maxFt - SUGGEST_FROM_FT) / 500) + 1) }, (_, i) => SUGGEST_FROM_FT + i * 500);

/** The highest altitude to suggest (FL100 unless set), remembered in this browser. */
export function useSuggestMax(): [number, (ft: number) => void] {
  const [ft, setFt] = React.useState(() => {
    try {
      const saved = Number(localStorage.getItem(SUGGEST_MAX_KEY));
      return validSuggestMax(saved) ? saved : DEFAULT_SUGGEST_MAX_FT;
    } catch {
      return DEFAULT_SUGGEST_MAX_FT;
    }
  });
  const set = React.useCallback((value: number) => {
    setFt(value);
    if (validSuggestMax(value)) {
      try { localStorage.setItem(SUGGEST_MAX_KEY, String(value)); } catch { /* not remembered; fine */ }
    }
  }, []);
  return [ft, set];
}

/**
 * The same forecast at each altitude from 1,000 ft to `maxFt`, for comparing them. Asked only once
 * the main forecast has arrived, so they're all built from its cached data.
 */
export function useAltitudeForecasts(trip: RouteWeather | null, departure: Date | null,
  main: EnrouteForecastState, maxFt: number): Map<number, EnrouteForecast> | null {
  const altitudes = React.useMemo(() => (validSuggestMax(maxFt) ? altitudesUpTo(maxFt) : []), [maxFt]);
  return useForecastsAt(trip, departure, main, altitudes);
}

/**
 * The same forecast at other altitudes. Asked only once the main forecast has arrived, and one
 * after the other, so they're all built from its cached data (Open-Meteo is asked for every level at
 * once) rather than asking again. Changing the cruise altitude alone doesn't ask again.
 */
export function useForecastsAt(trip: RouteWeather | null, departure: Date | null,
  main: EnrouteForecastState, altitudes: number[]): Map<number, EnrouteForecast> | null {
  const [byAltitude, setByAltitude] = React.useState<Map<number, EnrouteForecast> | null>(null);
  const routeKey = trip
    ? [trip.departure, ...(trip.waypoints ?? []), trip.arrival].map(a => `${a.code}:${a.lat}:${a.lon}`).join('|')
    : '';
  const departureMs = departure ? Math.floor(departure.getTime() / 60_000) * 60_000 : 0;
  const ready = !!main.data?.available && !main.loading;
  const list = altitudes.join(',');
  const key = routeKey && list ? `${routeKey}#${departureMs}#${list}#${main.data?.times[0] ?? ''}` : '';
  const [doneKey, setDoneKey] = React.useState('');
  React.useEffect(() => {
    if (key !== doneKey) setByAltitude(null);
    if (!key || !ready || key === doneKey) return;
    let cancelled = false;
    const route = routeKey.split('|').map(p => { const [code, lat, lon] = p.split(':'); return { code, lat: Number(lat), lon: Number(lon) }; });
    (async () => {
      const out = new Map<number, EnrouteForecast>();
      for (const ft of list.split(',').map(Number)) {
        if (cancelled) return;
        const f = await forecastAlongRoute(route, ft, departureMs ? new Date(departureMs) : null);
        if (!f.available) return;
        out.set(ft, f);
      }
      if (!cancelled) { setByAltitude(out); setDoneKey(key); }
    })().catch(() => { /* none; the main forecast still shows */ });
    return () => { cancelled = true; };
  }, [key, ready, doneKey, routeKey, departureMs, list]);
  return byAltitude;
}
