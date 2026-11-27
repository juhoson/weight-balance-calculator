/**
 * What the HUD can work out from the GPS alone: the turn rate from how the track changes, the bank
 * that gives that turn rate at the ground speed (a coordinated turn), and the flight path angle from
 * the climb rate. Not an attitude: there is no gyro. It lags and it's wrong in a slip or a skid.
 */

const KT_TO_MS = 1852 / 3600;
const G = 9.80665;
/** Below this the track (and so the turn) is noise: taxiing, or the GPS settling. */
export const HUD_MIN_KT = 30;
/** Each new turn rate counts this much in the smoothed one. */
const TURN_WEIGHT = 0.4;
const MAX_BANK = 60;

export interface TurnState { trackDeg: number | null; at: number; dps: number }

/** The smoothed turn rate (°/s, right positive) after a new track. */
export function nextTurn(prev: TurnState | null, trackDeg: number | null, at: number, speedKt: number | null): TurnState {
  if (trackDeg == null || (speedKt ?? 0) < HUD_MIN_KT) return { trackDeg, at, dps: 0 };
  if (!prev || prev.trackDeg == null) return { trackDeg, at, dps: 0 };
  const s = (at - prev.at) / 1000;
  if (!(s > 0)) return prev;
  // Over more than ~10 s the change is no longer one turn.
  if (s > 10) return { trackDeg, at, dps: 0 };
  const change = ((((trackDeg - prev.trackDeg) % 360) + 540) % 360) - 180;
  const raw = change / s;
  return { trackDeg, at, dps: prev.dps * (1 - TURN_WEIGHT) + raw * TURN_WEIGHT };
}

/** The bank angle for a coordinated turn at this rate and speed, degrees (right positive), up to 60°. */
export function bankFor(turnDps: number, speedKt: number | null): number {
  if (!speedKt || speedKt < HUD_MIN_KT) return 0;
  const deg = (Math.atan((speedKt * KT_TO_MS * (turnDps * Math.PI) / 180) / G) * 180) / Math.PI;
  return Math.max(-MAX_BANK, Math.min(MAX_BANK, deg));
}

/** The flight path angle from the climb rate and ground speed, degrees (up positive). */
export function pathAngle(vsFpm: number | null | undefined, speedKt: number | null): number {
  if (vsFpm == null || !speedKt || speedKt < HUD_MIN_KT) return 0;
  return (Math.atan((vsFpm / 60) / (speedKt * 6076.12 / 3600)) * 180) / Math.PI;
}
