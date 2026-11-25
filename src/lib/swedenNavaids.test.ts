import { type Navaid, NAVAIDS, navaidsIn, navaidsNear, navaidSvg, navaidText } from './swedenNavaids';

const esow = { lat: 59.5894, lon: 16.6336 };
const essb = { lat: 59.3544, lon: 17.9417 };

test('the AIP en-route navaids, what to tune and where', () => {
  const aros = NAVAIDS.find(n => n.ident === 'ARS') as Navaid;
  expect(aros).toEqual({ name: 'AROS', type: 'DVOR/DME', ident: 'ARS', frequency: '112.80', channel: 'CH75X', lat: 59.58611, lon: 16.65028 });
  expect(navaidText(aros)).toBe('AROS DVOR/DME ARS 112.80');
  expect(navaidsNear([esow, essb], 30).map(n => n.ident)).toEqual(expect.arrayContaining(['ARS', 'TEB', 'ARL']));
  expect(navaidsNear([esow, essb], 30).map(n => n.ident)).not.toContain('KRA');
  expect(navaidsIn(59, 16, 60, 17).map(n => n.ident)).toEqual(['ARS']);
  expect(navaidSvg(aros)).toContain('polygon');
  expect(navaidSvg(NAVAIDS.find(n => n.type === 'DME') as Navaid)).not.toContain('polygon');
});
