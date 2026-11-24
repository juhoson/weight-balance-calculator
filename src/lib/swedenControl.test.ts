import { swedenControlAdvice, swedenControlAlong, swedenControlAt } from './swedenControl';
import { classGHint } from './frequencies';

const at = (lat: number, lon: number) => swedenControlAt(lat, lon)?.sector;

test('finds the sector at well-known places', () => {
  expect(at(59.22, 15.04)).toMatchObject({ sector: 'ESOS 3', frequency: '131.130', callsign: 'SWEDEN CONTROL', exact: true }); // Örebro
  expect(at(57.76, 14.07)).toMatchObject({ sector: 'ESOS 1', frequency: '118.405' }); // Jönköping
  expect(at(57.66, 12.29)).toMatchObject({ sector: 'ESMM 4/5', frequency: '128.630' }); // Göteborg
  expect(at(55.54, 13.37)).toMatchObject({ sector: 'ESMM K/L', frequency: '124.855', callsign: 'SWEDEN INFORMATION' }); // Malmö
  expect(at(67.82, 20.34)).toMatchObject({ sector: 'ESOS K', frequency: '131.055' }); // Kiruna
  expect(at(63.19, 14.5)).toMatchObject({ sector: 'ESOS N', frequency: '132.155' }); // Östersund
});

test('nothing outside Sweden', () => {
  expect(swedenControlAt(60.2, 11.1)).toBeNull(); // Oslo
  expect(swedenControlAt(55.6, 12.65)).toBeNull(); // Kastrup
  expect(swedenControlAt(48.85, 2.35)).toBeNull();
});

test('advice names the frequency and says when it is uncertain', () => {
  expect(swedenControlAdvice({ sector: { sector: 'ESOS 3', callsign: 'SWEDEN CONTROL', frequency: '131.130', exact: true }, nearby: [] }))
    .toBe('Call Sweden Control 131.130 for flight information or flight following, sector ESOS 3.');
  expect(swedenControlAdvice({
    sector: { sector: 'ESOS 3', callsign: 'SWEDEN CONTROL', frequency: '131.130', exact: true },
    nearby: [{ sector: 'ESOS 1', callsign: 'SWEDEN CONTROL', frequency: '118.405', exact: true }],
  })).toContain('near the boundary with Sweden Control 118.405');
  expect(swedenControlAdvice({
    sector: { sector: 'ESMM 7', callsign: 'SWEDEN CONTROL', frequency: '124.155', exact: false,
      alternative: { sector: 'ESOS 9', callsign: 'SWEDEN CONTROL', frequency: '127.530' } },
    nearby: [],
  })).toContain('or Sweden Control 127.530 (the chart doesn\'t settle which here)');
});

test('class G at a Swedish point names its sector frequency', () => {
  expect(classGHint({ lat: 59.22, lon: 15.04, airspaces: [], airports: [] })).toContain('Call Sweden Control 131.130');
});

test('lists the frequencies along a route in order', () => {
  // Örebro to Jönköping: ESOS 3, then ESOS 1.
  const legs = swedenControlAlong([{ code: 'ESOE', lat: 59.22, lon: 15.04 }, { code: 'ESGJ', lat: 57.76, lon: 14.07 }]);
  expect(legs.map(l => l.sector.frequency)).toEqual(['131.130', '118.405']);
  expect(legs[0].fromNm).toBe(0);
  expect(legs[1].toNm).toBeGreaterThan(90);
  expect(legs[0].toNm).toBeCloseTo(legs[1].fromNm, 0);
});
