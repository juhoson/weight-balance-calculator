import { planRoute, roundUpTo5, windAt, windTriangle } from './windsAloft';
import type { WindsAloft } from '../types/route';

const hours = ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z', '2026-11-23T12:00:00Z'];

const winds = (dir: Array<number | null>, kt: Array<number | null>): WindsAloft => ({
  available: true, altitudeFt: 3000, times: hours,
  legs: [{ from: 'ESSX', to: 'ESGG', windDirTrue: dir, windKt: kt, tempC: [-2, -4, -6] }],
});

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

  it('wraps the heading around north', () => {
    expect(windTriangle(5, 100, { fromTrue: 270, kt: 30 })!.headingTrue).toBeGreaterThan(340);
  });

  it('is impossible when the wind is as fast as the aircraft', () => {
    expect(windTriangle(360, 50, { fromTrue: 360, kt: 60 })).toBeNull();
    expect(windTriangle(360, 50, { fromTrue: 90, kt: 50 })).toBeNull();
  });
});

describe('windAt', () => {
  const leg = winds([90, 180, 180], [20, 20, 20]).legs[0];

  it('takes the hour itself, and blends the wind vectors between hours', () => {
    expect(windAt(hours, leg, new Date('2026-11-23T10:00:00Z'))!.fromTrue).toBeCloseTo(90);
    const half = windAt(hours, leg, new Date('2026-11-23T10:30:00Z'))!;
    expect(half.fromTrue).toBeCloseTo(135);
    expect(half.kt).toBeCloseTo(14.14, 1); // vectors, not speeds, average
    expect(half.tempC).toBeCloseTo(-3);
  });

  it('has nothing after the forecast ends', () => {
    expect(windAt(hours, leg, new Date('2026-11-23T13:00:00Z'))).toBeNull();
  });

  it('uses the other hour when one has no data', () => {
    const gap = winds([90, null, 180], [20, null, 20]).legs[0];
    expect(windAt(hours, gap, new Date('2026-11-23T10:20:00Z'))!.fromTrue).toBeCloseTo(90);
  });
});

describe('planRoute', () => {
  const legs = [{ from: 'ESSX', to: 'ESGG', distanceNm: 100, trueCourseDeg: 270 }];

  it('flies each leg at its groundspeed', () => {
    const plan = planRoute(legs, winds([270, 270, 270], [20, 20, 20]), 100, new Date('2026-11-23T10:00:00Z'));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.minutes).toBeCloseTo(75); // 100 NM at 80 kt
    expect(plan.legs[0].triangle.groundSpeedKt).toBeCloseTo(80);
  });

  it('says when the departure is beyond the forecast', () => {
    const plan = planRoute(legs, winds([270, 270, 270], [20, 20, 20]), 100, new Date('2026-11-25T10:00:00Z'));
    expect(plan).toMatchObject({ ok: false, reason: 'no-forecast' });
  });

  it('says when the wind is too strong', () => {
    const plan = planRoute(legs, winds([270, 270, 270], [120, 120, 120]), 100, new Date('2026-11-23T10:00:00Z'));
    expect(plan).toMatchObject({ ok: false, reason: 'too-windy' });
  });
});

it('rounds flight time up to 5 minutes', () => {
  expect(roundUpTo5(0)).toBe(0);
  expect(roundUpTo5(1)).toBe(5);
  expect(roundUpTo5(75)).toBe(75);
  expect(roundUpTo5(75.2)).toBe(80);
});
