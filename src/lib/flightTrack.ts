/**
 * The flight the navigation mode is recording, kept on this device as it goes, so a reload (or the
 * browser closing the page) mid-flight doesn't lose it. Saved to the account when the flight ends.
 */
import type { TrackPoint } from '../api/backend';
import { distanceNm } from './openMeteo';

const KEY = 'nav.track.v1';
/** A recording this recent is carried on when navigation mode starts again; an older one is dropped. */
export const RESUME_MS = 30 * 60_000;
/** The server's limit; past it, every other point is dropped. */
export const MAX_POINTS = 20_000;

export function loadTrack(now = Date.now()): TrackPoint[] {
  try {
    const points = JSON.parse(localStorage.getItem(KEY) ?? '[]') as TrackPoint[];
    if (!Array.isArray(points) || points.length === 0) return [];
    return now - points[points.length - 1].at <= RESUME_MS ? points : [];
  } catch {
    return [];
  }
}

export function storeTrack(points: TrackPoint[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(points));
  } catch {
    // Full or private: the track is still in memory.
  }
}

export function clearTrack(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

/** Under the limit: every other point dropped (the first and last kept). */
export function thinned(points: TrackPoint[]): TrackPoint[] {
  if (points.length <= MAX_POINTS) return points;
  return points.filter((_, i) => i % 2 === 0 || i === points.length - 1);
}

export function trackStats(points: TrackPoint[]): { nm: number; minutes: number } {
  let nm = 0;
  for (let i = 1; i < points.length; i++) nm += distanceNm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  const minutes = points.length > 1 ? Math.round((points[points.length - 1].at - points[0].at) / 60_000) : 0;
  return { nm, minutes };
}

/** "ESOW → ESSB, 25 Nov 2026". */
export const trackName = (from: string, to: string, at: number) =>
  `${from} → ${to}, ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
