/**
 * The end of the route: not the airfield's reference point but the threshold of the runway to land
 * on, reached the way a field is flown into. At a field without a control zone that is the
 * standard circuit join (45° onto the middle of the downwind, on the circuit's side, then base and
 * final); in a control zone ATC says how to join, so the plan is a straight final of 3 NM, flown as
 * cleared. The runway is the one into the wind (the arrival's METAR), else the one most in line
 * with the way the route comes in; the pilot can choose another.
 */
import type { AirportInfo, AirspaceView, Metar } from '../types/route';
import { type AirportLayout, runwayEnds as layoutRunwayEnds } from './airportLayout';
import { airspacesHere } from './navigation';
import { courseDeg } from './openMeteo';
import { runwayWinds, seasonalRunways } from './wind';

type At = { lat: number; lon: number };

export interface RunwayEnd {
  runway: string;
  /** True heading of the landing direction. */
  headingDeg: number;
  lengthFt: number | null;
}

export interface LandingRunway extends RunwayEnd {
  /** Why this one: into the wind, in line with the way in (no wind reported), or the pilot's. */
  by: 'wind' | 'course' | 'chosen';
}

export type CircuitSide = 'LEFT' | 'RIGHT';

export interface ArrivalPoint extends At {
  /** Short, for the map: "Downwind 19". */
  label: string;
}

export interface ArrivalPlan {
  landing: LandingRunway;
  side: CircuitSide;
  /** circuit: the standard join (no control zone); final: as cleared, planned as a straight final. */
  kind: 'circuit' | 'final';
  /** From the join to the threshold, which is the last. */
  points: ArrivalPoint[];
}

/** The circuit's width (downwind abeam the runway) and its final, NM: a light aircraft's. */
const CIRCUIT_WIDTH_NM = 0.8;
const FINAL_NM = 1;
/** In a control zone: planned as a final this long. */
const CONTROLLED_FINAL_NM = 3;
const FT_PER_NM = 6076.12;

const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** A point `nm` from `from` on a true heading (flat over a few NM). */
export function ahead(from: At, headingDeg: number, nm: number): At {
  const r = (headingDeg * Math.PI) / 180;
  return { lat: from.lat + (nm * Math.cos(r)) / 60, lon: from.lon + (nm * Math.sin(r)) / (60 * Math.cos((from.lat * Math.PI) / 180)) };
}

/** The runway ends that can be landed on (headings known, not helipads, not closed for the season). */
export function landingOptions(arr: AirportInfo, date = new Date()): RunwayEnd[] {
  return seasonalRunways(arr.runways ?? [], date, arr.lat).usable.flatMap(r =>
    ([[r.le, r.leHeadingTrue], [r.he, r.heHeadingTrue]] as Array<[string, number | null]>)
      .filter(([name, h]) => !!name && !name.startsWith('H') && h != null)
      .map(([runway, h]) => ({ runway, headingDeg: h as number, lengthFt: r.lengthFt })));
}

/**
 * The runway to land on: into the wind when the METAR gives one with a headwind, else the one
 * most in line with the way in (from `inbound`, the last point before the field). `chosen`, when
 * one of the options, wins.
 */
export function landingRunway(arr: AirportInfo, metar: Metar | null, inbound: At, chosen?: string | null, date = new Date()): LandingRunway | null {
  const options = landingOptions(arr, date);
  if (options.length === 0) return null;
  const pick = options.find(o => o.runway === chosen);
  if (pick) return { ...pick, by: 'chosen' };
  const wind = runwayWinds(metar, seasonalRunways(arr.runways ?? [], date, arr.lat).usable)[0];
  const into = wind && wind.headwindKt >= 0 ? options.find(o => o.runway === wind.runway) : null;
  if (into) return { ...into, by: 'wind' };
  const course = courseDeg(inbound.lat, inbound.lon, arr.lat, arr.lon);
  const best = [...options].sort((a, b) => angle(a.headingDeg, course) - angle(b.headingDeg, course))[0];
  return { ...best, by: 'course' };
}

/**
 * Where the runway starts: from the field's layout (OpenStreetMap) when it has the runway, else
 * half the runway's length back from the reference point (most small fields have it mid-runway).
 */
export function thresholdOf(arr: AirportInfo, end: RunwayEnd, layout?: AirportLayout | null): At {
  const way = layout?.features.find(f => f.kind === 'runway' && f.ref?.split('/').map(s => s.trim()).includes(end.runway));
  const mapped = way ? layoutRunwayEnds(way, 0).find(e => e.label === end.runway) : null;
  if (mapped) return { lat: mapped.at[0], lon: mapped.at[1] };
  const halfNm = (end.lengthFt ?? 2600) / 2 / FT_PER_NM;
  return ahead(arr, end.headingDeg + 180, halfNm);
}

/** The circuit's side for a runway end, as openAIP gives it; left (the standard) when it doesn't say. */
export function circuitSide(circuits: Array<{ runway: string; direction: CircuitSide | null }> | null | undefined, runway: string): CircuitSide {
  return circuits?.find(c => c.runway === runway)?.direction ?? 'LEFT';
}

/** In a control zone (CTR) at the field: ATC gives the way in. */
export function isControlledField(arr: AirportInfo, airspaces: AirspaceView[] | null | undefined): boolean {
  if (!airspaces?.length) return false;
  return airspacesHere(airspaces, arr, (arr.elevationFt ?? 0) + 500).inside.some(a => a.type === 'CTR');
}

/** The way in to the threshold of `landing`. */
export function arrivalPlan(arr: AirportInfo, landing: LandingRunway, opts: {
  side?: CircuitSide; controlled?: boolean; layout?: AirportLayout | null;
} = {}): ArrivalPlan {
  const side = opts.side ?? 'LEFT';
  const thr = thresholdOf(arr, landing, opts.layout);
  const h = landing.headingDeg, back = h + 180, out = h + (side === 'LEFT' ? -90 : 90);
  const rwy = landing.runway;
  if (opts.controlled) {
    return {
      landing, side, kind: 'final',
      points: [{ ...ahead(thr, back, CONTROLLED_FINAL_NM), label: `Final ${rwy} (as cleared)` }, { ...thr, label: `RWY ${rwy}` }],
    };
  }
  const lengthNm = (landing.lengthFt ?? 2600) / FT_PER_NM;
  const midDownwind = ahead(ahead(thr, h, lengthNm / 2), out, CIRCUIT_WIDTH_NM);
  // 45° onto the downwind from outside the circuit, a mile before its middle.
  const join = ahead(ahead(midDownwind, h, 1), out, 1);
  const finalStart = ahead(thr, back, FINAL_NM);
  const base = ahead(finalStart, out, CIRCUIT_WIDTH_NM);
  return {
    landing, side, kind: 'circuit',
    points: [
      { ...join, label: `Join ${side === 'LEFT' ? 'left' : 'right'} downwind ${rwy}` },
      { ...midDownwind, label: `Downwind ${rwy}` },
      { ...base, label: `Base ${rwy}` },
      { ...finalStart, label: `Final ${rwy}` },
      { ...thr, label: `RWY ${rwy}` },
    ],
  };
}

/** "RWY 19 (into the wind)" */
export const landingText = (l: LandingRunway) =>
  `RWY ${l.runway} (${l.by === 'wind' ? 'into the wind' : l.by === 'course' ? 'in line with the way in; no wind reported' : 'your choice'})`;
