import { describe as describeAircraft, groupKeys, matchesQuery } from './aircraftGroups';
import type { AircraftMeta } from './aircraftCatalog';

const meta: Record<string, AircraftMeta> = {
  'PA28-161 (generic)': { kind: 'generic', label: 'Piper PA-28-161', code: 'PA28-161', typeStatus: 'CURATED' },
  'PA28-161 (SE-KMI)': {
    kind: 'airframe', label: 'PA28-161 (SE-KMI)', code: 'PA28-161', model: 'Piper PA-28-161 Warrior II', registration: 'SE-KMI',
    owned: false, club: 'Västerås Flygklubb', typeStatus: 'CURATED', verification: 'UNVERIFIED', weighedOn: null,
  },
  'DA40D (SE-MBC)': {
    kind: 'airframe', label: 'DA40D (SE-MBC)', code: 'DA40D', model: 'Diamond DA40 D', registration: 'SE-MBC',
    owned: false, club: 'Hässlö Flygförening', typeStatus: 'CURATED', verification: 'UNVERIFIED', weighedOn: null,
  },
  'TB9 (SE-OWN)': {
    kind: 'airframe', label: 'TB9 (SE-OWN)', code: 'TB9', model: 'SOCATA TB9', registration: 'SE-OWN',
    owned: true, club: null, typeStatus: 'AI_SUGGESTED', verification: 'USER_CONFIRMED', weighedOn: null,
  },
};
const keys = Object.keys(meta);

it('groups generic, own, then clubs by name', () => {
  expect(groupKeys(keys, meta).map(g => g.title)).toEqual([
    'Generic aircraft', 'Your aircraft', 'Hässlö Flygförening', 'Västerås Flygklubb',
  ]);
});

it('finds aircraft by registration with or without the dash, model, code or club', () => {
  const find = (q: string) => keys.filter(k => matchesQuery(k, meta[k], q));
  expect(find('sekmi')).toEqual(['PA28-161 (SE-KMI)']);
  expect(find('SE-KMI')).toEqual(['PA28-161 (SE-KMI)']);
  expect(find('warrior')).toEqual(['PA28-161 (SE-KMI)']);
  expect(find('pa28')).toEqual(['PA28-161 (generic)', 'PA28-161 (SE-KMI)']);
  expect(find('vasteras')).toEqual(['PA28-161 (SE-KMI)']); // accents ignored
  expect(find('hässlö da40')).toEqual(['DA40D (SE-MBC)']);
  expect(find('')).toEqual(keys);
  expect(find('cessna')).toEqual([]);
});

it('describes an aircraft for the picker', () => {
  expect(describeAircraft('DA40D (SE-MBC)', meta['DA40D (SE-MBC)'])).toEqual({
    title: 'SE-MBC', subtitle: 'Diamond DA40 D · Hässlö Flygförening',
  });
  expect(describeAircraft('TB9 (SE-OWN)', meta['TB9 (SE-OWN)']).subtitle).toBe('SOCATA TB9 · Your aircraft');
});
