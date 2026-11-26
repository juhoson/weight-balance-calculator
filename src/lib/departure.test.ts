import { departureClimb, type DepartureClimb, departureClimbLabel } from './departure';
import type { AirportInfo, Metar } from '../types/route';

// Runway 12/30, the route heading south.
const dep: AirportInfo = {
  code: 'ESSX', name: 'Test', type: 'small_airport', lat: 59.6, lon: 16.6, elevationFt: 100, country: 'SE', municipality: '',
  runways: [{ le: '12', he: '30', lengthFt: 3000, surface: 'ASP', leHeadingTrue: 120, heHeadingTrue: 300, headingEstimated: false }],
};
const south = { lat: 59.1, lon: 16.6 };
const metar = (windDirTrue: number, windKt: number) => ({ windDirTrue, windKt, gustKt: null } as unknown as Metar);
const summer = new Date('2026-07-01T12:00:00Z');

it('climbs out on the runway into the wind to 700 ft before turning on course', () => {
  const d = departureClimb(dep, metar(290, 12), south, { fpm: 700, kt: 79 }, summer) as DepartureClimb;
  expect(d).toMatchObject({ runway: '30', headingDeg: 300, by: 'wind' });
  expect(d.nm).toBeCloseTo(1.32, 2); // 1 min at 79 kt
  expect(d.lat).toBeGreaterThan(dep.lat); // north-west of the field
  expect(d.lon).toBeLessThan(dep.lon);
  expect(departureClimbLabel(d)).toBe('RWY 30 to 700 ft');
});

it('without a wind, takes the runway most along the course', () => {
  expect(departureClimb(dep, null, south, null, summer)).toMatchObject({ runway: '12', by: 'course' });
});

it('needs no climb-out when the course is along the runway, or the runways have no headings', () => {
  expect(departureClimb(dep, null, { lat: 59.4, lon: 17.13 }, null, summer)).toBeNull(); // ~120°
  expect(departureClimb({ ...dep, runways: [] }, metar(290, 12), south, null, summer)).toBeNull();
});
