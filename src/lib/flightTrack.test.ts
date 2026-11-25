import { clearTrack, loadTrack, MAX_POINTS, RESUME_MS, storeTrack, thinned, trackName, trackStats } from './flightTrack';

const p = (at: number, lat = 59.5) => ({ lat, lon: 16.6, altFt: 1000, at });

beforeEach(() => localStorage.clear());

test('a recent recording is carried on; an old one is dropped', () => {
  storeTrack([p(0), p(60_000)]);
  expect(loadTrack(60_000 + RESUME_MS)).toHaveLength(2);
  expect(loadTrack(60_001 + RESUME_MS)).toEqual([]);
  clearTrack();
  expect(loadTrack(0)).toEqual([]);
});

test('thinned under the limit, keeping the ends', () => {
  const many = Array.from({ length: MAX_POINTS + 2 }, (_, i) => p(i));
  const t = thinned(many);
  expect(t.length).toBeLessThanOrEqual(MAX_POINTS);
  expect(t[0]).toBe(many[0]);
  expect(t[t.length - 1]).toBe(many[many.length - 1]);
  expect(thinned([p(0)])).toHaveLength(1);
});

test('distance, time and name', () => {
  const s = trackStats([p(0, 59), p(30 * 60_000, 59.5)]);
  expect(s.nm).toBeCloseTo(30, 0);
  expect(s.minutes).toBe(30);
  expect(trackName('ESOW', 'ESSB', Date.UTC(2026, 10, 25, 12))).toBe('ESOW → ESSB, 25 Nov 2026');
});
