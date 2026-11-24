import { adviceFor, AGL_MARGIN_FT, type AirspaceCheck, type Crossing, MARGIN_FT } from './airspace';
import { type AltitudeHold, TERRAIN_MARGIN_FT, toMagnetic, variationAt } from './enroute';
import { intermediate, type RoutePosition } from './openMeteo';
import { MAX_ALTITUDE_FT, MIN_ALTITUDE_FT } from './useEnrouteForecast';
import type { EnrouteSegment, RouteLeg } from '../types/route';

/**
 * Above this height over the ground, VFR flights in level cruise fly the cruising levels for their
 * magnetic course (SERA.5005(g)): 0–179°, odd thousands + 500 ft; 180–359°, even thousands + 500 ft.
 */
export const SEMICIRCULAR_ABOVE_FT = 3000;

/** A different cruise altitude that keeps the flight under or over one airspace. */
export interface AvoidOption {
  side: 'under' | 'over';
  /** The cruise altitude to use; null when there's no room for it. */
  ft: number | null;
  /** How it was picked, or why there's none. */
  why: string;
}

/** An option with what changing to it would do to the rest of the check. */
export interface AvoidResult extends AvoidOption {
  /** The climb or descent still passes through it (it's near the departure or arrival). */
  stillInside: boolean;
  /** Other airspace (needing a clearance or a call, or restricted) the flight would then enter. */
  alsoEnters: string[];
}

/** What's known about where the route crosses it. */
export interface AvoidContext {
  /** Magnetic course there; null when unknown. */
  magneticCourse: number | null;
  /** Highest ground under the crossing, ft. */
  groundFt: number;
  /** From the terrain model; otherwise just the route's airports. */
  terrainKnown: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en');

/** The nearest VFR cruising level for the course at or below (`down`) or at or above (`up`) an altitude. */
export function vfrLevel(ft: number, magneticCourse: number, dir: 'up' | 'down'): number {
  const parity = ((magneticCourse % 360) + 360) % 360 < 180 ? 1 : 0;
  let k = dir === 'up' ? Math.ceil((ft - 500) / 1000) : Math.floor((ft - 500) / 1000);
  if (((k % 2) + 2) % 2 !== parity) k += dir === 'up' ? 1 : -1;
  return k * 1000 + 500;
}

const course3 = (c: number) => `${String(Math.round(((c % 360) + 360) % 360) % 360).padStart(3, '0')}°`;

/** Going under and over an airspace the route crosses, with the margins the airspace check uses. */
export function avoidOptions(c: AirspaceCheck, ctx: AvoidContext): [AvoidOption, AvoidOption] {
  const { lower, upper } = c.airspace;
  const levelAbove = ctx.groundFt + SEMICIRCULAR_ABOVE_FT;
  const levelNote = ctx.magneticCourse === null ? '' : `, a VFR cruising level for ${course3(ctx.magneticCourse)} magnetic`;

  let under: AvoidOption;
  if (lower.datum === 'GND' && lower.ft === 0) {
    under = { side: 'under', ft: null, why: 'It starts at the ground.' };
  } else if (lower.datum === 'GND') {
    under = { side: 'under', ft: null, why: `Its floor is ${lower.label}, so it follows the terrain: stay below it by height above the ground.` };
  } else {
    let ft = Math.floor((c.floorFt - MARGIN_FT) / 500) * 500;
    let levelled = false;
    if (ft > levelAbove && ctx.magneticCourse !== null) {
      const level = vfrLevel(ft, ctx.magneticCourse, 'down');
      if (level > levelAbove) { ft = level; levelled = true; } else ft = Math.floor(levelAbove / 500) * 500;
    }
    const min = Math.max(MIN_ALTITUDE_FT, ctx.groundFt + TERRAIN_MARGIN_FT);
    under = ft < min
      ? { side: 'under', ft: null, why: `No room: its floor is ${lower.label} and the ground under it is up to ${fmt(ctx.groundFt)} ft`
        + `${ctx.terrainKnown ? '' : ' (from the route\'s airports only)'}; keep ${fmt(TERRAIN_MARGIN_FT)} ft above the ground.` }
      : { side: 'under', ft, why: `At least ${fmt(MARGIN_FT)} ft below its floor (${lower.label})${levelled ? levelNote : ''}.` };
  }

  let over: AvoidOption;
  if (!Number.isFinite(c.ceilingFt)) {
    over = { side: 'over', ft: null, why: 'It has no top to go over.' };
  } else {
    const margin = upper.datum === 'GND' ? AGL_MARGIN_FT : MARGIN_FT;
    let ft = Math.ceil((c.ceilingFt + margin) / 500) * 500;
    let levelled = false;
    if (ft > levelAbove && ctx.magneticCourse !== null) { ft = vfrLevel(ft, ctx.magneticCourse, 'up'); levelled = true; }
    over = ft > MAX_ALTITUDE_FT
      ? { side: 'over', ft: null, why: `Its top (${upper.label}) is too high to go over.` }
      : { side: 'over', ft, why: `At least ${fmt(margin)} ft above its top (${upper.label})${levelled ? levelNote : ''}`
        + `${ft > levelAbove && ctx.magneticCourse === null ? '; check the cruising level for your course' : ''}.` };
  }
  return [under, over];
}

const sameCrossing = (a: Crossing, b: Crossing) => a.airspace.id === b.airspace.id && a.fromNm === b.fromNm;
const matters = (c: AirspaceCheck) => c.status === 'inside' && adviceFor(c.airspace).severity !== 'info';

/**
 * What each option does: whether this airspace is still entered (the climb or descent goes through
 * it) and what else would be entered that isn't now.
 * @param checkAt the airspace check for the route flown at a cruise altitude
 */
export function withEffects(options: AvoidOption[], c: AirspaceCheck, current: AirspaceCheck[],
  checkAt: (cruiseFt: number) => AirspaceCheck[]): AvoidResult[] {
  return options.map(o => {
    if (o.ft === null) return { ...o, stillInside: false, alsoEnters: [] };
    const after = checkAt(o.ft);
    const self = after.find(a => sameCrossing(a, c));
    const alsoEnters = after
      .filter(a => matters(a) && !sameCrossing(a, c) && !current.some(b => sameCrossing(a, b) && matters(b)))
      .map(a => a.airspace.name);
    return { ...o, stillInside: self?.status === 'inside', alsoEnters: alsoEnters.filter((n, i) => alsoEnters.indexOf(n) === i) };
  });
}

/**
 * The magnetic course and the highest ground where the route crosses an airspace.
 * @param segments the forecast segments, for the terrain; null without a forecast
 * @param airportsFt the highest route airport, when there's no terrain
 */
export function crossingContext(c: Crossing, route: RoutePosition[], legs: RouteLeg[], segments: EnrouteSegment[] | null,
  airportsFt: number, at: Date): AvoidContext {
  const mid = (c.fromNm + c.toNm) / 2;
  let magneticCourse: number | null = null;
  let start = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (mid <= start + leg.distanceNm || i === legs.length - 1) {
      const a = route[i], b = route[i + 1];
      if (a && b) {
        const f = leg.distanceNm > 0 ? Math.min(1, Math.max(0, (mid - start) / leg.distanceNm)) : 0;
        const [lat, lon] = intermediate(a.lat, a.lon, b.lat, b.lon, f);
        magneticCourse = toMagnetic(leg.trueCourseDeg, variationAt(lat, lon, at));
      }
      break;
    }
    start += leg.distanceNm;
  }
  const under = (segments ?? [])
    .filter(s => s.groundFt !== null && s.startNm <= c.toNm && s.startNm + s.distanceNm >= c.fromNm)
    .map(s => s.groundFt as number);
  return under.length
    ? { magneticCourse, groundFt: Math.max(...under), terrainKnown: true }
    : { magneticCourse, groundFt: airportsFt, terrainKnown: false };
}

/** What the airspace list and the profile chart need to offer going under or over. */
export interface AvoidHandler {
  optionsFor: (c: AirspaceCheck) => AvoidResult[];
  altitudeFt: number;
  onPick: (ft: number) => void;
  /** Goes under or over just where the route crosses it, keeping the cruise altitude elsewhere. */
  onHold?: (hold: AltitudeHold) => void;
}

/** Held this far either side of where the route is under an airspace's outline. */
export const HOLD_MARGIN_NM = 1;

/** Under or over one airspace, only where the route crosses it. */
export const holdFor = (c: Crossing, side: AvoidOption['side'], ft: number): AltitudeHold => ({
  fromNm: c.fromNm - HOLD_MARGIN_NM, toNm: c.toNm + HOLD_MARGIN_NM, ft,
  note: `${side === 'under' ? 'Under' : 'Over'} ${c.airspace.name}`,
});

/** Only where there's something to avoid: entered or passed close to, and not just for information. */
export const canAvoid = (c: AirspaceCheck) => (c.status === 'inside' || c.status === 'close') && adviceFor(c.airspace).severity !== 'info';
