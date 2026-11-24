import { parsePosition, positionCode } from './routePoint';

it('writes a position to the nearest minute in flight plan form, and reads it back', () => {
  expect(positionCode(59.2, 17.5667)).toBe('5912N01734E');
  expect(positionCode(-33.9999, -18.25)).toBe('3400S01815W');
  expect(positionCode(59.5, 375)).toBe('5930N01500E'); // a map scrolled round the world
  const p = parsePosition('5912N01734E');
  expect(p?.lat).toBeCloseTo(59.2);
  expect(p?.lon).toBeCloseTo(17.5667, 3);
  expect(parsePosition('593015N0170030E')?.lon).toBeCloseTo(17.00833, 4);
  expect(parsePosition('ESSX')).toBeNull();
  expect(parsePosition('5960N01700E')).toBeNull();
  expect(parsePosition('5930N017E')).toBeNull();
});
