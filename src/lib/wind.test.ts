import { components, flightMinutes, runwayWinds } from './wind';
import type { Metar, Runway } from '../types/route';

const metar = (dir: number | null, kt: number, gust: number | null = null): Metar => ({
  station: 'ESOW', raw: '', observedAt: null, flightCategory: 'VFR', windDirTrue: dir, windVariable: dir === null,
  windKt: kt, gustKt: gust, visibilityM: 10000, ceilingFt: null, tempC: null, dewpointC: null, qnhHpa: null,
});
const essx: Runway[] = [
  { le: '05', he: '23', lengthFt: 2788, surface: 'ASP', leHeadingTrue: 50, heHeadingTrue: 230, headingEstimated: true },
  { le: '16', he: '34', lengthFt: null, surface: 'GRASS', leHeadingTrue: 160, heHeadingTrue: 340, headingEstimated: true },
];

it('splits wind into head- and crosswind', () => {
  const straight = components(230, 10, 230);
  expect(straight.head).toBeCloseTo(10);
  expect(straight.cross).toBeCloseTo(0);
  const across = components(320, 10, 230); // from the right
  expect(across.head).toBeCloseTo(0);
  expect(across.cross).toBeCloseTo(10);
});

it('ranks runway ends by headwind and reports gust crosswind', () => {
  const winds = runwayWinds(metar(250, 12, 22), essx);
  expect(winds[0]).toMatchObject({ runway: '23', headwindKt: 11, crosswindKt: 4, crossFrom: 'right', gustCrosswindKt: 8 });
  expect(winds[3].runway).toBe('05'); // 16 and 34 are both pure crosswind, in between
  expect(winds.find(w => w.runway === '05')?.headwindKt).toBe(-11); // tailwind
});

it('has nothing to say about variable or calm wind', () => {
  expect(runwayWinds(metar(null, 3), essx)).toEqual([]);
  expect(runwayWinds(null, essx)).toEqual([]);
});

it('estimates flight time, rounded up to 5 minutes', () => {
  expect(flightMinutes(175, 107)).toBe(100); // 98 min -> 1:40
  expect(flightMinutes(0, 107)).toBe(0);
  expect(flightMinutes(3, 107)).toBe(5);
});
