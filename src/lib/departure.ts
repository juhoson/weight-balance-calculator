/**
 * The climb-out: from the departure, straight ahead on the runway heading until DEPARTURE_TURN_FT
 * above the field, before turning on course. Drawn on the maps and flown in the navigation mode.
 */
import type { AirportInfo, Metar, Runway } from '../types/route';
import { courseDeg } from './openMeteo';
import { runwayWinds, seasonalRunways } from './wind';

type At = { lat: number; lon: number };

/** Height above the field at which to turn on course. */
export const DEPARTURE_TURN_FT = 700;
/** Without the aircraft's figures. */
const DEFAULT_CLIMB = { fpm: 600, kt: 70 };
/** A course this close to the runway's needs no climb-out point: the route already goes that way. */
const ALIGNED_DEG = 15;

export interface DepartureClimb extends At {
  /** The runway end, e.g. "30". */
  runway: string;
  headingDeg: number;
  /** Ahead of the airport's reference point, NM. */
  nm: number;
  /** Why this runway: the wind, or the course (no wind reported). */
  by: 'wind' | 'course';
}

const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Every runway end with a known heading. */
function ends(runways: Runway[]): Array<{ runway: string; headingDeg: number }> {
  return runways.flatMap(r => ([[r.le, r.leHeadingTrue], [r.he, r.heHeadingTrue]] as Array<[string, number | null]>)
    .filter(([name, h]) => !!name && !name.startsWith('H') && h !== null && h !== undefined)
    .map(([runway, headingDeg]) => ({ runway, headingDeg: headingDeg as number })));
}

/** A point `nm` from `from` on a true heading (flat over a few NM). */
function ahead(from: At, headingDeg: number, nm: number): At {
  const r = (headingDeg * Math.PI) / 180;
  return { lat: from.lat + (nm * Math.cos(r)) / 60, lon: from.lon + (nm * Math.sin(r)) / (60 * Math.cos((from.lat * Math.PI) / 180)) };
}

/**
 * Where the climb-out ends: the runway into the wind (the departure's METAR), or without a usable
 * wind the one most along the course to the next point; reached after climbing DEPARTURE_TURN_FT
 * at the aircraft's climb rate and speed. Null when the field's runways have no headings, or the
 * course is within a few degrees of the runway anyway.
 */
export function departureClimb(dep: AirportInfo, metar: Metar | null, next: At, climb?: { fpm: number; kt: number } | null,
  date = new Date()): DepartureClimb | null {
  const usable = seasonalRunways(dep.runways ?? [], date, dep.lat).usable;
  const course = courseDeg(dep.lat, dep.lon, next.lat, next.lon);
  const wind = runwayWinds(metar, usable)[0];
  const pick = wind && wind.headwindKt >= 0 ? { runway: wind.runway, headingDeg: wind.headingTrue, by: 'wind' as const }
    : (() => {
      const best = ends(usable).sort((a, b) => angle(a.headingDeg, course) - angle(b.headingDeg, course))[0];
      return best ? { ...best, by: 'course' as const } : null;
    })();
  if (!pick || angle(pick.headingDeg, course) < ALIGNED_DEG) return null;
  const { fpm, kt } = climb && climb.fpm > 0 && climb.kt > 0 ? climb : DEFAULT_CLIMB;
  const nm = Math.min(3, Math.max(0.7, (DEPARTURE_TURN_FT / fpm) * (kt / 60)));
  return { ...ahead(dep, pick.headingDeg, nm), ...pick, nm };
}

/** "RWY 30 to 700 ft". */
export const departureClimbLabel = (d: DepartureClimb) => `RWY ${d.runway} to ${DEPARTURE_TURN_FT} ft`;
