import { cruiseTas, levelAt, planRoute, steppedPath, tidyHolds, type VerticalProfile, warningsOf, withStretchAltitude } from './enroute';
import { altitudeAlongPoints } from './airspace';
import type { EnrouteForecast, EnrouteSegment } from '../types/route';

// 600 ft/min at 60 kt: 1,000 ft in 1.67 NM. 500 ft/min at 120 kt: 1,000 ft in 4 NM.
const v: VerticalProfile = { cruiseFt: 4500, departureFt: 0, arrivalFt: 1000, climbTasKt: 60, climbFpm: 600, descentFpm: 500 };
const round = (path: Array<{ nm: number; ft: number }>) => path.map(p => [Math.round(p.nm * 10) / 10, p.ft]);

it('tidies holds: inside the route, sorted, the later one winning where they overlap', () => {
  expect(tidyHolds([{ fromNm: 60, toNm: 120, ft: 2000 }, { fromNm: -5, toNm: 10, ft: 3000 }], 100))
    .toEqual([{ fromNm: 0, toNm: 10, ft: 3000 }, { fromNm: 60, toNm: 100, ft: 2000 }]);
  expect(tidyHolds([{ fromNm: 20, toNm: 50, ft: 2000 }, { fromNm: 40, toNm: 60, ft: 6500 }], 100))
    .toEqual([{ fromNm: 40, toNm: 60, ft: 6500 }]);
  expect(levelAt(45, 4500, [{ fromNm: 40, toNm: 60, ft: 6500 }])).toBe(6500);
  expect(levelAt(65, 4500, [{ fromNm: 40, toNm: 60, ft: 6500 }])).toBe(4500);
});

it('under an airspace: down before it, back up after it', () => {
  const { path, missed, climbs } = steppedPath(100, { ...v, holds: [{ fromNm: 30, toNm: 50, ft: 2000 }] }, 120);
  expect(round(path)).toEqual([[0, 0], [7.5, 4500], [20, 4500], [30, 2000], [50, 2000], [54.2, 4500], [86, 4500], [100, 1000]]);
  expect(missed).toEqual([]);
  expect(climbs.map(([a, b]) => [a, Math.round(b * 10) / 10])).toEqual([[0, 7.5], [50, 54.2]]);
  const at = altitudeAlongPoints(path);
  expect(at(40)).toBe(2000);
  expect(at(25)).toBeCloseTo(3250);
});

it('over an airspace: up before it, down after it', () => {
  const { path } = steppedPath(100, { ...v, holds: [{ fromNm: 40, toNm: 60, ft: 6500 }] }, 120);
  expect(round(path)).toEqual([[0, 0], [7.5, 4500], [36.7, 4500], [40, 6500], [60, 6500], [68, 4500], [86, 4500], [100, 1000]]);
});

it('stays low between holds too close to climb back up in between', () => {
  const { path } = steppedPath(100, { ...v, holds: [{ fromNm: 20, toNm: 40, ft: 2000 }, { fromNm: 45, toNm: 60, ft: 2000 }] }, 120);
  expect(path.filter(p => p.nm > 40 && p.nm < 60).every(p => p.ft === 2000)).toBe(true);
});

it('climbs straight out of the departure into a low hold, and says when one over something comes too soon to reach', () => {
  const low = steppedPath(100, { ...v, holds: [{ fromNm: 0, toNm: 10, ft: 2000 }] }, 120);
  expect(round(low.path).slice(0, 3)).toEqual([[0, 0], [3.3, 2000], [10, 2000]]);
  expect(low.missed).toEqual([]); // below it while climbing to it is still under what it's under

  const high = steppedPath(100, { ...v, holds: [{ fromNm: 5, toNm: 20, ft: 6500 }] }, 120);
  expect(high.missed).toEqual([{ fromNm: 5, toNm: 20, ft: 6500 }]);
  expect(altitudeAlongPoints(high.path)(5)).toBeLessThan(6500); // drawn as flown
});

function segment(startNm: number, windKt: number): EnrouteSegment {
  return {
    leg: 0, startNm, distanceNm: 25, trueCourseDeg: 270, lat: 59.5, lon: 16.5, groundFt: 100,
    windDirTrue: [270, 270], windKt: [windKt, windKt], tempC: [5, 5], cloudBaseFt: [2500, 2500], freezingLevelFt: [null, null], layers: [[], []],
  };
}
const forecast = (windKt: number[]): EnrouteForecast => ({
  available: true, altitudeFt: 4500, times: ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z'], segments: windKt.map((w, i) => segment(i * 25, w)),
});

it('plans each segment at the altitude it is flown, with the extra climb timed at Vy', () => {
  const legs = [{ from: 'A', to: 'B', distanceNm: 100, trueCourseDeg: 270 }];
  const dep = new Date('2026-11-23T10:00:00Z');
  const flat = planRoute(legs, forecast([0, 0, 0, 0]), 120, dep, v);
  const held = planRoute(legs, forecast([0, 0, 0, 0]), 120, dep, { ...v, holds: [{ fromNm: 30, toNm: 50, ft: 2000 }] });
  if (!flat.ok || !held.ok || !held.profile) throw new Error('no plan');
  expect(held.segments.map(s => s.altitudeFt)).toEqual([4500, 2000, 4500, 4500]);
  // The climb back up after the hold is at 60 kt: 4.2 NM that take 2.1 min more than at 120 kt.
  expect(held.minutes - flat.minutes).toBeCloseTo(2.08, 1);
  expect(held.profile.path.length).toBe(8);
  expect(held.profile.tocNm).toBeCloseTo(7.5);
  expect(held.profile.todNm).toBeCloseTo(86);

  // Cloud at 2,500 ft is only too close where the flight is above 2,000 ft.
  expect(warningsOf(held.segments, 4500).nearCloud.map(s => s.altitudeFt)).toEqual([4500, 4500, 4500]);
});

describe('cruise true airspeed by altitude', () => {
  it('is the book speed at 3,000 ft, faster up to full throttle, slower above it', () => {
    expect(cruiseTas(110, 3000, 75)).toBeCloseTo(110);
    expect(cruiseTas(110, 7000, 75)).toBeCloseTo(110 * 1.105 / 1.045);
    expect(cruiseTas(110, 9000, 75)).toBeLessThan(cruiseTas(110, 7000, 75));
    expect(cruiseTas(110, 9000, 65)).toBeGreaterThan(cruiseTas(110, 7000, 65)); // less power: full throttle higher up
    expect(cruiseTas(110, 1000, 75)).toBeLessThan(110);
  });

  it('times each segment at the true airspeed for the altitude it is flown at', () => {
    const legs = [{ from: 'A', to: 'B', distanceNm: 100, trueCourseDeg: 270 }];
    const dep = new Date('2026-11-23T10:00:00Z');
    const byFt = (ft: number) => (ft > 3000 ? 120 : 100);
    const plan = planRoute(legs, forecast([0, 0, 0, 0]), byFt, dep, { ...v, holds: [{ fromNm: 25, toNm: 50, ft: 2000 }] });
    if (!plan.ok) throw new Error('no plan');
    expect(plan.segments.map(s => s.tasKt)).toEqual([120, 100, 120, 120]);
    expect(plan.segments[1].groundSpeedKt).toBeCloseTo(100);
  });
});

describe('altitude per stretch (a leg)', () => {
  const holds = [{ fromNm: 20, toNm: 60, ft: 2000, note: 'Under X' }];
  it('cuts out what was there and puts the new altitude in its place', () => {
    expect(withStretchAltitude(holds, 40, 80, 6500, 4500, 'B → C')).toEqual([
      { fromNm: 20, toNm: 40, ft: 2000, note: 'Under X' }, { fromNm: 40, toNm: 80, ft: 6500, note: 'B → C' }]);
    expect(withStretchAltitude(holds, 30, 50, 4500, 4500)).toEqual([
      { fromNm: 20, toNm: 30, ft: 2000, note: 'Under X' }, { fromNm: 50, toNm: 60, ft: 2000, note: 'Under X' }]);
    expect(withStretchAltitude(holds, 0, 100, 4500, 4500)).toEqual([]);
  });

  it('a first leg above the cruise is the climb out of the departure, not missed; legs join without a step back to cruise', () => {
    const legsAt = withStretchAltitude(withStretchAltitude([], 0, 40, 6500, 4500), 40, 100, 5500, 4500);
    const { path, missed } = steppedPath(100, { ...v, holds: legsAt }, 120);
    expect(missed).toEqual([]);
    expect(path[1].ft).toBe(6500);
    expect(path.some(p => p.ft === 4500)).toBe(false);
    expect(altitudeAlongPoints(path)(40)).toBe(5500); // down to the next leg's altitude by the waypoint
  });
});
