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
