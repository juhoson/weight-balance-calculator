/**
 * The times a flight is logged by, worked out from the GPS as it goes: off block (the aircraft starts
 * moving), takeoff, landing and on block (stopped after landing for 4 minutes: a shorter stop is a
 * hold on a taxiway, waiting for a clearance). Touch-and-goes count as landings; the takeoff is the
 * first, the landing the last.
 */

export interface BlockLog {
  offBlockAt: number | null;
  takeoffAt: number | null;
  landingAt: number | null;
  onBlockAt: number | null;
  landings: number;
  phase: 'parked' | 'taxi-out' | 'airborne' | 'taxi-in' | 'on-block';
  /** Where it stood still last, and since when (for telling a stop from GPS drift). */
  stop: { lat: number; lon: number; since: number } | null;
  /** Since when it has been above the takeoff speed, below the landing speed (airborne), or moving. */
  fastSince: number | null;
  slowSince: number | null;
  movingSince: number | null;
}

export interface LogFix { lat: number; lon: number; speedKt: number | null; at: number }

/** Moving: at least this fast, for at least MOVE_S, and this far from where it stood. */
const MOVE_KT = 3;
const MOVE_S = 5;
const MOVE_M = 20;
/** Taking off: at least this fast (ground speed) for TAKEOFF_S; most light aircraft lift off a little above it. */
export const TAKEOFF_KT = 45;
const TAKEOFF_S = 4;
/** Landed: below this for LANDED_S after being airborne. */
const LANDED_KT = 35;
const LANDED_S = 8;
/** Stopped: slower than this. On block after standing still this long after landing. */
const STOPPED_KT = 2;
export const ON_BLOCK_MS = 4 * 60_000;

export const newBlockLog = (): BlockLog => ({
  offBlockAt: null, takeoffAt: null, landingAt: null, onBlockAt: null, landings: 0, phase: 'parked',
  stop: null, fastSince: null, slowSince: null, movingSince: null,
});

const metres = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((b.lat - a.lat) * 111_320, (b.lon - a.lon) * 111_320 * k);
};

/** The log after one more GPS fix. */
export function nextBlockLog(log: BlockLog, f: LogFix): BlockLog {
  if (f.speedKt == null) return log;
  const kt = f.speedKt;
  const l: BlockLog = { ...log };
  // Standing still: where and since when (a stop drifts a few metres on the GPS, it isn't a move).
  if (kt < STOPPED_KT) {
    if (!l.stop || metres(l.stop, f) > MOVE_M) l.stop = { lat: f.lat, lon: f.lon, since: f.at };
  }
  // Moving: since the first fix at taxi speed, once it has got clear of where it stood (not drift).
  const moved = !l.stop || metres(l.stop, f) > MOVE_M;
  l.movingSince = kt >= MOVE_KT ? (l.movingSince ?? f.at) : null;
  if (kt >= MOVE_KT && moved) l.stop = null;
  l.fastSince = kt >= TAKEOFF_KT ? (l.fastSince ?? f.at) : null;
  l.slowSince = kt < LANDED_KT ? (l.slowSince ?? f.at) : null;
  const held = (since: number | null, s: number) => since != null && f.at - since >= s * 1000;
  const rolling = moved && held(l.movingSince, MOVE_S);

  if (l.phase !== 'airborne') {
    if (held(l.fastSince, TAKEOFF_S)) {
      // Already rolling when the recording began: off block is unknown, the first fix is the best there is.
      if (l.offBlockAt == null) l.offBlockAt = l.movingSince ?? l.fastSince;
      if (l.takeoffAt == null) l.takeoffAt = l.fastSince;
      l.onBlockAt = null; // a touch-and-go, or a new leg after a stop: not on block yet
      l.phase = 'airborne';
      l.stop = null;
      return l;
    }
  }
  switch (l.phase) {
  case 'parked':
    if (rolling) { l.offBlockAt = l.movingSince; l.phase = 'taxi-out'; }
    break;
  case 'airborne':
    if (held(l.slowSince, LANDED_S)) { l.landingAt = l.slowSince; l.landings += 1; l.phase = 'taxi-in'; }
    break;
  case 'taxi-in':
    if (kt < STOPPED_KT && l.stop && f.at - l.stop.since >= ON_BLOCK_MS) { l.onBlockAt = l.stop.since; l.phase = 'on-block'; }
    break;
  case 'on-block':
    // Moved on to another stand: on block again when it stops there.
    if (rolling) l.phase = 'taxi-in';
    break;
  default:
  }
  return l;
}

/**
 * The times when the flight is ended: stopped after landing but not yet for 4 minutes, it's on
 * block since it stopped; still rolling, it's on block now.
 */
export function finishBlockLog(log: BlockLog, now: number): BlockLog {
  if (log.phase !== 'taxi-in') return log;
  return { ...log, onBlockAt: log.stop ? log.stop.since : now, phase: 'on-block' };
}

/** What's sent with the saved flight. */
export interface BlockTimes { offBlock: string | null; takeoff: string | null; landing: string | null; onBlock: string | null; landings: number | null }

export const blockTimesOf = (log: BlockLog): BlockTimes => {
  const iso = (t: number | null) => (t == null ? null : new Date(t).toISOString());
  return { offBlock: iso(log.offBlockAt), takeoff: iso(log.takeoffAt), landing: iso(log.landingAt), onBlock: iso(log.onBlockAt), landings: log.takeoffAt != null ? log.landings : null };
};

/** "1:07": hours and minutes between two times, for a logbook. */
export function hhmm(from: number | string | null, to: number | string | null): string | null {
  if (from == null || to == null) return null;
  const min = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
  if (!(min >= 0)) return null;
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

/** "14:05Z" */
export const utcTime = (t: number | string | null) => {
  if (t == null) return '–';
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
};

/** "16:05" local */
export const localTime = (t: number | string | null) =>
  (t == null ? '' : new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));

const STORE_KEY = 'nav.blockLog.v1';

/** Kept on the device as it goes, so a reload mid-flight keeps the times. */
export function storeBlockLog(log: BlockLog): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(log)); } catch { /* full */ }
}

export function loadBlockLog(): BlockLog | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    return v && typeof v.phase === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function clearBlockLog(): void {
  try { localStorage.removeItem(STORE_KEY); } catch { /* nothing */ }
}
