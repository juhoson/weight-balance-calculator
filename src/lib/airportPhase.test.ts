import { newApproachWatch, overRunway, runwayZoom, RUNWAY_ZOOM, watchApproach, type ApproachWatch } from './airportPhase';
import type { AirportLayout } from './airportLayout';

// A north-south runway about 2 km long.
const layout: AirportLayout = {
  code: 'ESXX', available: true,
  features: [{ kind: 'runway', ref: '01/19', points: [[59.0, 16.0], [59.018, 16.0]] }] as AirportLayout['features'],
};

test('over the runway between its ends, not past the end or off to the side', () => {
  expect(overRunway([layout], { lat: 59.009, lon: 16.0 })).toBe(true);
  expect(overRunway([layout], { lat: 59.009, lon: 16.0005 })).toBe(true); // ~30 m off the centre line
  expect(overRunway([layout], { lat: 59.02, lon: 16.0 })).toBe(false); // past the end
  expect(overRunway([layout], { lat: 59.009, lon: 16.005 })).toBe(false); // ~290 m to the side
});

test('the layout stays in view on a takeoff until past the end or 300 ft up; on the way in from 200 ft', () => {
  expect(runwayZoom({ aglFt: 0, vsFpm: 0, overRunway: true })).toBe(RUNWAY_ZOOM);
  expect(runwayZoom({ aglFt: 250, vsFpm: 700, overRunway: true })).toBe(RUNWAY_ZOOM);
  expect(runwayZoom({ aglFt: 320, vsFpm: 700, overRunway: true })).toBeNull();
  expect(runwayZoom({ aglFt: 150, vsFpm: 700, overRunway: false })).toBeNull(); // climbing out past the end
  expect(runwayZoom({ aglFt: 400, vsFpm: -500, overRunway: false })).toBeNull();
  expect(runwayZoom({ aglFt: 200, vsFpm: -500, overRunway: false })).toBe(RUNWAY_ZOOM);
  expect(runwayZoom({ aglFt: null, vsFpm: -500, overRunway: false })).toBeNull();
});

const step = (w: ApproachWatch, aglFt: number, vsFpm: number, speedKt = 70, nm = 1) =>
  watchApproach(w, { speedKt, trackDeg: 190, vsFpm }, { code: 'ESXX', aglFt, nm });

test('a go-around: down low near the field, then climbing away without landing', () => {
  let r = step(newApproachWatch(), 600, -500);
  expect(r.watch.field).toBeNull(); // still too high to count as an approach
  r = step(r.watch, 400, -500);
  expect(r.watch.field).toBe('ESXX');
  r = step(r.watch, 80, -400);
  r = step(r.watch, 120, 500);
  expect(r.goAround).toBeNull(); // not 100 ft above the lowest yet
  r = step(r.watch, 200, 600);
  expect(r.goAround).toEqual({ field: 'ESXX', trackDeg: 190 });
  expect(r.watch.field).toBeNull();
});

test('a landing or a takeoff is no go-around', () => {
  let r = step(newApproachWatch(), 400, -500);
  r = step(r.watch, 0, -100, 30); // on the ground
  expect(r.watch.field).toBeNull();
  r = step(r.watch, 200, 800); // the next takeoff: never descended, so not watched
  r = step(r.watch, 400, 800);
  expect(r.goAround).toBeNull();
});
