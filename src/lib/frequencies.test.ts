import { containsAltitude, contactFrequencies, frequencyText, pointInfoHtml } from './frequencies';
import type { AirspaceView, Frequency, PointInfo } from '../types/route';

const f = (value: string, kind: Frequency['kind'], name: string | null = null, primary = false, source: string | null = null): Frequency =>
  ({ value, kind, name, primary, source });
const ctr: AirspaceView = {
  id: 'c', name: 'VÄSTERÅS CTR', type: 'CTR', icaoClass: 'C', activation: null, polygon: [],
  lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' },
  frequencies: [f('130.605', 'TWR', 'VÄSTERÅS TOWER', true, 'ESOW')],
};

test('names a frequency, and lists the ones to call primary first', () => {
  expect(frequencyText(f('130.605', 'TWR', 'VÄSTERÅS TOWER'))).toBe('130.605 VÄSTERÅS TOWER');
  expect(frequencyText(f('123.650', 'RADIO'))).toBe('123.650 Radio');
  expect(contactFrequencies([f('127.555', 'ATIS'), f('121.905', 'GND'), f('125.955', 'APP'), f('122.330', 'AFIS'), f('130.605', 'TWR', null, true)]).map(x => x.value))
    .toEqual(['130.605', '122.330', '125.955', '121.905']);
  expect(contactFrequencies(undefined)).toEqual([]);
});

test('altitude inside the limits', () => {
  expect(containsAltitude(ctr, 1000)).toBe(true);
  expect(containsAltitude(ctr, 2000)).toBe(false);
});

test('a map popup lists the airspaces with their frequencies and escapes names', () => {
  const info: PointInfo = {
    lat: 59.6, lon: 16.6,
    airspaces: [ctr, { ...ctr, id: 'x', name: '<b>X</b>', frequencies: [] }],
    airports: [{ code: 'ESOW', name: 'Västerås', lat: 59.59, lon: 16.63, distanceNm: 1.2, frequencies: [f('130.605', 'TWR', 'VÄSTERÅS TOWER', true)] }],
  };
  const html = pointInfoHtml(info);
  expect(html).toContain('<strong>VÄSTERÅS CTR</strong>');
  expect(html).toContain('130.605 VÄSTERÅS TOWER <span class="pi-sub">(from ESOW)</span>');
  expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
  expect(html).toContain('No frequency listed');
  expect(html).toContain('ESOW 1 NM: 130.605 VÄSTERÅS TOWER');
  expect(pointInfoHtml({ ...info, airspaces: [] })).toContain('uncontrolled (class G)');
});

test('under a high control area the air below is uncontrolled', () => {
  const cta = { ...ctr, id: 'cta', name: 'CTA', lower: { ft: 9500, datum: 'STD' as const, label: 'FL95' } };
  expect(pointInfoHtml({ lat: 0, lon: 0, airspaces: [cta], airports: [] })).toContain('Below FL95: no airspace listed, uncontrolled (class G).');
  // In Sweden: Sweden Control.
  expect(pointInfoHtml({ lat: 0, lon: 0, airspaces: [{ ...cta, name: 'CTA SUECIA' }], airports: [] })).toContain('Call Sweden Control for flight information or flight following');
  expect(pointInfoHtml({ lat: 0, lon: 0, airspaces: [cta], airports: [] })).toContain('Call the flight information service (FIS)');
  expect(pointInfoHtml({ lat: 0, lon: 0, airspaces: [ctr, cta], airports: [] })).not.toContain('Below');
});
