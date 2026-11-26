/**
 * Other traffic for the navigation mode: where each aircraft is from us (distance, clock position,
 * height difference) and whether it is a conflict: passing within TRAFFIC_ALERT_NM and
 * TRAFFIC_ALERT_FT in the next TRAFFIC_LOOK_S, straight lines and steady climbs assumed.
 * Awareness only: many light aircraft send no ADS-B, and the positions are seconds old.
 */
import type { Traffic } from '../api/backend';
import { bearingDistance } from './navigation';

type At = { lat: number; lon: number };

/** Shown within this, NM. */
export const TRAFFIC_RANGE_NM = 10;
/** Closer than this at the closest point ... */
export const TRAFFIC_ALERT_NM = 1;
/** ... and this much above or below ... */
export const TRAFFIC_ALERT_FT = 1000;
/** ... within this many seconds is a traffic warning. */
export const TRAFFIC_LOOK_S = 120;

export interface TrafficNear extends Traffic {
  nm: number;
  bearingDeg: number;
  /** 1–12, from our track (12 ahead); from north without a track. */
  clock: number;
  /** Theirs minus ours, ft; null without both altitudes. */
  dAltFt: number | null;
  /** The closest it comes in the next TRAFFIC_LOOK_S: in how many seconds, how far, how much above or below. */
  cpa: { s: number; nm: number; dAltFt: number | null } | null;
  conflict: boolean;
}

export interface Own extends At {
  altFt: number | null;
  trackDeg: number | null;
  speedKt: number | null;
  vsFpm?: number | null;
}

/** Velocity east and north, NM per second. */
const velocity = (trackDeg: number | null, kt: number | null) => {
  if (trackDeg == null || kt == null) return { e: 0, n: 0 };
  const r = (trackDeg * Math.PI) / 180;
  return { e: (kt / 3600) * Math.sin(r), n: (kt / 3600) * Math.cos(r) };
};

/** Each aircraft in range, nearest first, with where it is from us and whether it conflicts. */
export function trafficNear(own: Own, list: Traffic[], rangeNm = TRAFFIC_RANGE_NM): TrafficNear[] {
  const k = Math.cos((own.lat * Math.PI) / 180);
  const vo = velocity(own.trackDeg, own.speedKt);
  return list.flatMap(t => {
    if (t.onGround) return [];
    const { nm, deg } = bearingDistance(own, t);
    if (nm > rangeNm) return [];
    const rel = own.trackDeg == null ? deg : deg - own.trackDeg;
    const clock = ((Math.round((((rel % 360) + 360) % 360) / 30) + 11) % 12) + 1;
    const dAltFt = t.altFt != null && own.altFt != null ? t.altFt - own.altFt : null;
    // Relative position and velocity (theirs minus ours), NM and NM/s; the closest approach ahead.
    const px = (t.lon - own.lon) * 60 * k, py = (t.lat - own.lat) * 60;
    const vt = velocity(t.trackDeg, t.gsKt);
    const vx = vt.e - vo.e, vy = vt.n - vo.n;
    const v2 = vx * vx + vy * vy;
    const s = v2 > 1e-12 ? Math.max(0, Math.min(TRAFFIC_LOOK_S, -(px * vx + py * vy) / v2)) : 0;
    const cpaNm = Math.hypot(px + vx * s, py + vy * s);
    const cpaAlt = dAltFt == null ? null : dAltFt + (((t.vsFpm ?? 0) - (own.vsFpm ?? 0)) * s) / 60;
    const vertical = (a: number | null) => a == null || Math.abs(a) <= TRAFFIC_ALERT_FT;
    const conflict = (nm <= TRAFFIC_ALERT_NM && vertical(dAltFt)) || (cpaNm <= TRAFFIC_ALERT_NM && vertical(cpaAlt));
    return [{ ...t, nm, bearingDeg: deg, clock, dAltFt, cpa: { s, nm: cpaNm, dAltFt: cpaAlt }, conflict }];
  }).sort((a, b) => a.nm - b.nm);
}

/** "+04↑": hundreds of feet above (+) or below (-), and climbing or descending, as traffic displays show it. */
export function relativeAltText(t: Pick<TrafficNear, 'dAltFt' | 'vsFpm'>): string {
  if (t.dAltFt == null) return '';
  const h = Math.round(Math.abs(t.dAltFt) / 100);
  const arrow = t.vsFpm == null || Math.abs(t.vsFpm) < 500 ? '' : t.vsFpm > 0 ? '↑' : '↓';
  return `${t.dAltFt >= 0 ? '+' : '-'}${String(h).padStart(2, '0')}${arrow}`;
}

/** "SE-MFY", "SAS488", or the ICAO address. */
export const trafficName = (t: Traffic) => t.registration ?? t.callsign ?? t.hex.toUpperCase();
