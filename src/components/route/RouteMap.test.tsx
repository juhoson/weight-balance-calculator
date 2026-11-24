import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { fetchMapStatus } from '../../api/backend';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: RouteMap, resetMapStatus } = require('./RouteMap') as typeof import('./RouteMap');

jest.mock('../../api/backend', () => ({
  fetchMapStatus: jest.fn(),
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
