import { nextBearing, trackUpFrame } from './trackUp';

it('covers the whole view from the aircraft out to the farthest corner', () => {
  const f = trackUpFrame(400, 800);
  expect(f.cx).toBe(200);
  expect(f.cy).toBeCloseTo(496);
  // Farthest corner: top, sqrt(200² + 496²) ≈ 534.8.
  expect(f.size).toBe(1072);
  expect(f.left + f.size / 2).toBeCloseTo(200, 0);
  expect(f.top + f.size / 2).toBeCloseTo(496, 0);
});

it('turns the short way round', () => {
  expect(nextBearing(350, 10)).toBe(370);
  expect(nextBearing(370, 340)).toBe(340);
  expect(nextBearing(15, null)).toBe(15);
});
