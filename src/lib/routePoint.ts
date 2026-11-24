/**
 * Turning points anywhere on the map, written as ICAO flight plan positions (item 15) so they go
 * wherever an airport code goes: the route, saved routes and shared links. The backend reads them.
 */

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Degrees and minutes, rounded to the nearest minute (about 1 NM): 5912N01734E. */
export function positionCode(lat: number, lon: number): string {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  const part = (deg: number, width: number, pos: string, neg: string) => {
    let minutes = Math.round(Math.abs(deg) * 60);
    const max = width === 2 ? 90 * 60 : 180 * 60;
    minutes = Math.min(minutes, max);
    return `${pad(Math.floor(minutes / 60), width)}${pad(minutes % 60, 2)}${deg < 0 && minutes > 0 ? neg : pos}`;
  };
  return part(lat, 2, 'N', 'S') + part(wrapped, 3, 'E', 'W');
}

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
