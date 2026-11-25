/**
 * Turning points anywhere on the map, written as ICAO flight plan positions (item 15) so they go
 * wherever an airport code goes: the route, saved routes and shared links. The backend reads them.
 */

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/**
 * Degrees and minutes, rounded to the nearest minute (about 1 NM): 5912N01734E; with `seconds`,
 * to the second (a reporting point): 591230N0173415E.
 */
export function positionCode(lat: number, lon: number, seconds = false): string {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  const unit = seconds ? 3600 : 60;
  const part = (deg: number, width: number, pos: string, neg: string) => {
    const max = (width === 2 ? 90 : 180) * unit;
    const n = Math.min(Math.round(Math.abs(deg) * unit), max);
    const d = Math.floor(n / unit);
    const rest = n - d * unit;
    const mmss = seconds ? `${pad(Math.floor(rest / 60), 2)}${pad(rest % 60, 2)}` : pad(rest, 2);
    return `${pad(d, width)}${mmss}${deg < 0 && n > 0 ? neg : pos}`;
  };
  return part(lat, 2, 'N', 'S') + part(wrapped, 3, 'E', 'W');
}

/** Positions known by a name (visual reporting points), by their code. */
const names = new Map<string, string>();

/** Calls the position with this code by a name from now on, e.g. a reporting point's. */
export function namePosition(code: string, name: string): void {
  names.set(code.toUpperCase(), name);
}

/** The name a position is known by, if any. */
export const positionName = (code: string): string | undefined => names.get(code.trim().toUpperCase());

const ICAO = /^(\d{2})(\d{2})?(\d{2})?([NS])(\d{3})(\d{2})?(\d{2})?([EW])$/;

/** The position a code stands for, or null when it isn't one (an airport code). */
export function parsePosition(code: string): { lat: number; lon: number } | null {
  const m = ICAO.exec(code.trim().toUpperCase().replace('/', ''));
  if (!m || (m[2] === undefined) !== (m[6] === undefined) || (m[3] === undefined) !== (m[7] === undefined)) return null;
  const deg = (d: string, mm?: string, ss?: string) => Number(d) + Number(mm ?? 0) / 60 + Number(ss ?? 0) / 3600;
  if ([m[2], m[3], m[6], m[7]].some(x => x !== undefined && Number(x) >= 60)) return null;
  const lat = deg(m[1], m[2], m[3]);
  const lon = deg(m[5], m[6], m[7]);
  if (lat > 90 || lon > 180) return null;
  return { lat: m[4] === 'S' ? -lat : lat, lon: m[8] === 'W' ? -lon : lon };
}

/** 59°12′N 017°34′E (with seconds when the code has them). */
export function positionText(code: string): string | null {
  const m = ICAO.exec(code.trim().toUpperCase().replace('/', ''));
  if (!m || !parsePosition(code)) return null;
  const part = (d: string, mm: string | undefined, ss: string | undefined, h: string) => `${d}°${mm ?? '00'}′${ss ? `${ss}″` : ''}${h}`;
  return `${part(m[1], m[2], m[3], m[4])} ${part(m[5], m[6], m[7], m[8])}`;
}

/** The route as "ESSX → WP1 → ESGG". */
export const routeChain = (codes: string[]) => routeLabels(codes).join(' → ');

/**
 * What each route point is called: an airport its code, a reporting point its name, another
 * position WP1, WP2, … in order.
 */
export function routeLabels(codes: string[]): string[] {
  let n = 0;
  return codes.map(c => (parsePosition(c) ? positionName(c) ?? `WP${++n}` : c));
}
