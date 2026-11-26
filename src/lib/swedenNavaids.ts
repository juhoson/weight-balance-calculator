import data from '../data/swedenNavaids.json';
import { aipOutOfDate, airacText, type AipDates } from './aipData';

/** An en-route radio navaid from the AIP's ENR 4.1 (scripts/update-aip.py keeps the file current). */
export interface Navaid {
  name: string;
  type: 'DVOR/DME' | 'VOR/DME' | 'DVORTAC' | 'VORTAC' | 'DVOR' | 'VOR' | 'DME' | 'TACAN' | 'NDB';
  ident: string;
  /** MHz, e.g. "112.80"; null for a TACAN. */
  frequency: string | null;
  /** The DME channel, e.g. "CH75X". */
  channel: string | null;
  lat: number;
  lon: number;
}

export const NAVAIDS = (data as unknown as { navaids: Navaid[] }).navaids;
export const SWEDEN_NAVAIDS_SOURCE: string = data.source;
const DATES: AipDates = data;

export const navaidsOutOfDate = (now = Date.now()) => aipOutOfDate(DATES, now);
export const navaidsAiracText = () => airacText(DATES);

/** "AROS DVOR/DME ARS 112.80": what to tune and identify. */
export const navaidText = (n: Navaid) => `${n.name} ${n.type} ${n.ident} ${n.frequency ?? n.channel ?? ''}`.trim();

/** The navaids within `nm` of any point of the route (a VOR is used from well off the route). */
export function navaidsNear(route: Array<{ lat: number; lon: number }>, nm: number): Navaid[] {
  return NAVAIDS.filter(n => route.some(p =>
    Math.hypot(n.lat - p.lat, (n.lon - p.lon) * Math.cos((p.lat * Math.PI) / 180)) * 60 <= nm));
}

/** The navaids inside a box, e.g. a map's view. */
export const navaidsIn = (south: number, west: number, north: number, east: number) =>
  NAVAIDS.filter(n => n.lat >= south && n.lat <= north && n.lon >= west && n.lon <= east);

/** The map symbol: a hexagon for a VOR, a square for a DME, both for a VOR/DME. */
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] as string));

/** A tapped navaid's popup (HTML): its name and type, what to tune, and how current the AIP data is. */
export function navaidPopup(n: Navaid): string {
  return `<strong>${escape(n.name)} ${escape(n.type)}</strong><br>${escape(n.ident)}`
    + `${n.frequency ? ` · <strong>${escape(n.frequency)} MHz</strong>` : ''}${n.channel ? ` · DME ${escape(n.channel)}` : ''}`
    + `<br>AIP ENR 4.1, ${navaidsOutOfDate() ? `<strong>${navaidsAiracText()}, out of date: check the AIP.</strong>` : navaidsAiracText()}`;
}

export function navaidSvg(n: Navaid): string {
  const vor = /VOR/.test(n.type), dme = /DME|TAC/.test(n.type);
  const hex = '<polygon points="7,2.5 11,4.8 11,9.2 7,11.5 3,9.2 3,4.8" fill="none" stroke="#0f766e" stroke-width="1.6"/>';
  const box = '<rect x="1" y="1" width="12" height="12" fill="none" stroke="#0f766e" stroke-width="1.4"/>';
  return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${dme ? box : ''}${vor ? hex : ''}`
    + '<circle cx="7" cy="7" r="1.3" fill="#0f766e"/></svg>';
}
