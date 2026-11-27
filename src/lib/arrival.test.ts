import { ahead, arrivalPlan, circuitPattern, circuitSide, isControlledField, landingOptions, landingRunway, runwayAlong, thresholdOf } from './arrival';
import type { AirportInfo, AirspaceView, Metar } from '../types/route';
import { distanceNm } from './openMeteo';

const esow: AirportInfo = {
  code: 'ESOW', name: 'Västerås', type: 'medium', lat: 59.5894, lon: 16.6336, elevationFt: 21, country: 'SE', municipality: '',
  runways: [{ le: '01', he: '19', lengthFt: 8468, surface: 'ASP', leHeadingTrue: 8, heHeadingTrue: 188, headingEstimated: false }],
};
const metar = (dir: number, kt: number) => ({ windDirTrue: dir, windKt: kt, windVariable: false, gustKt: null } as unknown as Metar);
const north = { lat: 60.2, lon: 16.6 };
const SUMMER = new Date('2026-07-01');

describe('landingRunway', () => {
  it('into the wind', () => {
    expect(landingRunway(esow, metar(200, 10), north, null, SUMMER)).toMatchObject({ runway: '19', by: 'wind' });
    expect(landingRunway(esow, metar(20, 10), north, null, SUMMER)).toMatchObject({ runway: '01', by: 'wind' });
  });
  it('without wind, the one in line with the way in (from the north: heading south, 19)', () => {
    expect(landingRunway(esow, null, north, null, SUMMER)).toMatchObject({ runway: '19', by: 'course' });
  });
  it('the pilot\'s choice wins, when it is a runway there', () => {
    expect(landingRunway(esow, metar(200, 10), north, '01', SUMMER)).toMatchObject({ runway: '01', by: 'chosen' });
    expect(landingRunway(esow, metar(200, 10), north, '07', SUMMER)?.runway).toBe('19');
    expect(landingOptions(esow, SUMMER).map(o => o.runway)).toEqual(['01', '19']);
  });
  it('none without runway headings', () => {
    expect(landingRunway({ ...esow, runways: [] }, null, north)).toBeNull();
  });
});

describe('thresholdOf', () => {
  const rwy19 = { runway: '19', headingDeg: 188, lengthFt: 8468 };
  it('from the layout when it has the runway', () => {
    const layout = { code: 'ESOW', available: true, features: [
      { kind: 'runway', ref: '01/19', widthM: 45, surface: 'asphalt', points: [[59.578, 16.631], [59.601, 16.636]] as Array<[number, number]> },
    ] };
    // 19 starts at the north end.
    expect(thresholdOf(esow, rwy19, layout)).toEqual({ lat: 59.601, lon: 16.636 });
  });
  it('else half the runway back from the reference point', () => {
    const thr = thresholdOf(esow, rwy19, null);
    expect(thr.lat).toBeGreaterThan(esow.lat); // north of the middle
    expect(distanceNm(esow.lat, esow.lon, thr.lat, thr.lon)).toBeCloseTo(8468 / 2 / 6076.12, 2);
  });
});

describe('arrivalPlan', () => {
  const landing = { runway: '19', headingDeg: 180, lengthFt: 6076, by: 'wind' as const };
  it('uncontrolled: 45° onto the downwind on the circuit side, base, final, the threshold', () => {
    const plan = arrivalPlan(esow, landing, { side: 'LEFT' });
    expect(plan.kind).toBe('circuit');
    expect(plan.points.map(p => p.label)).toEqual(['Join left downwind 19', 'Downwind 19', 'Base 19', 'Final 19', 'RWY 19']);
    const thr = plan.points[4];
    // Landing south, a left circuit lies east of the runway; the final is north of the threshold.
    expect(plan.points[1].lon).toBeGreaterThan(thr.lon);
    expect(plan.points[3].lat).toBeGreaterThan(thr.lat);
    expect(arrivalPlan(esow, landing, { side: 'RIGHT' }).points[1].lon).toBeLessThan(thr.lon);
  });
  it('in a control zone: a straight final of 3 NM, as cleared', () => {
    const plan = arrivalPlan(esow, landing, { controlled: true });
    expect(plan.points.map(p => p.label)).toEqual(['Final 19 (as cleared)', 'RWY 19']);
    expect(distanceNm(plan.points[0].lat, plan.points[0].lon, plan.points[1].lat, plan.points[1].lon)).toBeCloseTo(3, 1);
  });
});

it('circuit side and control zone', () => {
  expect(circuitSide([{ runway: '19', direction: 'RIGHT' }], '19')).toBe('RIGHT');
  expect(circuitSide([{ runway: '19', direction: null }], '19')).toBe('LEFT');
  expect(circuitSide(null, '01')).toBe('LEFT');
  const box = (type: string): AirspaceView => ({
    id: type, name: type, type, icaoClass: 'D', lower: { ft: 0, label: 'GND' }, upper: { ft: 2000, label: '2000' }, activation: null,
    polygon: [[16.5, 59.5], [16.8, 59.5], [16.8, 59.7], [16.5, 59.7]], frequencies: [],
  } as unknown as AirspaceView);
  expect(isControlledField(esow, [box('CTR')])).toBe(true);
  expect(isControlledField(esow, [box('TIZ')])).toBe(false);
  expect(isControlledField(esow, null)).toBe(false);
  expect(ahead({ lat: 59, lon: 16 }, 0, 60).lat).toBeCloseTo(60, 5);
});

test('the circuit after a go-around: upwind past the far end, round on the circuit side to the threshold', () => {
  const field = { code: 'ESXX', name: 'X', lat: 59, lon: 16, elevationFt: 100, type: 'small_airport',
    runways: [{ le: '01', he: '19', leHeadingTrue: 10, heHeadingTrue: 190, lengthFt: 3000 }] } as unknown as Parameters<typeof circuitPattern>[0];
  const end = runwayAlong(field, 185);
  if (!end) throw new Error('no runway');
  expect(end.runway).toBe('19');
  const pts = circuitPattern(field, end, 'LEFT');
  expect(pts.map(p => p.label)).toEqual(['RWY 19', 'Crosswind', 'Downwind', 'Base', 'Final', 'RWY 19']);
  // Landing south (190°), a left circuit lies to the east.
  expect(pts[2].lon).toBeGreaterThan(pts[0].lon);
  expect(pts[1].lat).toBeLessThan(pts[0].lat);
  expect(circuitPattern(field, end, 'RIGHT')[2].lon).toBeLessThan(pts[0].lon);
});
