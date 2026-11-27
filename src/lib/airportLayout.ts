import { fetchAirportLayout } from '../api/backend';

/** Mirrors weight-balance-backend's AirportLayout: the field from OpenStreetMap. */
export interface LayoutFeature {
  kind: 'runway' | 'taxiway' | 'apron' | 'holding' | string;
  /** The runway's designators (12/30), the taxiway's letter, the holding position's name. */
  ref: string | null;
  widthM: number | null;
  surface: string | null;
  /** [lat, lon] along it; one point for a holding position mapped as a point. */
  points: Array<[number, number]>;
}

export interface AirportLayout {
  code: string;
  features: LayoutFeature[];
  /** false: the map data couldn't be had just now. */
  available: boolean;
}

type LatLon = [number, number];

/** A field seldom changes: a copy on the device is used for a month (and offline, whatever its age). */
const KEEP_MS = 30 * 24 * 3600 * 1000;
const STORE_KEY = (code: string) => `airportLayout.v1.${code}`;
const loaded = new Map<string, Promise<AirportLayout | null>>();

function stored(code: string): { at: number; layout: AirportLayout } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY(code));
    const v = raw ? JSON.parse(raw) : null;
    return v && Array.isArray(v.layout?.features) ? v : null;
  } catch {
    return null;
  }
}

/** The field's layout: from memory, the device, or the server (kept on the device when it has one). */
export function loadAirportLayout(code: string, now = Date.now()): Promise<AirportLayout | null> {
  const key = code.toUpperCase();
  const pending = loaded.get(key);
  if (pending) return pending;
  const kept = stored(key);
  const p: Promise<AirportLayout | null> = kept && now - kept.at < KEEP_MS
    ? Promise.resolve(kept.layout)
    : Promise.resolve().then(() => fetchAirportLayout(key)).then(layout => {
      if (!layout.available) {
        loaded.delete(key); // asked again later
        return kept?.layout ?? null;
      }
      try { localStorage.setItem(STORE_KEY(key), JSON.stringify({ at: now, layout })); } catch { /* full: memory only */ }
      return layout;
    }, () => {
      loaded.delete(key);
      return kept?.layout ?? null;
    });
  loaded.set(key, p);
  return p;
}

/** For tests. */
export function forgetAirportLayouts(): void {
  loaded.clear();
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Metres from a to b, on a plane at a's latitude (fine across an airfield). */
function local(a: LatLon, b: LatLon): [number, number] {
  return [rad(b[1] - a[1]) * R * Math.cos(rad(a[0])), rad(b[0] - a[0]) * R];
}

function offset(a: LatLon, eastM: number, northM: number): LatLon {
  return [a[0] + (northM / R) * (180 / Math.PI), a[1] + (eastM / (R * Math.cos(rad(a[0])))) * (180 / Math.PI)];
}

export const lengthM = (pts: LatLon[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(...local(pts[i], p)), 0);

/** Ground metres per screen pixel at a latitude and Leaflet zoom. */
export const metersPerPixel = (lat: number, zoom: number) => (156543.03 * Math.cos(rad(lat))) / 2 ** zoom;

/** True bearing from a to b, degrees. */
function bearing(a: LatLon, b: LatLon): number {
  const [e, n] = local(a, b);
  return ((Math.atan2(e, n) * 180) / Math.PI + 360) % 360;
}

/**
 * The numbers painted at each end of a runway, placed a little beyond its ends: "12/30" puts 12 at
 * the end a take-off on 12 starts from (the one with the runway running ~120° from it).
 */
export function runwayEnds(f: LayoutFeature, beyondM = 70): Array<{ label: string; at: LatLon }> {
  const pts = f.points;
  if (pts.length < 2 || !f.ref) return [];
  const names = f.ref.split('/').map(s => s.trim()).filter(Boolean);
  const first = pts[0], last = pts[pts.length - 1];
  const along = bearing(first, last);
  const heading = (name: string) => { const n = parseInt(name, 10); return Number.isFinite(n) ? n * 10 : null; };
  const h0 = heading(names[0] ?? '');
  // Does the way run in the direction of the first name? Then the first name belongs at its start.
  const forward = h0 === null || Math.abs((((along - h0) % 360) + 540) % 360 - 180) <= 90;
  const [atStart, atEnd] = forward ? [names[0], names[1]] : [names[1], names[0]];
  const out = (p: LatLon, from: LatLon) => {
    const [e, n] = local(from, p), len = Math.hypot(e, n) || 1;
    return offset(p, (e / len) * beyondM, (n / len) * beyondM);
  };
  const ends: Array<{ label: string; at: LatLon }> = [];
  if (atStart) ends.push({ label: atStart, at: out(first, pts[1]) });
  if (atEnd) ends.push({ label: atEnd, at: out(last, pts[pts.length - 2]) });
  return ends;
}

/** Nearest point on a polyline, and the direction of its segment there (unit east/north). */
function nearestOn(p: LatLon, line: LatLon[]): { distM: number; dir: [number, number] } | null {
  let best: { distM: number; dir: [number, number] } | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const a = local(p, line[i]), b = local(p, line[i + 1]);
    const d: [number, number] = [b[0] - a[0], b[1] - a[1]];
    const len2 = d[0] ** 2 + d[1] ** 2;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, -(a[0] * d[0] + a[1] * d[1]) / len2));
    const distM = Math.hypot(a[0] + t * d[0], a[1] + t * d[1]);
    if (!best || distM < best.distM) { const l = Math.sqrt(len2); best = { distM, dir: [d[0] / l, d[1] / l] }; }
  }
  return best;
}

/**
 * A holding position as a bar across its taxiway (as painted). One mapped as a line is drawn as
 * mapped; one mapped as a point gets a bar across the nearest taxiway, or none when no taxiway is near.
 */
export function holdingBar(f: LayoutFeature, taxiways: LayoutFeature[]): LatLon[] | null {
  if (f.points.length >= 2) return f.points;
  const p = f.points[0];
  if (!p) return null;
  let best: { distM: number; dir: [number, number]; widthM: number } | null = null;
  for (const t of taxiways) {
    const n = nearestOn(p, t.points);
    if (n && n.distM < 25 && (!best || n.distM < best.distM)) best = { ...n, widthM: t.widthM ?? 15 };
  }
  if (!best) return null;
  const half = best.widthM / 2 + 3;
  const [e, n] = [-best.dir[1] * half, best.dir[0] * half]; // across the taxiway
  return [offset(p, e, n), offset(p, -e, -n)];
}

/**
 * Where to write the taxiways' letters: the middle of each way with a letter, but not again within
 * `apartM` of the same letter (a taxiway is often mapped as many short ways). Longest ways first.
 */
export function taxiwayLabels(taxiways: LayoutFeature[], apartM = 300): Array<{ label: string; at: LatLon }> {
  const placed: Array<{ label: string; at: LatLon }> = [];
  [...taxiways]
    .filter(t => t.ref && t.points.length >= 2)
    .map(t => ({ t, len: lengthM(t.points) }))
    .sort((a, b) => b.len - a.len)
    .forEach(({ t, len }) => {
      if (len < 40) return;
      // The point halfway along.
      let left = len / 2, at: LatLon = t.points[0];
      for (let i = 0; i < t.points.length - 1; i++) {
        const seg = Math.hypot(...local(t.points[i], t.points[i + 1]));
        if (left <= seg) {
          const f = seg ? left / seg : 0;
          at = [t.points[i][0] + (t.points[i + 1][0] - t.points[i][0]) * f, t.points[i][1] + (t.points[i + 1][1] - t.points[i][1]) * f];
          break;
        }
        left -= seg;
      }
      // A taxiway named rather than lettered: "Taxiway C" is written as its sign is, C.
      const label = (t.ref as string).replace(/^(taxiway|taxibana|twy)\s+/i, '');
      if (placed.some(p => p.label === label && Math.hypot(...local(p.at, at)) < apartM)) return;
      placed.push({ label, at });
    });
  return placed;
}

const SOFT = /grass|turf|dirt|earth|ground|gravel|sand|unpaved|soil|fine_gravel/i;
/** A grass, gravel or dirt runway (drawn green-brown rather than as asphalt). */
export const isUnpaved = (f: LayoutFeature) => !!f.surface && SOFT.test(f.surface);
