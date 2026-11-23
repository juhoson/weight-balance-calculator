import { nearestHour, planRoute, roundUpTo5, toMagnetic, variationAt, warningsOf, windAt, windTriangle } from './enroute';
import type { EnrouteForecast, EnrouteSegment } from '../types/route';

const hours = ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z', '2026-11-23T12:00:00Z'];

function segment(over: Partial<EnrouteSegment> = {}): EnrouteSegment {
  return {
    leg: 0, startNm: 0, distanceNm: 50, trueCourseDeg: 270, lat: 59.5, lon: 16.5, groundFt: 100,
    windDirTrue: [270, 270, 270], windKt: [20, 20, 20], tempC: [-2, -4, -6],
    cloudBaseFt: [4000, 2500, null], freezingLevelFt: [1500, 1500, 1500],
    layers: [[{ heightFt: 1000, cloudCover: 20 }], [{ heightFt: 1000, cloudCover: 90 }], []],
    ...over,
  };
}

const forecast = (segments: EnrouteSegment[]): EnrouteForecast => ({ available: true, altitudeFt: 3000, times: hours, segments });
const legs = [{ from: 'ESSX', to: 'ESGG', distanceNm: 100, trueCourseDeg: 270 }];

describe('windTriangle', () => {
  it('a straight headwind slows the aircraft without a correction', () => {
    const t = windTriangle(270, 100, { fromTrue: 270, kt: 20 })!;
    expect(t.groundSpeedKt).toBeCloseTo(80);
    expect(t.wcaDeg).toBeCloseTo(0);
    expect(t.headwindKt).toBeCloseTo(20);
  });

  it('a crosswind from the right turns the heading right', () => {
    const t = windTriangle(360, 100, { fromTrue: 90, kt: 20 })!;
    expect(t.wcaDeg).toBeCloseTo(11.54, 1);
    expect(t.headingTrue).toBeCloseTo(11.54, 1);
    expect(t.groundSpeedKt).toBeCloseTo(98, 0);
  });

  it('is impossible when the wind is as fast as the aircraft', () => {
    expect(windTriangle(360, 50, { fromTrue: 360, kt: 60 })).toBeNull();
    expect(windTriangle(360, 50, { fromTrue: 90, kt: 50 })).toBeNull();
  });
});

describe('windAt', () => {
  const s = segment({ windDirTrue: [90, 180, 180], windKt: [20, 20, 20] });

  it('takes the hour itself, and blends the wind vectors between hours', () => {
    expect(windAt(hours, s, new Date('2026-11-23T10:00:00Z'))?.fromTrue).toBeCloseTo(90);
    const half = windAt(hours, s, new Date('2026-11-23T10:30:00Z'));
    expect(half?.fromTrue).toBeCloseTo(135);
    expect(half?.kt).toBeCloseTo(14.14, 1); // vectors, not speeds, average
    expect(half?.tempC).toBeCloseTo(-3);
  });

  it('has nothing well after the forecast ends', () => {
    expect(windAt(hours, s, new Date('2026-11-23T13:00:00Z'))).toBeNull();
  });
});

it('finds the nearest forecast hour', () => {
  expect(nearestHour(hours, new Date('2026-11-23T10:40:00Z'))).toBe(1);
  expect(nearestHour(hours, new Date('2026-11-23T15:00:00Z'))).toBe(-1);
});

describe('magnetic variation', () => {
  it('is east in Sweden and west in New York (WMM2025)', () => {
    const day = new Date('2026-11-23T00:00:00Z');
    expect(variationAt(59.58, 16.5, day)).toBeGreaterThan(5.5);
    expect(variationAt(59.58, 16.5, day)).toBeLessThan(8.5);
    expect(variationAt(40.64, -73.78, day)).toBeLessThan(-11);
  });

  it('east is least, west is best', () => {
    expect(toMagnetic(100, 7)).toBe(93);
    expect(toMagnetic(5, 7)).toBe(358);
    expect(toMagnetic(100, -12)).toBe(112);
  });
});

describe('planRoute', () => {
  it('times each segment in the forecast for when it is flown', () => {
    // First 50 NM: 20 kt headwind until 11:00; the second segment is flown after that, in a 40 kt headwind.
    const plan = planRoute(legs, forecast([
      segment(),
      segment({ startNm: 50, windKt: [40, 40, 40] }),
    ]), 100, new Date('2026-11-23T10:00:00Z'));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.segments[0].minutes).toBeCloseTo(37.5); // 50 NM at 80 kt
    expect(plan.segments[1].minutes).toBeCloseTo(50); // 50 NM at 60 kt
    expect(plan.segments[1].departs.toISOString()).toBe('2026-11-23T10:37:30.000Z');
    expect(plan.minutes).toBeCloseTo(87.5);
    expect(plan.legs[0].segments).toHaveLength(2);
  });

  it('gives magnetic headings and the cloud for the hour flown', () => {
    const plan = planRoute(legs, forecast([segment()]), 100, new Date('2026-11-23T10:30:00Z'));
    if (!plan.ok) throw new Error('no plan');
    const s = plan.segments[0];
    expect(s.variationDeg).toBeGreaterThan(5);
    expect(s.magneticHeading).toBeCloseTo(270 - s.variationDeg, 5);
    expect(s.hour).toBe(1); // middle of the segment at 10:48
    expect(s.cloudBaseFt).toBe(2500);
    expect(s.layers[0].cloudCover).toBe(90);
  });

  it('says when the departure is beyond the forecast or the wind too strong', () => {
    expect(planRoute(legs, forecast([segment()]), 100, new Date('2026-11-25T10:00:00Z')))
      .toMatchObject({ ok: false, reason: 'no-forecast' });
    expect(planRoute(legs, forecast([segment({ windKt: [120, 120, 120] })]), 100, new Date('2026-11-23T10:00:00Z')))
      .toMatchObject({ ok: false, reason: 'too-windy' });
  });
});

it('warns about cloud near the cruise altitude, icing and low terrain', () => {
  const plan = planRoute(legs, forecast([segment(), segment({ startNm: 50, groundFt: 2500, cloudBaseFt: [null, null, null] })]),
    100, new Date('2026-11-23T10:30:00Z'));
  if (!plan.ok) throw new Error('no plan');
  const w = warningsOf(plan.segments, 3000);
  expect(w.nearCloud).toHaveLength(1);
  expect(w.lowestBaseFt).toBe(2500);
  expect(w.icing).toHaveLength(1); // base 2,500 and 0 °C at 1,500 ft, below 3,000
  expect(w.lowTerrain).toHaveLength(1);
});

it('rounds flight time up to 5 minutes', () => {
  expect(roundUpTo5(0)).toBe(0);
  expect(roundUpTo5(1)).toBe(5);
  expect(roundUpTo5(75)).toBe(75);
  expect(roundUpTo5(75.2)).toBe(80);
});

describe('climb and descent', () => {
  const calm = (k: number) => segment({ startNm: k * 50, windKt: [0, 0, 0] });
  const vertical = { cruiseFt: 3000, departureFt: 0, arrivalFt: 1000, climbTasKt: 80, climbFpm: 500, descentFpm: 500 };

  it('finds the top of climb and descent and times the climb at Vy', () => {
    const plan = planRoute(legs, forecast([calm(0), calm(1)]), 100, new Date('2026-11-23T10:00:00Z'), vertical);
    if (!plan.ok || !plan.profile) throw new Error('no profile');
    const p = plan.profile;
    expect(p.reachesCruise).toBe(true);
    expect(p.climbMinutes).toBeCloseTo(6); // 3,000 ft at 500 ft/min
    expect(p.tocNm).toBeCloseTo(8); // 6 min at 80 kt
    expect(p.descentMinutes).toBeCloseTo(4); // 3,000 -> 1,000 ft at 500 ft/min
    expect(p.todNm).toBeCloseTo(100 - 100 * 4 / 60); // 4 min at 100 kt before the end
    expect(p.tocAt.toISOString()).toBe('2026-11-23T10:06:00.000Z');
    // The first segment: 8 NM at 80 kt (6 min) + 42 NM at 100 kt (25.2 min); the second unchanged.
    expect(plan.segments[0].minutes).toBeCloseTo(31.2);
    expect(plan.segments[0].groundSpeedKt).toBeCloseTo(50 / (31.2 / 60));
    expect(plan.segments[1].minutes).toBeCloseTo(30);
    expect(plan.segments[1].departs.toISOString()).toBe('2026-11-23T10:31:12.000Z');
    expect(plan.minutes).toBeCloseTo(61.2);
  });

  it('lowers the top when the route is too short for the cruise altitude', () => {
    const short = [{ from: 'ESSX', to: 'ESOW', distanceNm: 10, trueCourseDeg: 270 }];
    const plan = planRoute(short, forecast([segment({ distanceNm: 10, windKt: [0, 0, 0] })]), 100,
      new Date('2026-11-23T10:00:00Z'), { ...vertical, cruiseFt: 9500 });
    if (!plan.ok || !plan.profile) throw new Error('no profile');
    const p = plan.profile;
    expect(p.reachesCruise).toBe(false);
    expect(p.topFt).toBeLessThan(9500);
    expect(p.topFt).toBeGreaterThan(1000);
    expect(p.tocNm).toBeCloseTo(p.todNm, 1);
  });
});
