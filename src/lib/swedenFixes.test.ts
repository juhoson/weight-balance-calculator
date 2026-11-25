import { fixesAiracText, fixesNear, fixesOutOfDate, SWEDEN_FIXES_EFFECTIVE, SWEDEN_FIXES_SOURCE } from './swedenFixes';

const esow = { lat: 59.5894, lon: 16.6336 };
const essb = { lat: 59.3544, lon: 17.9417 };

test('the AIP points near the route, with the routes they are on', () => {
  expect(SWEDEN_FIXES_SOURCE).toMatch(/ENR 4\.4/);
  const near = fixesNear([esow, essb], 15);
  expect(near.length).toBeGreaterThan(0);
  // ARGIB 595053N 0164441E, about 15 NM north of Västerås: just outside 10 NM, inside 20.
  expect(fixesNear([esow, essb], 10).map(p => p.name)).not.toContain('ARGIB');
  expect(fixesNear([esow, essb], 20).find(p => p.name === 'ARGIB')).toEqual({ name: 'ARGIB', lat: 59.84806, lon: 16.74472, routes: 'P609, Z166, Z183' });
  expect(fixesNear([{ lat: 40, lon: 0 }], 15)).toEqual([]);
});

test('out of date once its AIRAC cycle (28 days) is over', () => {
  expect(fixesAiracText()).toBe('AIRAC 26 Nov 2026');
  expect(SWEDEN_FIXES_EFFECTIVE).toBe(Date.UTC(2026, 10, 26));
  expect(fixesOutOfDate(Date.UTC(2026, 11, 23, 23, 59))).toBe(false);
  expect(fixesOutOfDate(Date.UTC(2026, 11, 24))).toBe(true);
});
