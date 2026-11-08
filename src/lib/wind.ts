import type { Metar, Runway } from '../types/route';

export interface RunwayWind {
  /** Runway end designator, e.g. "23". */
  runway: string;
  headingTrue: number;
  headingEstimated: boolean;
  surface: string;
  lengthFt: number | null;
  /** Positive = headwind, negative = tailwind. */
  headwindKt: number;
  /** Always positive; side in crossFrom. */
  crosswindKt: number;
  crossFrom: 'left' | 'right' | null;
  /** Crosswind in the gusts (equals crosswindKt without gusts). */
  gustCrosswindKt: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Head- and crosswind for one runway end. Wind and heading both true (METAR wind is true). */
export function components(windFromTrue: number, windKt: number, headingTrue: number): { head: number; cross: number } {
  const angle = rad(windFromTrue - headingTrue);
  return { head: windKt * Math.cos(angle), cross: windKt * Math.sin(angle) };
}

/**
 * Wind on every usable runway end, best (most headwind) first. Empty when the wind is variable,
 * calm or unknown, or no runway has a heading.
 */
export function runwayWinds(metar: Metar | null, runways: Runway[]): RunwayWind[] {
  if (!metar || metar.windDirTrue === null || metar.windKt === null) return [];
  const out: RunwayWind[] = [];
  for (const r of runways) {
    const ends: Array<[string, number | null]> = [[r.le, r.leHeadingTrue], [r.he, r.heHeadingTrue]];
    for (const [name, heading] of ends) {
      if (!name || heading === null || heading === undefined || name.startsWith('H')) continue; // helipads
      const { head, cross } = components(metar.windDirTrue, metar.windKt, heading);
      const gust = metar.gustKt ? Math.abs(components(metar.windDirTrue, metar.gustKt, heading).cross) : Math.abs(cross);
      out.push({
        runway: name,
        headingTrue: heading,
        headingEstimated: r.headingEstimated,
        surface: r.surface,
        lengthFt: r.lengthFt,
        headwindKt: Math.round(head),
        crosswindKt: Math.round(Math.abs(cross)),
        crossFrom: Math.round(Math.abs(cross)) === 0 ? null : cross > 0 ? 'right' : 'left',
        gustCrosswindKt: Math.round(gust),
      });
    }
  }
  return out.sort((a, b) => b.headwindKt - a.headwindKt || a.crosswindKt - b.crosswindKt);
}

/** Flight time in minutes for a distance at a true airspeed (no wind), rounded up to 5 minutes. */
export function flightMinutes(distanceNm: number, speedKt: number): number {
  if (!(speedKt > 0) || !(distanceNm > 0)) return 0;
  return Math.max(5, Math.ceil(((distanceNm / speedKt) * 60) / 5) * 5);
}

export const MPH_TO_KT = 0.868976;
