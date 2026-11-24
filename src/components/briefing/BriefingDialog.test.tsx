import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BriefingButton from './BriefingDialog';
import type { BriefingData } from './BriefingPack';
import { fetchMapStatus, fetchPointInfo } from '../../api/backend';
import { esgg, essx, routeWeather } from '../../lib/testRoute';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});

jest.mock('../../api/backend', () => ({
  fetchPointInfo: jest.fn(),
  fetchMapStatus: jest.fn(),
  AIRSPACE_TILE_URL: '/api/map/airspace/{z}/{x}/{y}.png',
}));

const data: Omit<BriefingData, 'airportFrequencies'> = {
  routeName: 'ESSX → ESGG', aircraftName: 'PA28-161 (SE-KMI)', departure: new Date('2026-11-25T09:00:00Z'),
  trip: routeWeather(essx, esgg, 175), plan: null, altitudeFt: 4500, holds: [], tasKt: 107, powerSetting: '75%', flightMinutes: 100,
  fuel: { onBoardL: 150, tripL: 63, landingL: 87 }, wb: null, airspaces: [], swedenControl: [],
  speeds: { glide: 73, vy: 79, approach: 70, stallLanding: 44, unit: 'KIAS' },
};

beforeEach(() => {
  localStorage.clear();
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: true, minZoom: 4, maxZoom: 14 });
  (fetchPointInfo as jest.Mock).mockImplementation(async (lat: number) => ({
    lat, lon: 0, airspaces: [],
    airports: [{ code: lat > 59 ? 'ESSX' : 'ESGG', name: '', lat, lon: 0, distanceNm: 0,
      frequencies: [{ value: lat > 59 ? '118.105' : '118.505', name: lat > 59 ? 'JOHANNISBERG RADIO' : 'LANDVETTER TOWER', kind: lat > 59 ? 'RADIO' : 'TWR', primary: true, source: null }] }],
  }));
  window.print = jest.fn();
});
afterEach(() => document.body.classList.remove('print-briefing'));

it('prints the sections chosen, with the frequencies looked up and the generic checklist', async () => {
  render(<BriefingButton data={data}/>);
  fireEvent.click(screen.getByRole('button', { name: /Briefing pack/ }));
  const dialog = screen.getByRole('dialog', { name: 'Print a briefing pack' });
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /Weather briefing/ }));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: /Maps/ }));
  const print = within(dialog).getByRole('button', { name: /Print|Looking up/ });
  await waitFor(() => expect(print).toBeEnabled());
  fireEvent.click(print);

  const pack = await screen.findByRole('article', { name: 'Briefing pack' });
  expect(document.body).toHaveClass('print-briefing');
  await waitFor(() => expect(window.print).toHaveBeenCalled());
  expect(pack).toHaveTextContent('Flight briefing: ESSX → ESGG');
  expect(within(pack).getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  expect(within(pack).queryByRole('heading', { name: 'Weather briefing' })).toBeNull();
  expect(pack).toHaveTextContent('118.505 LANDVETTER TOWER');
  expect(pack).toHaveTextContent('118.105 JOHANNISBERG RADIO');
  expect(pack).toHaveTextContent('AVIATE, NAVIGATE, COMMUNICATE');
  expect(pack).toHaveTextContent('Best glide 73 kt');
  expect(pack).toHaveTextContent(/Generic single-engine piston checklist, not specific to PA28-161 \(SE-KMI\)/);
  expect(localStorage.getItem('briefingSectionsOff')).toBe(JSON.stringify(['maps', 'weather']));

  fireEvent(window, new Event('afterprint'));
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Briefing pack' })).toBeNull());
  expect(document.body).not.toHaveClass('print-briefing');
});

it('without a route there is nothing to brief', () => {
  render(<BriefingButton data={null}/>);
  expect(screen.getByRole('button', { name: /Briefing pack/ })).toBeDisabled();
});

it('a pack with only the weather has its reports, decoded', async () => {
  localStorage.setItem('briefingSectionsOff', JSON.stringify(['overview', 'maps', 'frequencies', 'emergency']));
  render(<BriefingButton data={data}/>);
  fireEvent.click(screen.getByRole('button', { name: /Briefing pack/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Print' }));
  const pack = await screen.findByRole('article', { name: 'Briefing pack' });
  expect(within(pack).getByRole('heading', { name: 'Weather briefing' })).toBeInTheDocument();
  expect(pack).toHaveTextContent('METAR ESOW 081720Z');
  expect(pack).toHaveTextContent('Wind from 250° at 12 kt');
  expect(within(pack).queryByRole('heading', { name: 'Emergency checklist' })).toBeNull();
});

it('with maps it prints the route, departure and arrival areas once their tiles are in', async () => {
  localStorage.setItem('briefingSectionsOff', JSON.stringify(['overview', 'weather', 'frequencies', 'emergency']));
  render(<BriefingButton data={data}/>);
  fireEvent.click(screen.getByRole('button', { name: /Briefing pack/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Print' }));
  expect(screen.getByRole('status')).toHaveTextContent('Preparing the briefing pack');
  const route = await screen.findByRole('img', { name: 'Map: Route' });
  expect(screen.getByRole('img', { name: 'Map: Departure: ESSX' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Map: Arrival: ESGG' })).toBeInTheDocument();
  await waitFor(() => expect(route.querySelector('img[src*="/api/map/airspace/"]')).not.toBeNull());
  expect(screen.getByText(/OpenStreetMap contributors; airspace © openAIP/)).toBeInTheDocument();

  // jsdom never loads the tiles: printing waits for them.
  await new Promise(r => setTimeout(r, 400));
  expect(window.print).not.toHaveBeenCalled();
  document.querySelectorAll('[data-map-ready]').forEach(m => m.setAttribute('data-map-ready', 'true'));
  await waitFor(() => expect(window.print).toHaveBeenCalled());
});

it('a choice saved before there were maps keeps its sections and adds the maps', () => {
  localStorage.setItem('briefingSections', JSON.stringify(['overview', 'emergency']));
  render(<BriefingButton data={data}/>);
  fireEvent.click(screen.getByRole('button', { name: /Briefing pack/ }));
  expect(screen.getByRole('checkbox', { name: /Overview/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Maps/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Weather briefing/ })).not.toBeChecked();
});
