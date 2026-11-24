import { adviceFor, type AirspaceCheck, MARGIN_FT } from './airspace';
import { type Airspeed, type AltitudeHold, CLOUD_MARGIN_FT, planRoute, type RoutePlan, tasAt, TERRAIN_MARGIN_FT, type VerticalProfile, warningsOf } from './enroute';
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
  /** A few changes of altitude along the way, when that beats every single altitude. */
  stepped: SteppedOption | null;
}

/** Cruise altitude plus stretches at others. */
export interface SteppedOption extends AltitudeOption {
  holds: AltitudeHold[];
}

/** At most this many changes of altitude (two stretches away from the cruise and back). */
export const MAX_CHANGES = 4;
/** What a change of altitude costs on top of its time, minutes: it should be worth the workload. */
const CHANGE_PENALTY_MIN = 3;
/** What a segment inside an airspace to call or ask for costs, minutes: avoided when it can be. */
const AIRSPACE_PENALTY_MIN = 20;
/** Worth suggesting when this much faster than the best single altitude, minutes (or entering less airspace). */
const STEPPED_GAIN_MIN = 2;

export interface SuggestInput {
  legs: RouteLeg[];
  /** The forecast at each altitude to compare. */
  forecasts: Map<number, EnrouteForecast>;
  /** Cruise true airspeed, by altitude when it varies. */
  tasKt: Airspeed;
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
  const plans = new Map<number, OkPlan>();
  for (const [ft, forecast] of Array.from(input.forecasts.entries()).sort((a, b) => a[0] - b[0])) {
    const plan = planRoute(input.legs, forecast, input.tasKt, input.departure, input.verticalFor(ft));
    if (!plan.ok) continue;
    plans.set(ft, plan);
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
    const windKt = plan.segments.reduce((s, x) => s + (x.triangle.groundSpeedKt - x.tasKt) * x.segment.distanceNm, 0) / (total || 1);
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
  const stepped = steppedSuggestion(input, plans, common, suggested[0] ?? null);
  return { options, suggested, bestWinds, common, stepped };
}

/** A VFR cruising level for the course where it must be one (more than 3,000 ft above the ground). */
export const isCruisingLevel = (ft: number, groundFt: number | null, magneticCourse: number) =>
  groundFt === null || ft <= groundFt + SEMICIRCULAR_ABOVE_FT || isLevel(ft, magneticCourse);

/**
 * The best altitude for each segment with at most MAX_CHANGES changes: each segment in its own
 * altitude's wind, clear of cloud, icing and terrain and on a cruising level for its course, keeping
 * out of airspace to call or ask for where it can. Then flown as a cruise altitude with stretches,
 * and suggested only if that beats the best single altitude.
 */
function steppedSuggestion(input: SuggestInput, plans: Map<number, OkPlan>, common: string[], best: AltitudeOption | null): SteppedOption | null {
  const alts = Array.from(plans.keys()).sort((a, b) => a - b);
  const first = plans.get(alts[0]);
  if (!first || alts.length < 2) return null;
  const n = first.segments.length;
  if (alts.some(a => plans.get(a)?.segments.length !== n)) return null;
  const segs = first.segments.map(s => s.segment);

  // Airspace limits don't depend on the altitude flown.
  const areas = input.airspaceFor(first, alts[0]).filter(c => adviceFor(c.airspace).severity !== 'info');
  const inArea = (i: number, ft: number) => {
    const s0 = segs[i].startNm, s1 = s0 + segs[i].distanceNm;
    return areas.filter(c => c.fromNm < s1 && c.toNm > s0 && ft > c.floorFt - MARGIN_FT && ft < c.ceilingFt + MARGIN_FT).length;
  };
  const cost = alts.map(a => {
    const plan = plans.get(a) as OkPlan;
    return plan.segments.map((s, i) => {
      const flyable = (s.cloudBaseFt === null || s.cloudBaseFt >= a + CLOUD_MARGIN_FT)
        && !(s.cloudBaseFt !== null && s.cloudBaseFt <= a && s.freezingLevelFt !== null && s.freezingLevelFt <= a)
        && (s.segment.groundFt === null || a >= s.segment.groundFt + TERRAIN_MARGIN_FT)
        && isCruisingLevel(a, s.segment.groundFt, s.magneticCourse);
      return flyable ? (s.segment.distanceNm / s.triangle.groundSpeedKt) * 60 + inArea(i, a) * AIRSPACE_PENALTY_MIN : Infinity;
    });
  });
  // A climb takes longer than cruising the same distance; a descent at cruise speed doesn't.
  const climbExtra = (from: number, to: number) => {
    const v = input.verticalFor(to);
    if (!v || to <= from) return 0;
    return ((to - from) / v.climbFpm) * (1 - v.climbTasKt / tasAt(input.tasKt, to));
  };
  const departureFt = input.verticalFor(alts[0])?.departureFt ?? 0;

  // dp[k][a]: least cost to the end of segment i at altitude index a with k changes.
  const A = alts.length;
  let dp = Array.from({ length: MAX_CHANGES + 1 }, (_, k) => alts.map((a, j) => (k === 0 ? cost[j][0] + climbExtra(departureFt, a) : Infinity)));
  const back: number[][][] = [];
  for (let i = 1; i < n; i++) {
    const next = Array.from({ length: MAX_CHANGES + 1 }, () => new Array<number>(A).fill(Infinity));
    const from = Array.from({ length: MAX_CHANGES + 1 }, () => new Array<number>(A).fill(-1));
    for (let k = 0; k <= MAX_CHANGES; k++) {
      for (let j = 0; j < A; j++) {
        if (cost[j][i] === Infinity) continue;
        // Stay, or change from another altitude (one more change).
        let bestCost = dp[k][j], bestFrom = j;
        if (k > 0) {
          for (let p = 0; p < A; p++) {
            if (p === j) continue;
            const c = dp[k - 1][p] + climbExtra(alts[p], alts[j]) + CHANGE_PENALTY_MIN;
            if (c < bestCost) { bestCost = c; bestFrom = p; }
          }
        }
        next[k][j] = bestCost + cost[j][i];
        from[k][j] = bestFrom;
      }
    }
    back.push(from);
    dp = next;
  }
  let end = { k: 0, j: -1, c: Infinity };
  dp.forEach((row, k) => row.forEach((c, j) => { if (c < end.c) end = { k, j, c }; }));
  if (end.j < 0 || end.c === Infinity) return null;
  const levels = new Array<number>(n);
  for (let i = n - 1, k = end.k, j = end.j; i >= 0; i--) {
    levels[i] = alts[j];
    if (i === 0) break;
    const p = back[i - 1][k][j];
    if (p !== j) k--;
    j = p;
  }
  if (levels.every(l => l === levels[0])) return null; // no change: the single altitudes cover it

  // The cruise altitude is the one flown furthest; the rest are stretches.
  const byDistance = new Map<number, number>();
  levels.forEach((l, i) => byDistance.set(l, (byDistance.get(l) ?? 0) + segs[i].distanceNm));
  const cruiseFt = Array.from(byDistance.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const holds: AltitudeHold[] = [];
  levels.forEach((l, i) => {
    if (l === cruiseFt) return;
    const last = holds[holds.length - 1];
    const s0 = segs[i].startNm, s1 = s0 + segs[i].distanceNm;
    if (last && last.ft === l && Math.abs(last.toNm - s0) < 0.01) last.toNm = s1;
    else holds.push({ fromNm: Math.round(s0 * 10) / 10, toNm: Math.round(s1 * 10) / 10, ft: l });
  });

  // Fly it for real: each segment in its altitude's forecast, with the climbs and descents.
  const forecast = input.forecasts.get(cruiseFt);
  if (!forecast) return null;
  const flown = { ...forecast, segments: forecast.segments.map((seg, i) => input.forecasts.get(levels[i])?.segments[i] ?? seg) };
  const v = input.verticalFor(cruiseFt);
  const plan = planRoute(input.legs, flown, input.tasKt, input.departure, v && { ...v, holds });
  if (!plan.ok || (plan.profile?.missed.length ?? 0) > 0) return null;
  const w = warningsOf(plan.segments, cruiseFt);
  if (w.nearCloud.length || w.icing.length || w.lowTerrain.length) return null;
  const all = input.airspaceFor(plan, cruiseFt).filter(matters).map(c => c.airspace.name);
  const enters = all.filter((x, i) => all.indexOf(x) === i && !common.includes(x));
  const total = plan.segments.reduce((sum, x) => sum + x.segment.distanceNm, 0);
  const bases = plan.segments.map((x, i) => (x.cloudBaseFt === null ? null : x.cloudBaseFt - levels[i])).filter((b): b is number => b !== null);
  const option: SteppedOption = {
    ft: cruiseFt, holds, minutes: plan.minutes, problems: [], enters, notLevelOn: [],
    windKt: plan.segments.reduce((sum, x) => sum + (x.triangle.groundSpeedKt - x.tasKt) * x.segment.distanceNm, 0) / (total || 1),
    belowCloudFt: bases.length ? Math.min(...bases) : null,
  };
  if (best && !(option.minutes < best.minutes - STEPPED_GAIN_MIN || option.enters.length < best.enters.length)) return null;
  return option;
}
