/**
 * Track-up without a map plugin: the map's element becomes a square big enough to cover the view
 * at any angle, centred on the aircraft (placed low, to show more ahead), and turned by the track.
 */

/** Where the aircraft sits in a track-up view, as a share of its height from the top. */
export const TRACK_UP_AT = 0.62;

export interface TrackUpFrame { left: number; top: number; size: number; cx: number; cy: number }

/** The square for a w × h view: its corners never show, whatever the angle. */
export function trackUpFrame(w: number, h: number, at = TRACK_UP_AT): TrackUpFrame {
  const cx = w / 2, cy = h * at;
  const r = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
  const size = Math.ceil(2 * r) + 2;
  return { left: Math.round(cx - size / 2), top: Math.round(cy - size / 2), size, cx, cy };
}

/** The next bearing to turn the map to, the short way round from the last (so 350° → 10° is +20°, not −340°). */
export function nextBearing(prev: number, trackDeg: number | null): number {
  if (trackDeg == null) return prev;
  const delta = ((((trackDeg - prev) % 360) + 540) % 360) - 180;
  return prev + delta;
}
