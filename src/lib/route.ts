// The planned route (departure/arrival), remembered in this browser.

import type { AltitudeChange } from '../types/route';

export interface PlannedRoute {
  from: string;
  to: string;
  /** Waypoints between, in order. */
  via: string[];
  /** Set by a default (club home airfield or location), not typed by the pilot: may be replaced. */
  auto: boolean;
}

const KEY = 'route.v1';

export function loadRoute(): PlannedRoute {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PlannedRoute | null;
    if (r && typeof r.from === 'string' && typeof r.to === 'string') {
      const via = Array.isArray(r.via) ? r.via.filter((c): c is string => typeof c === 'string' && c.length > 0) : [];
      return { from: r.from, to: r.to, via, auto: !!r.auto };
    }
  } catch {
    // ignore
  }
  return { from: '', to: '', via: [], auto: true };
}

export function saveRoute(route: PlannedRoute): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(route));
  } catch {
    // Not remembered; fine.
  }
}

/** Ask the browser for the position (prompts the first time). */
export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot share its location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      e => reject(new Error(e.code === e.PERMISSION_DENIED ? 'Location access was declined.' : 'Could not get your location.')),
      { maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  });
}

/** True when the pilot already allowed location access, so it can be used without asking. */
export async function locationAlreadyAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return status?.state === 'granted';
  } catch {
    return false;
  }
}

/** All airports of a route in order. */
export const routeAirports = (r: PlannedRoute): string[] => [r.from, ...r.via, r.to].filter(Boolean);

/** A route from saved airport codes (departure, waypoints, arrival). */
export function fromAirports(codes: string[]): PlannedRoute {
  return { from: codes[0] ?? '', to: codes[codes.length - 1] ?? '', via: codes.slice(1, -1), auto: false };
}

/** The share link for a token, pointing at this app. */
export function shareUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}?route=${encodeURIComponent(token)}`;
}

/** The cruise altitude and the stretches at another altitude, saved and shared with a route. */
export interface RouteAltitudes {
  cruiseAltitudeFt: number | null;
  altitudeChanges: AltitudeChange[];
}

/** From a saved or shared route; routes saved before altitudes were have none. */
export function altitudesOf(r: { cruiseAltitudeFt?: number | null; altitudeChanges?: AltitudeChange[] | null }): RouteAltitudes {
  return {
    cruiseAltitudeFt: typeof r.cruiseAltitudeFt === 'number' ? r.cruiseAltitudeFt : null,
    altitudeChanges: (r.altitudeChanges ?? []).map(c => ({ fromNm: c.fromNm, toNm: c.toNm, ft: c.ft, ...(c.note ? { note: c.note } : {}) })),
  };
}

/** "4,500 ft, 2 altitude changes"; empty without a cruise altitude. */
export function altitudesText(a: RouteAltitudes): string {
  if (a.cruiseAltitudeFt === null) return '';
  const n = a.altitudeChanges.length;
  return `${a.cruiseAltitudeFt.toLocaleString('en')} ft${n ? `, ${n} altitude change${n === 1 ? '' : 's'}` : ''}`;
}
