/**
 * What the navigation mode was showing, kept on this device when a GPS flight starts: after a
 * reload in the air (iOS drops pages in the background), the flight carries on without a
 * connection, the server, or the planning page's state (the aircraft, the route's answers).
 */
import type { AirportInfo, AirspaceView, RouteWeather } from '../types/route';
import type { RouteReportingPoint } from './useRouteWeather';
import type { SwedenControlLeg } from './swedenControl';
import { loadTrack } from './flightTrack';

export interface NavSession {
  trip: RouteWeather;
  airspaces: AirspaceView[] | null;
  airspacesFetchedAt: number | null;
  reportingPoints: RouteReportingPoint[];
  swedenControl: SwedenControlLeg[];
  bestGlideKt: number | null;
  cruiseKt: number;
  cruiseAltFt: number;
  /** Every airfield along the route, for the emergency page, once loaded. */
  airfields?: AirportInfo[];
  /** The aircraft's climb, for the climb-out on the runway heading. */
  climb?: { fpm: number; kt: number } | null;
  /** The reporting points near the route, once loaded. */
  nearVrps?: Array<{ name: string; lat: number; lon: number; compulsory: boolean }>;
}

const KEY = 'nav.session.v1';

export function saveNavSession(s: NavSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Full: without the airspace (the biggest part), rather than nothing.
    try { localStorage.setItem(KEY, JSON.stringify({ ...s, airspaces: null })); } catch { /* private mode */ }
  }
}

/** Adds what loaded after the start; nothing when no flight was saved. */
export function updateNavSession(part: Partial<NavSession>): void {
  const s = readSession();
  if (s) saveNavSession({ ...s, ...part });
}

function readSession(): NavSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as NavSession | null;
    return s && s.trip && s.trip.departure && s.trip.arrival ? s : null;
  } catch {
    return null;
  }
}

/** The flight to resume: only while its recording is recent (see flightTrack's RESUME_MS). */
export function loadNavSession(now = Date.now()): NavSession | null {
  return loadTrack(now).length ? readSession() : null;
}

export function clearNavSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
