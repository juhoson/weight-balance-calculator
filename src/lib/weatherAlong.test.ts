import { weatherAlong } from './weatherAlong';
import type { RoutePoint } from '../types/route';

const point = (role: RoutePoint['role'], station: string | null, nm: number, airportCode: string | null = null): RoutePoint => ({
  role, airportCode, alongTrackNm: nm, station: station ? { code: station, name: station, distanceNm: 5 } : null,
  metar: station ? { station, raw: `${station} 271020Z 24008KT 9999 FEW030 05/01 Q1012` } as RoutePoint['metar'] : null, taf: null,
});

test('a waypoint or en-route point with a METAR already shown is left out; departure and arrival always keep theirs', () => {
  const w = weatherAlong([
    point('DEPARTURE', 'ESOW', 0, 'ESOW'),
    point('ENROUTE', 'ESOW', 20),
    point('WAYPOINT', 'ESSA', 40, 'ESKN'),
    point('ENROUTE', 'ESSA', 60),
    point('ENROUTE', 'ESGG', 150),
    point('ARRIVAL', 'ESGG', 175, 'ESGG'),
  ]);
  expect(w.departure?.alongTrackNm).toBe(0);
  expect(w.along.map(p => p.alongTrackNm)).toEqual([40]);
  expect(w.repeated.map(r => [r.point.alongTrackNm, r.station])).toEqual([[20, 'ESOW'], [60, 'ESSA'], [150, 'ESGG']]);
  expect(w.arrival?.alongTrackNm).toBe(175);
});

test('a local flight has no arrival card, and points without a station are kept', () => {
  const w = weatherAlong([point('DEPARTURE', 'ESOW', 0, 'ESOW'), point('ENROUTE', null, 10), point('ARRIVAL', 'ESOW', 0, 'ESOW')], true);
  expect(w.arrival).toBeNull();
  expect(w.along).toHaveLength(1);
  expect(w.repeated).toHaveLength(0);
});
