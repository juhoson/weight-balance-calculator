import { fitScale } from './BriefingPack';

it('shrinks only what does not fit, and not below 75%', () => {
  expect(fitScale(900, 1000)).toBe(1);
  expect(fitScale(1100, 1000)).toBe(0.909);
  expect(fitScale(2000, 1000)).toBe(0.75);
  expect(fitScale(0, 1000)).toBe(1);
});
