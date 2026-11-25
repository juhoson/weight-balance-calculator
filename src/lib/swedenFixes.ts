import data from '../data/swedenFixes.json';
import { activeLeg } from './navigation';
import { aipOutOfDate, airacText, type AipDates } from './aipData';

/**
 * Sweden's significant points: the five-letter IFR and GNSS fixes of the airways, SIDs and STARs,
 * from the AIP's ENR 4.4 (see `source`; scripts/update-aip.py keeps the file current).
 */
export interface SignificantPoint {
  name: string;
  lat: number;
  lon: number;
  /** The ATS routes or procedures it's on, as the AIP lists them, e.g. "M851, P607"; empty when none. */
  routes: string;
}

const POINTS = (data as { points: SignificantPoint[] }).points;
export const SWEDEN_FIXES_SOURCE: string = data.source;
export const SWEDEN_FIXES_URL: string = data.sourceUrl;
const DATES: AipDates = data;

/** Past the AIRAC cycle the file was checked against: a newer amendment may move or remove points. */
export const fixesOutOfDate = (now = Date.now()) => aipOutOfDate(DATES, now);

/** "AIRAC 26 Nov 2026". */
export const fixesAiracText = () => airacText(DATES);

/** The points within `nm` either side of the route (or around its one point). */
export function fixesNear(route: Array<{ lat: number; lon: number }>, nm: number): SignificantPoint[] {
  if (!route.length) return [];
  return POINTS.filter(p => (route.length < 2
    ? Math.hypot(p.lat - route[0].lat, (p.lon - route[0].lon) * Math.cos((p.lat * Math.PI) / 180)) * 60 <= nm
    : (activeLeg(route, p)?.offNm ?? Infinity) <= nm));
}

/** The points inside a box, e.g. a map's view. */
export function fixesIn(south: number, west: number, north: number, east: number): SignificantPoint[] {
  return POINTS.filter(p => p.lat >= south && p.lat <= north && p.lon >= west && p.lon <= east);
}
