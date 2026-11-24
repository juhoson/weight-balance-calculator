import { avoidOptions, crossingContext, vfrLevel, withEffects } from './avoidAirspace';
import type { AirspaceCheck } from './airspace';
import type { AirspaceView } from '../types/route';

type Limit = AirspaceView['lower'];
const msl = (ft: number): Limit => ({ ft, datum: 'MSL', label: `${ft.toLocaleString('en')} ft MSL` });
const fl = (n: number): Limit => ({ ft: n * 100, datum: 'STD', label: `FL${n}` });
const gnd: Limit = { ft: 0, datum: 'GND', label: 'GND' };

function check(lower: Limit, upper: Limit, over: Partial<AirspaceCheck> = {}): AirspaceCheck {
  const ft = (l: Limit) => (l.datum === 'GND' ? (l.ft === 0 ? -Infinity : l.ft) : l.ft);
  return {
    airspace: { id: 'x', name: 'TEST TMA', type: 'TMA', icaoClass: 'C', activation: null, polygon: [], lower, upper, frequencies: [] },
    fromNm: 20, toNm: 40, status: 'inside', minFt: 3000, maxFt: 3000, floorFt: ft(lower), ceilingFt: ft(upper), ...over,
  };
}
const east = { magneticCourse: 95, groundFt: 300, terrainKnown: true };
const west = { magneticCourse: 275, groundFt: 300, terrainKnown: true };

test('VFR cruising levels: odd thousands + 500 east, even thousands + 500 west', () => {
  expect(vfrLevel(4000, 95, 'up')).toBe(5500);
  expect(vfrLevel(4000, 275, 'up')).toBe(4500);
  expect(vfrLevel(9000, 95, 'down')).toBe(7500);
  expect(vfrLevel(9000, 275, 'down')).toBe(8500);
  expect(vfrLevel(5500, 0, 'up')).toBe(5500);
  expect(vfrLevel(5500, 180, 'down')).toBe(4500);
});

test('under a TMA: 500 ft below its floor, on the 500 ft below it', () => {
  const [under] = avoidOptions(check(msl(2500), fl(95)), east);
  expect(under).toMatchObject({ side: 'under', ft: 2000 });
  expect(under.why).toBe('At least 500 ft below its floor (2,500 ft MSL).');
  expect(avoidOptions(check(msl(1700), fl(95)), { ...east, groundFt: 0 })[0].ft).toBe(1000);
});

test('under a high floor: a cruising level for the course', () => {
  const [under] = avoidOptions(check(fl(95), fl(195)), east);
  expect(under.ft).toBe(7500);
  expect(under.why).toContain('a VFR cruising level for 095° magnetic');
  expect(avoidOptions(check(fl(95), fl(195)), west)[0].ft).toBe(8500);
});

test('no way under one that starts at the ground, follows it, or leaves no room above the terrain', () => {
  expect(avoidOptions(check(gnd, msl(2500)), east)[0]).toMatchObject({ ft: null, why: 'It starts at the ground.' });
  expect(avoidOptions(check({ ft: 1000, datum: 'GND', label: '1,000 ft AGL' }, fl(95)), east)[0].ft).toBeNull();
  const tight = avoidOptions(check(msl(1500), fl(95)), { magneticCourse: 95, groundFt: 600, terrainKnown: false })[0];
  expect(tight.ft).toBeNull();
  expect(tight.why).toContain('the ground under it is up to 600 ft (from the route\'s airports only)');
});

test('over: 500 ft above its top, on a cruising level for the course when high enough', () => {
  const [, over] = avoidOptions(check(gnd, msl(2500)), east);
  expect(over).toMatchObject({ side: 'over', ft: 3000 }); // 2,700 ft above the ground: no level yet
  expect(avoidOptions(check(msl(1500), fl(45)), east)[1].ft).toBe(5500);
  expect(avoidOptions(check(msl(1500), fl(45)), west)[1].ft).toBe(6500);
  expect(avoidOptions(check(msl(1500), fl(45)), { ...east, magneticCourse: null })[1]).toMatchObject({ ft: 5000 });
  expect(avoidOptions(check(msl(1500), fl(45)), { ...east, magneticCourse: null })[1].why).toContain('check the cruising level');
});

test('over an AGL top keeps 1,000 ft, and nothing over one too high', () => {
  const agl = check(gnd, { ft: 2000, datum: 'GND', label: '2,000 ft AGL' }, { ceilingFt: 2300 });
  expect(avoidOptions(agl, east)[1]).toMatchObject({ ft: 3500, why: 'At least 1,000 ft above its top (2,000 ft AGL), a VFR cruising level for 095° magnetic.' });
  expect(avoidOptions(check(msl(1500), fl(195)), east)[1]).toMatchObject({ ft: null, why: 'Its top (FL195) is too high to go over.' });
});

test('effects: still in it on the climb, and what else it enters', () => {
  const tma = check(msl(2500), fl(95));
  const cta = { ...check(fl(95), fl(195)), airspace: { ...tma.airspace, id: 'y', name: 'TEST CTA' } };
  const current = [tma, { ...cta, status: 'below' as const }];
  const results = withEffects([{ side: 'under', ft: 2000, why: '' }, { side: 'over', ft: 11500, why: '' }, { side: 'over', ft: null, why: 'n' }],
    tma, current, ft => (ft === 2000
      ? [{ ...tma, status: 'inside' }, { ...cta, status: 'below' }]
      : [{ ...tma, status: 'above' }, { ...cta, status: 'inside' }]));
  expect(results[0]).toMatchObject({ stillInside: true, alsoEnters: [] });
  expect(results[1]).toMatchObject({ stillInside: false, alsoEnters: ['TEST CTA'] });
  expect(results[2]).toMatchObject({ stillInside: false, alsoEnters: [] });
});

test('context: the magnetic course and the highest ground where the route crosses it', () => {
  const route = [{ code: 'A', lat: 59, lon: 15 }, { code: 'B', lat: 59, lon: 17 }, { code: 'C', lat: 58, lon: 17 }];
  const legs = [{ from: 'A', to: 'B', distanceNm: 62, trueCourseDeg: 89 }, { from: 'B', to: 'C', distanceNm: 60, trueCourseDeg: 180 }];
  const seg = (startNm: number, groundFt: number | null) => ({ startNm, distanceNm: 25, groundFt } as never);
  const ctx = crossingContext({ ...check(msl(2500), fl(95)), fromNm: 20, toNm: 40 }, route, legs,
    [seg(0, 100), seg(25, 900), seg(50, 400), seg(75, 2000)], 150, new Date('2026-11-24'));
  expect(ctx.magneticCourse).toBeGreaterThan(75); // east variation in Sweden: a little less than 089°
  expect(ctx.magneticCourse).toBeLessThan(89);
  expect(ctx).toMatchObject({ groundFt: 900, terrainKnown: true });
  const south = crossingContext({ ...check(msl(2500), fl(95)), fromNm: 90, toNm: 100 }, route, legs, null, 150, new Date('2026-11-24'));
  expect(south.magneticCourse).toBeGreaterThan(165);
  expect(south).toMatchObject({ groundFt: 150, terrainKnown: false });
});
