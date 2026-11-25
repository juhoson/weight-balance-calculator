import { extraNm, suggestReportingPoints } from './reportingRoute';

const esow = { code: 'ESOW', lat: 59.5894, lon: 16.6336 };
const essb = { code: 'ESSB', lat: 59.3544, lon: 17.9417 };
const vrp = (airport: string, name: string, lat: number, lon: number, compulsory = true) =>
  ({ airport, name, lat, lon, compulsory, code: name });

test('leaves by the departure\'s point towards the arrival and joins by the arrival\'s on the way in', () => {
  const points = [
    vrp('ESOW', 'EAST', 59.58, 16.85), vrp('ESOW', 'WEST', 59.59, 16.4),
    vrp('ESSB', 'WESTB', 59.35, 17.75), vrp('ESSB', 'EASTB', 59.36, 18.15),
  ];
  expect(suggestReportingPoints(esow, essb, points).map(p => p.name)).toEqual(['EAST', 'WESTB']);
  expect(suggestReportingPoints(essb, esow, points).map(p => p.name)).toEqual(['WESTB', 'EAST']);
});

test('compulsory points first where there are any; one end without points is flown direct', () => {
  const points = [vrp('ESSB', 'ONREQUEST', 59.35, 17.8, false), vrp('ESSB', 'COMPULSORY', 59.45, 17.9)];
  expect(suggestReportingPoints(esow, essb, points).map(p => p.name)).toEqual(['COMPULSORY']);
});

test('nothing for a local flight, a hop, or without points', () => {
  const points = [vrp('ESOW', 'EAST', 59.58, 16.85)];
  expect(suggestReportingPoints(esow, esow, points)).toEqual([]);
  expect(suggestReportingPoints(esow, { code: 'ESSX', lat: 59.5786, lon: 16.7 }, points)).toEqual([]);
  expect(suggestReportingPoints(esow, essb, [])).toEqual([]);
});

test('extraNm is the detour over flying direct', () => {
  expect(extraNm(esow, essb, [])).toBeCloseTo(0);
  expect(extraNm(esow, essb, [{ lat: 59.7, lon: 17.3 }])).toBeGreaterThan(0);
});
