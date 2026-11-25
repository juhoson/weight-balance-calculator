import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { downloadTrackKml, fetchAirportsAlong, fetchMapStatus, saveTrack } from '../../api/backend';
import type { AirportInfo, AirspaceView, RouteWeather } from '../../types/route';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: NavigationMode } = require('./NavigationMode') as typeof import('./NavigationMode');

jest.mock('../../api/backend', () => ({
  fetchMapStatus: jest.fn(),
  fetchAirportsAlong: jest.fn(),
  saveTrack: jest.fn(),
  downloadTrackKml: jest.fn(),
  AIRSPACE_TILE_URL: '/api/map/airspace/{z}/{x}/{y}.png',
  BASEMAP_TILE_URL: '/api/map/base/{z}/{x}/{y}.mvt',
}));
// The real one is an ES module Jest can't load; a plain layer stands in.
jest.mock('protomaps-leaflet', () => ({ leafletLayer: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leafletLayer } = require('protomaps-leaflet') as { leafletLayer: jest.Mock };

const airport = (code: string, name: string, lat: number, lon: number, elevationFt = 50): AirportInfo => ({
  code, name, type: 'medium', lat, lon, elevationFt, country: 'SE', municipality: '',
  runways: [{ le: '01', he: '19', lengthFt: 8000, surface: 'ASP', leHeadingTrue: 10, heHeadingTrue: 190, headingEstimated: false }],
});
const esow = airport('ESOW', 'Västerås', 59.5894, 16.6336);
const essb = airport('ESSB', 'Bromma', 59.3544, 17.9417);
const essx = airport('ESSX', 'Johannisberg', 59.5786, 16.5031);
const trip = { departure: esow, arrival: essb, waypoints: [], distanceNm: 42 } as unknown as RouteWeather;
const ctr: AirspaceView = {
  id: 'ctr', name: 'VÄSTERÅS CTR', type: 'CTR', icaoClass: 'D', activation: null,
  polygon: [[16.4, 59.5], [16.9, 59.5], [16.9, 59.7], [16.4, 59.7], [16.4, 59.5]],
  lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 1500, datum: 'MSL', label: '1500 ft' },
  frequencies: [{ value: '130.605', name: 'VÄSTERÅS TOWER', kind: 'TWR', primary: true, source: null }],
};

beforeEach(() => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
  (fetchAirportsAlong as jest.Mock).mockResolvedValue([esow, essb, essx]);
});

const open = (onClose = jest.fn()) => render(
  <NavigationMode trip={trip} airspaces={[ctr]} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} onClose={onClose}/>,
);

test('warns first that it is experimental; Cancel closes', () => {
  const onClose = jest.fn();
  open(onClose);
  expect(screen.getByText(/situational awareness only, not for navigation/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalled();
});

test('the demo flight shows speed, track, the next point and the airspace it is in', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('DEMO FLIGHT (4× speed)')).toBeInTheDocument();
  expect(screen.getByText('110')).toBeInTheDocument(); // GS
  expect(screen.getByText('Next ESSB')).toBeInTheDocument();
  const here = screen.getByRole('status', { name: 'Airspace here' });
  expect(within(here).getByText('VÄSTERÅS CTR')).toBeInTheDocument();
  expect(within(here).getByText('130.605 VÄSTERÅS TOWER')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Frequencies/ }));
  const freq = screen.getByRole('region', { name: 'Frequencies' });
  expect(within(freq).getByText('Emergency 121.500')).toBeInTheDocument();
  expect(within(freq).getByText('now')).toBeInTheDocument();
});

test('emergency lists the nearest airfields within glide; Direct to steers to one', async () => {
  // 3,000 ft (914 m) over Västerås, eastbound.
  const watchPosition = jest.fn((ok: PositionCallback) => {
    ok({ timestamp: Date.now(), coords: { latitude: 59.59, longitude: 16.7, altitude: 914.4, speed: 50, heading: 100, accuracy: 8 } } as GeolocationPosition);
    return 1;
  });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  await screen.findByText('Next ESSB');
  expect(screen.getByText('3,000')).toBeInTheDocument();
  expect(screen.getByText('100')).toBeInTheDocument();
  await waitFor(() => expect(fetchAirportsAlong).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /EMERGENCY/ }));
  const sheet = screen.getByRole('region', { name: 'Emergency' });
  const rows = within(sheet).getAllByRole('listitem').filter(li => within(li).queryByRole('button', { name: 'Direct to' }));
  expect(rows[0]).toHaveTextContent('ESOW');
  expect(within(sheet).getAllByText('In glide').length).toBeGreaterThan(0);
  expect(within(sheet).getByText('MAYDAY')).toBeInTheDocument();
  fireEvent.click(within(rows[1]).getByRole('button', { name: 'Direct to' }));
  expect(screen.getByText(/^Direct to ESS[XB]$/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to route' }));
  expect(screen.getByText('Next ESSB')).toBeInTheDocument();
});

test('with the server\'s own base map: drawn from it, and the route\'s tiles are saved for offline', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const L = require('leaflet');
  leafletLayer.mockImplementation(() => L.layerGroup());
  (fetchMapStatus as jest.Mock).mockResolvedValue({
    airspace: true, minZoom: 4, maxZoom: 14, basemap: { minZoom: 0, maxZoom: 11, bounds: [4, 53.5, 32, 71.5] },
  });
  const kept = new Map<string, unknown>();
  (window as unknown as { caches: unknown }).caches = {
    open: async () => ({
      match: async (url: string) => kept.get(url),
      put: async (url: string, res: unknown) => { kept.set(url, res); },
      keys: async () => Array.from(kept.keys()),
    }),
    delete: async () => true,
  };
  global.fetch = jest.fn(async () => ({ status: 200 })) as unknown as typeof fetch;
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('Map saved for offline', {}, { timeout: 5000 })).toBeInTheDocument();
  expect(leafletLayer).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/map/base/{z}/{x}/{y}.mvt', maxDataZoom: 11 }));
  const urls = Array.from(kept.keys());
  expect(urls.some(u => u.includes('/api/map/base/11/'))).toBe(true);
  expect(urls.some(u => u.includes('/api/map/airspace/10/'))).toBe(true);
  expect(urls.some(u => u.includes('/api/map/airspace/11/'))).toBe(false); // shown enlarged from 10
  delete (window as unknown as { caches?: unknown }).caches;
});

test('a GPS flight ends on its own page: saved to the account, then its KML', async () => {
  localStorage.clear();
  let tick: PositionCallback = () => undefined;
  const watchPosition = jest.fn((ok: PositionCallback) => { tick = ok; return 1; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  (saveTrack as jest.Mock).mockResolvedValue({ id: 7, name: 'x', startedAt: '', endedAt: '', distanceNm: 1, pointCount: 2 });
  (downloadTrackKml as jest.Mock).mockResolvedValue(undefined);
  const onClose = jest.fn();
  render(<NavigationMode trip={trip} airspaces={[]} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} signedIn onClose={onClose}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  const at = (lat: number, t: number) => act(() => tick({ timestamp: t, coords: { latitude: lat, longitude: 16.7, altitude: 600, speed: 50, heading: 0, accuracy: 8 } } as GeolocationPosition));
  await waitFor(() => expect(watchPosition).toHaveBeenCalled());
  at(59.59, 1_000_000);
  await screen.findByText('Next ESSB');
  at(59.60, 1_060_000);
  at(59.61, 1_120_000);

  fireEvent.click(screen.getByRole('button', { name: 'Close navigation mode' }));
  const end = screen.getByRole('region', { name: 'End flight' });
  expect(within(end).getByDisplayValue(/^ESOW → ESSB, /)).toBeInTheDocument();
  fireEvent.click(within(end).getByRole('button', { name: 'Save flight' }));
  expect(await within(end).findByText('Saved to My flights.')).toBeInTheDocument();
  expect((saveTrack as jest.Mock).mock.calls[0][1]).toHaveLength(3);
  expect((saveTrack as jest.Mock).mock.calls[0][1][0]).toEqual({ lat: 59.59, lon: 16.7, altFt: 1969, at: 1_000_000 });
  fireEvent.click(within(end).getByRole('button', { name: /Download KML/ }));
  expect(downloadTrackKml).toHaveBeenCalledWith(7);
  fireEvent.click(within(end).getByRole('button', { name: 'Close navigation mode' }));
  expect(onClose).toHaveBeenCalled();
  expect(localStorage.getItem('nav.track.v1')).toBeNull();
});

test('the demo flight closes straight away: nothing to save', () => {
  const onClose = jest.fn();
  open(onClose);
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close navigation mode' }));
  expect(onClose).toHaveBeenCalled();
});
