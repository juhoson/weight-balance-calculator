import { clearNavSession, loadNavSession, saveNavSession, updateNavSession, type NavSession } from './navSession';
import { storeTrack } from './flightTrack';
import type { RouteWeather } from '../types/route';

const trip = { departure: { code: 'ESOW' }, arrival: { code: 'ESSB' }, waypoints: [], distanceNm: 42 } as unknown as RouteWeather;
const session: NavSession = {
  trip, airspaces: [], airspacesFetchedAt: 1, reportingPoints: [], swedenControl: [], bestGlideKt: 73, cruiseKt: 110, cruiseAltFt: 3500,
};

beforeEach(() => localStorage.clear());

test('a flight is resumed only while its recording is recent', () => {
  saveNavSession(session);
  expect(loadNavSession()).toBeNull(); // nothing recorded yet
  storeTrack([{ lat: 59.6, lon: 16.6, altFt: 1000, at: 1_000_000 }]);
  expect(loadNavSession(1_000_000 + 60_000)?.cruiseKt).toBe(110);
  expect(loadNavSession(1_000_000 + 31 * 60_000)).toBeNull();
});

test('what loads later is added; ending the flight clears it', () => {
  storeTrack([{ lat: 59.6, lon: 16.6, altFt: 1000, at: Date.now() }]);
  updateNavSession({ cruiseKt: 1 });
  expect(loadNavSession()).toBeNull(); // nothing saved to add to
  saveNavSession(session);
  updateNavSession({ nearVrps: [{ name: 'X', lat: 1, lon: 2, compulsory: false }] });
  expect(loadNavSession()?.nearVrps).toHaveLength(1);
  clearNavSession();
  expect(loadNavSession()).toBeNull();
});
