import { relativeAltText, trafficNear } from './traffic';
import type { Traffic } from '../api/backend';

const t = (over: Partial<Traffic>): Traffic => ({
  hex: 'abc123', callsign: null, registration: 'SE-XYZ', type: 'C172', lat: 60, lon: 15, altFt: 2000, altFromPressure: false,
  onGround: false, gsKt: 100, trackDeg: 0, vsFpm: 0, seenS: 1, ...over,
});
const own = { lat: 60, lon: 15, altFt: 2000, trackDeg: 0, speedKt: 100, vsFpm: 0 };

it('places traffic by clock position and height, and warns of a head-on at the same height', () => {
  // 3 NM ahead, coming the other way at the same height.
  const [headOn] = trafficNear(own, [t({ lat: 60.05, trackDeg: 180 })]);
  expect(headOn.clock).toBe(12);
  expect(headOn.nm).toBeCloseTo(3, 1);
  expect(headOn.conflict).toBe(true);
  expect(headOn.cpa?.s).toBeCloseTo(54, 0); // 3 NM closing at 200 kt
  // Same, 2,000 ft above: shown, no warning.
  expect(trafficNear(own, [t({ lat: 60.05, trackDeg: 180, altFt: 4000 })])[0].conflict).toBe(false);
  // Off to the right going the same way: 3 o'clock, no warning.
  const beside = trafficNear(own, [t({ lon: 15.1 })])[0];
  expect(beside.clock).toBe(3);
  expect(beside.conflict).toBe(false);
});

it('leaves out aircraft on the ground and out of range, nearest first', () => {
  const list = trafficNear(own, [t({ hex: 'far', lat: 60.5 }), t({ hex: 'ground', onGround: true, lat: 60.01 }), t({ hex: 'b', lat: 60.1 }), t({ hex: 'a', lat: 60.02 })]);
  expect(list.map(x => x.hex)).toEqual(['a', 'b']);
});

it('writes the height difference as traffic displays do', () => {
  expect(relativeAltText({ dAltFt: 400, vsFpm: 800 })).toBe('+04↑');
  expect(relativeAltText({ dAltFt: -1200, vsFpm: -100 })).toBe('-12');
  expect(relativeAltText({ dAltFt: null, vsFpm: null })).toBe('');
});
