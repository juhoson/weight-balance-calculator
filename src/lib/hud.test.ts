import { bankFor, nextTurn, pathAngle } from './hud';

it('a standard-rate turn at 100 kt is about 15° of bank', () => {
  expect(bankFor(3, 100)).toBeCloseTo(15.1, 0);
  expect(bankFor(-3, 100)).toBeCloseTo(-15.1, 0);
  expect(bankFor(3, 10)).toBe(0); // taxiing
  expect(bankFor(30, 120)).toBe(60);
});

it('smooths the turn rate, the short way round through north', () => {
  let t = nextTurn(null, 350, 0, 100);
  expect(t.dps).toBe(0);
  t = nextTurn(t, 356, 2000, 100); // 3°/s right
  expect(t.dps).toBeCloseTo(1.2);
  t = nextTurn(t, 2, 4000, 100);
  expect(t.dps).toBeCloseTo(1.92);
  expect(nextTurn(t, 2, 30_000, 100).dps).toBe(0); // a gap: start again
});

it('a 500 ft/min descent at 70 kt is about a 4° path', () => {
  expect(pathAngle(-500, 70)).toBeCloseTo(-4.0, 1);
  expect(pathAngle(null, 70)).toBe(0);
});
