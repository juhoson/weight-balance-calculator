import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchMapStatus, fetchPointInfo } from '../../api/backend';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: RouteMap, resetMapStatus } = require('./RouteMap') as typeof import('./RouteMap');

jest.mock('../../api/backend', () => ({
  fetchMapStatus: jest.fn(),
  fetchPointInfo: jest.fn(),
  AIRSPACE_TILE_URL: '/api/map/airspace/{z}/{x}/{y}.png',
}));

const route = [
  { code: 'ESOW', name: 'Västerås', lat: 59.5894, lon: 16.6336 },
  { code: 'ESSB', name: 'Bromma', lat: 59.3544, lon: 17.9417 },
];

beforeEach(() => {
  resetMapStatus();
  (fetchMapStatus as jest.Mock).mockReset();
});

test('draws the route, labels the airports and credits openAIP', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: true, minZoom: 4, maxZoom: 14 });
  const { container } = render(<RouteMap airports={route}/>);
  expect(await screen.findByText(/Airspace from openAIP/)).toBeInTheDocument();
  await waitFor(() => expect(container.querySelectorAll('.route-map-label')).toHaveLength(2));
  expect(screen.getByText('ESOW')).toBeInTheDocument();
  expect(container.querySelector('img[src*="/api/map/airspace/"]')).not.toBeNull();
  expect(container.querySelector('.leaflet-control-attribution')?.textContent).toMatch(/openAIP/);
});

test('without the overlay it says so and shows the route only', async () => {
  (fetchMapStatus as jest.Mock).mockRejectedValue(new Error('down'));
  const { container } = render(<RouteMap airports={route}/>);
  expect(await screen.findByText(/Airspace is not available/)).toBeInTheDocument();
  await waitFor(() => expect(container.querySelectorAll('.route-map-label')).toHaveLength(2));
  expect(container.querySelector('img[src*="/api/map/airspace/"]')).toBeNull();
});

test('a tap on the map shows the airspace and frequencies there', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: true, minZoom: 4, maxZoom: 14 });
  (fetchPointInfo as jest.Mock).mockResolvedValue({
    lat: 59.6, lon: 16.6, airports: [],
    airspaces: [{ id: 'c', name: 'VÄSTERÅS CTR', type: 'CTR', icaoClass: 'C', activation: null, polygon: [],
      lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' },
      frequencies: [{ value: '130.605', name: 'VÄSTERÅS TOWER', kind: 'TWR', primary: true, source: 'ESOW' }] }],
  });
  const { container } = render(<RouteMap airports={route}/>);
  await screen.findByText(/Tap the map for the airspace and frequencies there/);
  const mapEl = container.querySelector('.route-map') as HTMLElement;
  fireEvent.click(mapEl, { clientX: 50, clientY: 50 });
  expect(await screen.findByText(/130\.605 VÄSTERÅS TOWER/)).toBeInTheDocument();
  expect(fetchPointInfo).toHaveBeenCalledTimes(1);
});
