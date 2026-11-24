import { altitudeAlong, checkCrossings, crossingsAlong, stillAirProfile, adviceFor } from './airspace';
import type { AirspaceView } from '../types/route';

const box = (lon0: number, lat0: number, lon1: number, lat1: number): Array<[number, number]> =>
  [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]];
const space = (patch: Partial<AirspaceView>): AirspaceView => ({
  id: 'x', name: 'X', type: 'CTR', icaoClass: 'D', activation: null, polygon: box(0.4, -0.1, 0.6, 0.1),
  lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 2500, datum: 'MSL', label: '2,500 ft MSL' }, frequencies: [], ...patch,
});
// Along the equator: 1° of longitude is 60 NM.
const route = [{ code: 'A', lat: 0, lon: 0 }, { code: 'B', lat: 0, lon: 1 }];

test('finds where the route is under each outline, in route order', () => {
  const c = crossingsAlong(route, [space({ id: 'late', polygon: box(0.8, -0.1, 0.9, 0.1) }), space({ id: 'early' })]);
  expect(c.map(x => x.airspace.id)).toEqual(['early', 'late']);
  expect(c[0].fromNm).toBeCloseTo(24, 0);
  expect(c[0].toNm).toBeCloseTo(36, 0);
  expect(crossingsAlong(route, [space({ polygon: box(0.4, 0.2, 0.6, 0.4) })])).toEqual([]);
});

test('an outline entered twice is two crossings', () => {
  // A U shape open to the south... approximated by two boxes in one ring is not valid; use a route that bends.
  const zigzag = [{ code: 'A', lat: 0, lon: 0 }, { code: 'B', lat: 0, lon: 1 }, { code: 'C', lat: 0.5, lon: 1 }, { code: 'D', lat: 0.5, lon: 0 }];
  const c = crossingsAlong(zigzag, [space({ polygon: box(0.4, -0.1, 0.6, 0.6) })]);
  expect(c).toHaveLength(2);
});

test('still air: climbs, cruises and descends, topping out lower on a short hop', () => {
  const v = { cruiseFt: 4500, departureFt: 0, arrivalFt: 1000, climbTasKt: 80, climbFpm: 500, cruiseTasKt: 120, descentFpm: 500 };
  const long = stillAirProfile(100, v);
  expect(long.topFt).toBe(4500);
  expect(long.tocNm).toBeCloseTo(12, 5); // 9 min at 80 kt
  expect(long.todNm).toBeCloseTo(100 - 14, 5); // 7 min at 120 kt
  const at = altitudeAlong(long);
  expect(at(6)).toBeCloseTo(2250, 0);
  expect(at(50)).toBe(4500);
  expect(at(100)).toBeCloseTo(1000, 5);
  const short = stillAirProfile(10, v);
  expect(short.topFt).toBeLessThan(4500);
  expect(short.tocNm).toBeLessThanOrEqual(short.todNm);
});

test('inside, close, over and under', () => {
  const crossing = (lower: AirspaceView['lower'], upper: AirspaceView['upper']) =>
    crossingsAlong(route, [space({ lower, upper })]);
  const flat = (ft: number) => () => ft;
  const msl = (ft: number) => ({ ft, datum: 'MSL' as const, label: `${ft}` });
  const check = (lower: AirspaceView['lower'], upper: AirspaceView['upper'], ft: number, ground = 0) =>
    checkCrossings(crossing(lower, upper), flat(ft), [], ground)[0].status;
  expect(check(msl(1500), msl(9500), 3000)).toBe('inside');
  expect(check(msl(1500), msl(9500), 1200)).toBe('close');
  expect(check(msl(1500), msl(9500), 900)).toBe('below');
  expect(check(msl(0), msl(2500), 2800)).toBe('close');
  expect(check(msl(0), msl(2500), 3100)).toBe('above');
  // AGL ceiling over 800 ft ground: 2,800 ft; 3,500 ft is within the 1,000 ft AGL margin.
  const agl = { ft: 2000, datum: 'GND' as const, label: '2,000 ft AGL' };
  expect(check({ ft: 0, datum: 'GND', label: 'GND' }, agl, 3500, 800)).toBe('close');
  expect(check({ ft: 0, datum: 'GND', label: 'GND' }, agl, 4000, 800)).toBe('above');
  // An AGL floor is taken over sea-level ground: 1,500 ft AGL counts from 1,500 ft.
  expect(check({ ft: 1500, datum: 'GND', label: '1,500 ft AGL' }, msl(9500), 1600, 800)).toBe('inside');
});

test('the lowest point over a crossing counts, also at a bend in the path', () => {
  const c = crossingsAlong(route, [space({ lower: { ft: 2000, datum: 'MSL', label: '' }, upper: { ft: 9500, datum: 'STD', label: '' } })]);
  // Climbing through the box: 1,000 ft at 24 NM, 3,000 ft at 36 NM.
  const climb = (nm: number) => 1000 + ((nm - 24) / 12) * 2000;
  const [r] = checkCrossings(c, climb, [], 0);
  expect(r.status).toBe('inside');
  expect(r.minFt).toBeLessThan(r.maxFt);
});

test('advice by type', () => {
  expect(adviceFor(space({ type: 'TMA', icaoClass: 'C' })).hint).toBe('Clearance needed.');
  expect(adviceFor(space({ type: 'TMA', icaoClass: 'E' })).severity).toBe('info');
  expect(adviceFor(space({ type: 'R', icaoClass: null })).severity).toBe('restricted');
  expect(adviceFor(space({ type: 'P', icaoClass: null })).severity).toBe('prohibited');
  expect(adviceFor(space({ type: 'RMZ', icaoClass: 'G' })).hint).toBe('Radio contact required.');
});

test('airspace over the arrival counts down to the runway, below the circuit height the path ends at', () => {
  const c = crossingsAlong(route, [space({ polygon: box(0.9, -0.1, 1.1, 0.1), upper: { ft: 1500, datum: 'MSL', label: '' } })]);
  const descent = (nm: number) => (nm < 54 ? 3500 : Math.max(1500, 3500 - ((nm - 54) / 6) * 2000)); // to 1,500 ft at 60 NM
  expect(checkCrossings(c, nm => descent(nm) + 6, [], 0)[0].status).toBe('close');
  expect(checkCrossings(c, nm => descent(nm) + 6, [], 0, { totalNm: 60, fieldFt: 500 })[0].status).toBe('inside');
});
