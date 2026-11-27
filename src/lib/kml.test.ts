import { flightKml, kmlFileName } from './kml';

it('a timed track with the logged times marked, well-formed and escaped', () => {
  const pts = [{ lat: 59.0, lon: 16.0, altFt: 100, at: 0 }, { lat: 59.1, lon: 16.1, altFt: 1500, at: 600_000 }];
  const kml = flightKml('ESOW → ESSB & back', pts, { offBlock: '1970-01-01T00:00:00Z', takeoff: '1970-01-01T00:09:50Z', landing: null, onBlock: null, landings: 1 });
  const doc = new DOMParser().parseFromString(kml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  expect(kml).toContain('<name>ESOW → ESSB &amp; back</name>');
  expect(kml).toContain('<gx:coord>16.100000 59.100000 457</gx:coord>');
  expect(kml).toContain('<name>Takeoff 00:09Z</name>');
  expect(kml).toContain('<coordinates>16.100000,59.100000,457</coordinates>');
  expect(kml).not.toContain('Landing');
  expect(kmlFileName(pts)).toBe('flight-1970-01-01-0000.kml');
});

it('on the ground without altitudes', () => {
  expect(flightKml('x', [{ lat: 59, lon: 16, altFt: null, at: 0 }, { lat: 59, lon: 16.1, altFt: 10, at: 1000 }])).toContain('clampToGround');
});
