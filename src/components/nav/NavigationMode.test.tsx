import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { fetchAirportsAlong, fetchMapStatus } from '../../api/backend';
import type { AirportInfo, AirspaceView, RouteWeather } from '../../types/route';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: NavigationMode } = require('./NavigationMode') as typeof import('./NavigationMode');

jest.mock('../../api/backend', () => ({
  fetchMapStatus: jest.fn(),
  fetchAirportsAlong: jest.fn(),
  AIRSPACE_TILE_URL: '/api/map/airspace/{z}/{x}/{y}.png',
}));

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
