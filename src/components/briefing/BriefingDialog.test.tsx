import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BriefingButton from './BriefingDialog';
import type { BriefingData } from './BriefingPack';
import { fetchPointInfo } from '../../api/backend';
import { esgg, essx, routeWeather } from '../../lib/testRoute';

jest.mock('../../api/backend', () => ({ fetchPointInfo: jest.fn() }));

const data: Omit<BriefingData, 'airportFrequencies'> = {
  routeName: 'ESSX → ESGG', aircraftName: 'PA28-161 (SE-KMI)', departure: new Date('2026-11-25T09:00:00Z'),
  trip: routeWeather(essx, esgg, 175), plan: null, altitudeFt: 4500, holds: [], tasKt: 107, powerSetting: '75%', flightMinutes: 100,
  fuel: { onBoardL: 150, tripL: 63, landingL: 87 }, wb: null, airspaces: [], swedenControl: [],
  speeds: { glide: 73, vy: 79, approach: 70, stallLanding: 44, unit: 'KIAS' },
};

beforeEach(() => {
  localStorage.clear();
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
  expect(localStorage.getItem('briefingSections')).toBe(JSON.stringify(['overview', 'frequencies', 'emergency']));

  fireEvent(window, new Event('afterprint'));
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Briefing pack' })).toBeNull());
  expect(document.body).not.toHaveClass('print-briefing');
});

it('without a route there is nothing to brief', () => {
  render(<BriefingButton data={null}/>);
  expect(screen.getByRole('button', { name: /Briefing pack/ })).toBeDisabled();
});

it('a pack with only the weather has its reports, decoded', async () => {
  localStorage.setItem('briefingSections', JSON.stringify(['weather']));
  render(<BriefingButton data={data}/>);
  fireEvent.click(screen.getByRole('button', { name: /Briefing pack/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Print' }));
  const pack = await screen.findByRole('article', { name: 'Briefing pack' });
  expect(within(pack).getByRole('heading', { name: 'Weather briefing' })).toBeInTheDocument();
  expect(pack).toHaveTextContent('METAR ESOW 081720Z');
  expect(pack).toHaveTextContent('Wind from 250° at 12 kt');
  expect(within(pack).queryByRole('heading', { name: 'Emergency checklist' })).toBeNull();
});
