import {
  activeLeg, airspacesHere, areaAround, demoStart, demoStep, roundedRoute, turnRadiusNm, eteText, fixFrom, glideRangeNm, insidePolygon, nearestAirfields, nextAirspace, pad3, positionAlong,
} from './navigation';
import type { AirportInfo, AirspaceView } from '../types/route';

const esow = { lat: 59.5894, lon: 16.6336 };
const essb = { lat: 59.3544, lon: 17.9417 };

const square: Array<[number, number]> = [[16, 59], [17, 59], [17, 60], [16, 60], [16, 59]];
const airspace = (name: string, lowerFt: number, upperFt: number): AirspaceView => ({
  id: name, name, type: 'CTR', icaoClass: 'D', activation: null, polygon: square, frequencies: [],
  lower: { ft: lowerFt, datum: lowerFt === 0 ? 'GND' : 'MSL', label: String(lowerFt) },
  upper: { ft: upperFt, datum: 'MSL', label: String(upperFt) },
});
const airport = (code: string, lat: number, lon: number, elevationFt = 0, lengthFt = 2000): AirportInfo => ({
  code, name: code, type: 'small', lat, lon, elevationFt, country: 'SE', municipality: '',
  runways: [{ le: '01', he: '19', lengthFt, surface: 'ASP', leHeadingTrue: 10, heHeadingTrue: 190, headingEstimated: false }],
});

const coords = (lat: number, lon: number, extra: Partial<GeolocationCoordinates> = {}) => ({
  latitude: lat, longitude: lon, speed: null, heading: null, altitude: null, accuracy: 10, ...extra,
});

test('a fix takes the GPS speed, track and altitude in knots, degrees and feet', () => {
  const f = fixFrom(coords(59.5, 16.5, { speed: 50, heading: 90, altitude: 1000 }), 0, null);
  expect(f.speedKt).toBeCloseTo(97.2, 1);
  expect(f.trackDeg).toBe(90);
  expect(f.altFt).toBeCloseTo(3281, 0);
});

test('without them from the GPS, speed and track come from the last fix; standing still has no track', () => {
  const first = fixFrom(coords(59.5, 16.5), 0, null);
  expect(first.trackDeg).toBeNull();
  const second = fixFrom(coords(59.5 + 1 / 60, 16.5), 36_000, first); // 1 NM north in 36 s
  expect(second.speedKt).toBeCloseTo(100, 0);
  expect(second.trackDeg).toBeCloseTo(0, 0);
  expect(fixFrom(coords(59.5, 16.5, { speed: 0, heading: 270 }), 0, null).trackDeg).toBeNull();
});

test('point in polygon', () => {
  expect(insidePolygon(59.5, 16.5, square)).toBe(true);
  expect(insidePolygon(58.5, 16.5, square)).toBe(false);
});

test('the airspace the aircraft is in, and what is above it', () => {
  const ctr = airspace('CTR', 0, 1500), tma = airspace('TMA', 1500, 9500);
  const here = airspacesHere([tma, ctr], { lat: 59.5, lon: 16.5 }, 1000);
  expect(here.inside.map(a => a.name)).toEqual(['CTR']);
  expect(here.above.map(a => a.name)).toEqual(['TMA']);
  expect(airspacesHere([tma, ctr], { lat: 59.5, lon: 16.5 }, null).inside.map(a => a.name)).toEqual(['CTR', 'TMA']);
  expect(airspacesHere([tma, ctr], { lat: 58, lon: 16.5 }, 1000).inside).toEqual([]);
});

test('the active leg is the one closest, the next one at a turning point', () => {
  const mid = { lat: 59.7, lon: 17.3 };
  const route = [esow, mid, essb];
  expect(activeLeg(route, { lat: 59.65, lon: 16.9 })?.index).toBe(0);
  expect(activeLeg(route, { lat: 59.5, lon: 17.6 })?.index).toBe(1);
  expect(activeLeg(route, mid)?.index).toBe(1);
  expect(activeLeg([esow], esow)).toBeNull();
  // Halfway along the first leg.
  const half = positionAlong(route, 10);
  expect(activeLeg(route, half)?.alongNm).toBeCloseTo(10, 0);
});

test('glide range and the airfields within it', () => {
  expect(glideRangeNm(6076.12, 8)).toBeCloseTo(8);
  const near = airport('NEAR', 59.6, 16.7), far = airport('FAR', 59.6, 18.5), high = airport('HIGH', 59.62, 16.7, 2500);
  const list = nearestAirfields([far, near, high], esow, 3000, 8, 2);
  expect(list.map(a => a.airport.code)).toEqual(['NEAR', 'HIGH']);
  expect(list[0].reachable).toBe(true);
  expect(list[1].reachable).toBe(false); // 3,000 ft over an airfield at 2,500 ft is too low
  expect(list[0].runway).toEqual({ lengthFt: 2000, surface: 'ASP' });
  expect(nearestAirfields([near], esow, null, 8)[0].reachable).toBeNull();
});

test('a demo flight moves along the route', () => {
  const start = positionAlong([esow, essb], 0);
  expect(start.lat).toBeCloseTo(esow.lat);
  expect(positionAlong([esow, essb], 1000)).toMatchObject({ done: true });
  expect(positionAlong([esow, essb], 20).trackDeg).toBeGreaterThan(100);
});

test('texts', () => {
  expect(eteText(10, 120)).toBe('5 min');
  expect(eteText(150, 100)).toBe('1 h 30 min');
  expect(eteText(10, 0)).toBe('-');
  expect(pad3(5)).toBe('005');
  expect(pad3(359.7)).toBe('000');
});

describe('the next controlled airspace', () => {
  const tma: AirspaceView = { ...airspace('TMA', 1500, 9500), type: 'TMA', icaoClass: 'C',
    frequencies: [{ value: '123.750', name: 'STOCKHOLM CONTROL', kind: 'APP', primary: true, source: null }] };
  const at = (fromNm: number, a: AirspaceView = tma) => [{ airspace: a, fromNm, toNm: fromNm + 20 }];

  test('shows from 10 NM out, at an altitude inside its limits', () => {
    expect(nextAirspace(at(30), 19, 3000, new Set())).toBeNull(); // 11 NM out
    expect(nextAirspace(at(30), 21, 3000, new Set())).toEqual({ airspace: tma, inNm: 9 });
    expect(nextAirspace(at(30), 21, 1000, new Set())).toBeNull(); // under its floor
    expect(nextAirspace(at(30), 21, null, new Set())?.airspace).toBe(tma);
  });

  test('not one already inside, uncontrolled, or without a frequency', () => {
    expect(nextAirspace(at(30), 21, 3000, new Set(['TMA']))).toBeNull();
    expect(nextAirspace(at(30, { ...tma, icaoClass: 'G' }), 21, 3000, new Set())).toBeNull();
    expect(nextAirspace(at(30, { ...tma, frequencies: [] }), 21, 3000, new Set())).toBeNull();
    expect(nextAirspace(at(20), 21, 3000, new Set())).toBeNull(); // behind
  });
});

it('the demo starts at a standstill, climbs at Vy, and comes down a 3.5° approach at the approach speed to a stop', () => {
  const plan = { totalNm: 30, depFt: 50, arrFt: 100, cruiseFt: 3000, cruiseKt: 110, climbKt: 79, climbFpm: 700, approachKt: 65 };
  let st = demoStart(plan);
  expect(st).toMatchObject({ kt: 0, phase: 'roll', altFt: 50 });
  const seen: Array<typeof st> = [st];
  for (let i = 0; i < 4000 && !(st.phase === 'landed' && st.kt === 0); i++) { st = demoStep(st, 1, plan); seen.push(st); }
  const at = (phase: string) => seen.filter(x => x.phase === phase);
  // Rolling: on the ground, speeding up from 0 to rotation.
  expect(at('roll').every(x => x.altFt === 50)).toBe(true);
  expect(at('roll')[1].kt).toBe(3);
  // Climbing at Vy and the climb rate; cruising at the cruise speed.
  expect(at('climb').slice(-1)[0].kt).toBe(79);
  expect(at('climb')[5].vsFpm).toBe(700);
  expect(Math.max(...seen.map(x => x.altFt))).toBe(3000);
  expect(at('cruise').slice(-1)[0].kt).toBe(110);
  // Descending at 500 ft/min, then the approach: slower, about 400 ft/min down a 3.5° path from circuit height.
  expect(at('descent')[3].vsFpm).toBe(-500);
  const approach = at('approach');
  expect(approach[0].altFt).toBeCloseTo(1100, -2);
  const final = approach.slice(-10);
  expect(final[0].kt).toBe(65);
  expect(final[5].vsFpm).toBeGreaterThan(-500);
  expect(final[5].vsFpm).toBeLessThan(-300);
  // Then on the ground at the arrival, braking to a stop.
  expect(st).toMatchObject({ phase: 'landed', kt: 0, altFt: 100, nm: 30 });
  // Altitude never jumps: at most a few hundred feet a step.
  for (let i = 1; i < seen.length; i++) expect(Math.abs(seen[i].altFt - seen[i - 1].altFt)).toBeLessThan(50);
});

it('rounds a corner into a standard-rate turn: no heading change bigger than 10° between points', () => {
  expect(turnRadiusNm(110)).toBeCloseTo(0.58, 2);
  // North 5 NM, then east 5 NM.
  const corner = [{ lat: 60, lon: 15 }, { lat: 60 + 5 / 60, lon: 15 }, { lat: 60 + 5 / 60, lon: 15 + 5 / 30 }];
  const path = roundedRoute(corner, turnRadiusNm(110));
  expect(path.length).toBeGreaterThan(8);
  const tracks = path.slice(1).map((p, i) => positionAlong([path[i], p], 0).trackDeg);
  for (let i = 1; i < tracks.length; i++) expect(Math.abs(((tracks[i] - tracks[i - 1] + 540) % 360) - 180)).toBeLessThanOrEqual(10.5);
  expect(path[0]).toEqual(corner[0]);
  expect(path[path.length - 1]).toEqual(corner[2]);
  // A straight route stays as it is.
  expect(roundedRoute([corner[0], corner[1], { lat: 60 + 10 / 60, lon: 15 }], 0.6)).toHaveLength(3);
});

it('covers the area around a point with a zigzag 10 NM apart', () => {
  const pts = areaAround({ lat: 60, lon: 15 }, 25);
  expect(pts).toHaveLength(12);
  expect(Math.max(...pts.map(p => p.lat)) - 60).toBeCloseTo(25 / 60, 3);
});

it('smooths the climb rate over the fixes', async () => {
  const { verticalSpeed } = await import('./navigation');
  const prev = { lat: 60, lon: 15, speedKt: 90, trackDeg: 0, altFt: 2000, accuracyM: 5, at: 0, vsFpm: -500 };
  expect(verticalSpeed(null, 1000, 1000)).toBeNull();
  expect(verticalSpeed({ ...prev, vsFpm: null }, 1990, 1000)).toBeCloseTo(-600, 5);
  expect(verticalSpeed(prev, 1990, 1000)).toBeCloseTo(-500 * 0.7 + -600 * 0.3, 5);
});
