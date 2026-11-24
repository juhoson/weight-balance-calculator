import { adviceFor, type AirspaceCheck } from './airspace';
import { planRoute, type RoutePlan, type VerticalProfile, warningsOf } from './enroute';
import { SEMICIRCULAR_ABOVE_FT } from './avoidAirspace';
import type { EnrouteForecast, RouteLeg } from '../types/route';

export type OkPlan = Extract<RoutePlan, { ok: true }>;

/** One cruise altitude, flown in its own forecast wind. */
export interface AltitudeOption {
  ft: number;
  minutes: number;
  /** Average wind along the track at cruise: positive is a tailwind, kt. */
  windKt: number;
  /** Cloud base, icing or terrain trouble at this altitude. */
  problems: string[];
  /** Airspace entered that needs a clearance or a call, or is restricted; not counting what every altitude enters. */
  enters: string[];
  /** Legs it isn't a VFR cruising level for (more than 3,000 ft above the ground on the wrong course). */
  notLevelOn: string[];
  /** Lowest forecast cloud base minus the altitude; null without cloud. */
  belowCloudFt: number | null;
}

export interface Suggestions {
  /** Every altitude that can be flown and reached, lowest first. */
  options: AltitudeOption[];
  /** Up to three, best first: clear of cloud, icing and terrain, then the least airspace, then the fastest. */
  suggested: AltitudeOption[];
  /** The fastest clear of cloud, icing and terrain, whatever airspace it enters: the most favourable wind. */
  bestWinds: AltitudeOption | null;
  /** Entered at every altitude (usually zones at the departure or arrival). */
  common: string[];
}

export interface SuggestInput {
  legs: RouteLeg[];
  /** The forecast at each altitude to compare. */
  forecasts: Map<number, EnrouteForecast>;
  tasKt: number;
  departure: Date;
  /** The climb and descent to an altitude; undefined flies it level all the way. */
  verticalFor: (ft: number) => VerticalProfile | undefined;
  /** The airspace check for a plan; empty when airspace isn't known. */
  airspaceFor: (plan: OkPlan, ft: number) => AirspaceCheck[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en');
const isLevel = (ft: number, magneticCourse: number) =>
  (ft - 500) % 1000 === 0 && (((ft - 500) / 1000) % 2 === 1) === (((magneticCourse % 360) + 360) % 360 < 180);
const matters = (c: AirspaceCheck) => c.status === 'inside' && adviceFor(c.airspace).severity !== 'info';

/** The altitudes compared, flown in each one's own wind, and the best of them. */
export function suggestAltitudes(input: SuggestInput): Suggestions {
  const raw: Array<AltitudeOption & { all: string[] }> = [];
  for (const [ft, forecast] of Array.from(input.forecasts.entries()).sort((a, b) => a[0] - b[0])) {
    const plan = planRoute(input.legs, forecast, input.tasKt, input.departure, input.verticalFor(ft));
    if (!plan.ok) continue;
    if (plan.profile && !plan.profile.reachesCruise) continue; // too short a route to get there

    const total = plan.segments.reduce((s, x) => s + x.segment.distanceNm, 0);
    const wrong = plan.segments.filter(s => s.segment.groundFt !== null && ft > s.segment.groundFt + SEMICIRCULAR_ABOVE_FT
      && !isLevel(ft, s.magneticCourse));
    if (wrong.reduce((s, x) => s + x.segment.distanceNm, 0) > total / 2) continue;
    const notLevelOn = input.legs.filter((_, i) => wrong.some(s => s.segment.leg === i)).map(l => `${l.from} → ${l.to}`);

    const w = warningsOf(plan.segments, ft);
    const problems: string[] = [];
    if (w.nearCloud.length) problems.push(`cloud base ${w.lowestBaseFt !== null && w.lowestBaseFt < ft ? 'below' : 'within 500 ft'} (≈ ${fmt(w.lowestBaseFt ?? 0)} ft)`);
    if (w.icing.length) problems.push('icing possible');
    if (w.lowTerrain.length) problems.push('less than 1,000 ft above the terrain');

    const bases = plan.segments.map(s => s.cloudBaseFt).filter((b): b is number => b !== null);
    const windKt = plan.segments.reduce((s, x) => s + (x.triangle.groundSpeedKt - input.tasKt) * x.segment.distanceNm, 0) / (total || 1);
    const all = input.airspaceFor(plan, ft).filter(matters).map(c => c.airspace.name);
    raw.push({
      ft, minutes: plan.minutes, windKt, problems, enters: [], notLevelOn,
      belowCloudFt: bases.length ? Math.min(...bases) - ft : null, all: all.filter((n, i) => all.indexOf(n) === i),
    });
  }

  const common = raw.length ? raw[0].all.filter(n => raw.every(o => o.all.includes(n))) : [];
  const options: AltitudeOption[] = raw.map(({ all, ...o }) => ({ ...o, enters: all.filter(n => !common.includes(n)) }));
  const clear = options.filter(o => o.problems.length === 0);
  // Within a minute counts as as fast; then the lower, which climbs less.
  const faster = (a: AltitudeOption, b: AltitudeOption) => (Math.abs(a.minutes - b.minutes) < 1 ? a.ft - b.ft : a.minutes - b.minutes);
  const suggested = [...clear]
    .sort((a, b) => a.enters.length - b.enters.length || a.notLevelOn.length - b.notLevelOn.length || faster(a, b))
    .slice(0, 3);
  const bestWinds = [...clear].sort(faster)[0] ?? null;
  return { options, suggested, bestWinds, common };
}
