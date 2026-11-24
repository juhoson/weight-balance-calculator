import { parsePosition, positionCode, positionText, routeLabels } from './routePoint';

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

it('names positions WP1, WP2, … in route order and says where they are', () => {
  expect(routeLabels(['ESSX', '5912N01734E', 'ESKN', '5930N01700E', 'ESGG'])).toEqual(['ESSX', 'WP1', 'ESKN', 'WP2', 'ESGG']);
  expect(positionText('5912N01734E')).toBe('59°12′N 017°34′E');
  expect(positionText('593015N0170030W')).toBe('59°30′15″N 017°00′30″W');
  expect(positionText('ESSX')).toBeNull();
});
