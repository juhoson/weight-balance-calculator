import { clubFromUrl, urlWithoutClub } from './clubLink';

it('reads the club code, lower case, and drops it from the address', () => {
  expect(clubFromUrl('?club=VFK')).toBe('vfk');
  expect(clubFromUrl('?club=%20')).toBeNull();
  expect(clubFromUrl('')).toBeNull();
  expect(urlWithoutClub('https://songer.se/weight-balance/?club=hff&route=abc#x')).toBe('/weight-balance/?route=abc#x');
});
