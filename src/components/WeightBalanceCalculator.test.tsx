import React, { Profiler } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeightBalanceCalculator from './WeightBalanceCalculator';
import { fetchAirframes, fetchGenericTypes, fetchRouteWeather } from '../api/backend';
import { esgg, essx, routeWeather } from '../lib/testRoute';
import { allBuiltinViews, genericFromBuiltin, viewFromBuiltin } from '../lib/testViews';

jest.mock('../api/backend', () => ({
  fetchAirframes: jest.fn(), fetchGenericTypes: jest.fn(), fetchClubs: jest.fn(), saveClubSelection: jest.fn(),
  fetchRouteWeather: jest.fn(), nearestAirports: jest.fn(), searchAirports: jest.fn(),
}));
const mockedRoute = fetchRouteWeather as jest.MockedFunction<typeof fetchRouteWeather>;
jest.mock('./CGEnvelopeVisualization', () => () => <div data-testid="envelope" />);
let mockUser: { id: number; email: string; displayName: string } | null = null;
jest.mock('../api/useAuth', () => ({ useAuth: () => ({ user: mockUser, signOutReason: null }) }));
const mockedFetch = fetchAirframes as jest.MockedFunction<typeof fetchAirframes>;
const mockedGenerics = fetchGenericTypes as jest.MockedFunction<typeof fetchGenericTypes>;
const pilot = { id: 7, email: 'p@example.com', displayName: 'Pilot' };

beforeAll(() => {
  // Radix and Recharts measure elements; jsdom has no ResizeObserver.
  global.ResizeObserver = class {
    observe() { /* no-op */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('disclaimerAccepted', 'true');
  mockedFetch.mockReset();
  mockedGenerics.mockReset();
  mockedGenerics.mockResolvedValue([genericFromBuiltin('PA28-161 (SE-KMI)')]);
  mockedRoute.mockReset();
  mockedRoute.mockImplementation(async (from, to) => (from === to ? routeWeather(essx, essx, 0) : routeWeather(essx, esgg, 175)));
  mockUser = null;
});

const emptyWeightShown = () =>
  screen.getByText(/^Empty weight( \(yours\))?$/, { selector: 'dt' }).parentElement?.textContent?.replace(/\s+/g, ' ');

it('selects an aircraft that was just added once the database list loads', async () => {
  const added = viewFromBuiltin('PA18-150 (SE-GCG)', {
    registration: 'SE-CUB', owned: true, basicEmptyWeight: 455, weighedOn: '2026-05-04',
  });
  added.spec.code = 'PA-18'; // a code the old name-based seat rule would not have recognised
  mockUser = pilot;
  mockedFetch.mockResolvedValue([...allBuiltinViews(), added]);

  render(<WeightBalanceCalculator preferredRegistration="SE-CUB" />);

  await waitFor(() => expect(emptyWeightShown()).toContain('455 kg'));
  expect(screen.getByText(/weighing of/)).toBeInTheDocument();
  // Tandem seating from the stations: front and back seat only, no rear row.
  expect(screen.queryByText(/Rear Left/i)).not.toBeInTheDocument();
  expect(screen.getAllByText(/Back/i).length).toBeGreaterThan(0);
});

it('flags aircraft whose values are AI-suggested', async () => {
  const ai = viewFromBuiltin('TB9 (F-GKVK)', { registration: 'F-NEWX', owned: true, typeStatus: 'AI_SUGGESTED' });
  mockUser = pilot;
  mockedFetch.mockResolvedValue([...allBuiltinViews(), ai]);
  render(<WeightBalanceCalculator preferredRegistration="F-NEWX" />);
  expect(await screen.findByText(/AI-suggested type values/)).toBeInTheDocument();
});

it('keeps working on the built-in generic aircraft when the database is unreachable', async () => {
  mockedGenerics.mockRejectedValue(new Error('offline'));
  render(<WeightBalanceCalculator />);
  expect(await screen.findByText(/Offline: using the built-in generic aircraft/)).toBeInTheDocument();
  expect(emptyWeightShown()).toContain('682.4 kg'); // default: generic PA28-161, typical values
});

it('signed out: a generic aircraft takes the pilot\'s own empty weight, remembered per model', async () => {
  render(<WeightBalanceCalculator />);
  await waitFor(() => expect(mockedGenerics).toHaveBeenCalled());
  expect(mockedFetch).not.toHaveBeenCalled();
  expect(screen.getByText(/typical values for the model, not your aircraft/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Sign in to show your club/ })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Empty weight (kg)'), { target: { value: '701.5' } });
  await waitFor(() => expect(emptyWeightShown()).toContain('701.5 kg'));
  expect(JSON.parse(localStorage.getItem('genericEmptyWeights.v1') ?? '{}')['PA28-161 (generic)'])
    .toEqual({ weight: 701.5, arm: 2.13 });

  fireEvent.change(screen.getByLabelText('Empty weight (kg)'), { target: { value: '' } });
  expect(await screen.findByText(/Enter both values/)).toBeInTheDocument();
  expect(emptyWeightShown()).toContain('682.4 kg'); // a cleared field falls back to typical, not 0
});

it('settles after rendering instead of re-rendering endlessly', async () => {
  mockUser = pilot;
  mockedFetch.mockResolvedValue(allBuiltinViews());
  let commits = 0;
  render(<Profiler id="calc" onRender={() => { commits += 1; }}><WeightBalanceCalculator /></Profiler>);
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });
  const settled = commits;
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });
  expect(commits).toBe(settled); // nothing re-renders without input
  expect(settled).toBeLessThan(15);
});

it('signed in: the generic aircraft can be hidden, and the list searched by registration', async () => {
  mockUser = pilot;
  mockedFetch.mockResolvedValue([
    viewFromBuiltin('PA28-161 (SE-KMI)', { club: { id: 1, name: 'Västerås Flygklubb' } }),
    viewFromBuiltin('DA40D (SE-MBC)', { club: { id: 2, name: 'Hässlö Flygförening' } }),
  ]);
  render(<WeightBalanceCalculator />);
  const toggle = await screen.findByLabelText('Show generic aircraft');

  fireEvent.click(toggle); // hide generic
  await waitFor(() => expect(screen.queryByText(/typical values for the model/)).not.toBeInTheDocument());
  expect(localStorage.getItem('hideGenericAircraft.v1.7')).toBe('true');

  const user = userEvent.setup();
  const picker = screen.getByRole('combobox', { name: 'Aircraft' });
  await user.click(picker);
  await user.keyboard('{Control>}a{/Control}mbc');
  const option = await screen.findByRole('option', { name: /SE-MBC/ });
  expect(screen.queryByRole('option', { name: /SE-KMI/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /generic/i })).not.toBeInTheDocument();
  await user.click(option);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'SE-MBC' })).toBeInTheDocument());
});

it('a club aircraft starts from the club\'s home airfield', async () => {
  mockUser = pilot;
  mockedFetch.mockResolvedValue([
    viewFromBuiltin('PA28-161 (SE-KMI)', { club: { id: 1, name: 'Västerås Flygklubb', homeAirport: 'ESSX' } }),
  ]);
  localStorage.setItem('hideGenericAircraft.v1.7', 'true');
  render(<WeightBalanceCalculator />);
  await waitFor(() => expect(mockedRoute).toHaveBeenCalledWith('ESSX', 'ESSX', []));
  expect(await screen.findByText(/Västerås Flygklubb's home airfield/)).toBeInTheDocument();
  expect(await screen.findByText(/Local flight from/)).toBeInTheDocument();
});

it('a trip sets the flight time from distance and cruise speed and shows the fuel at landing', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESGG', auto: false }));
  render(<WeightBalanceCalculator />);
  // PA28-161 at 75%: 107 kt -> 175 NM takes 98 min, rounded up to 1:40.
  expect(await screen.findByText(/From the route: 175 NM at 107 kt/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('1:40')).toBeInTheDocument();
  expect(screen.getByText(/ESSX → ESGG · 175 NM · 1:40 at 75%/)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Fuel at landing/ })).toBeInTheDocument();
  // 128 L - 4.2 taxi - 37.9 L/h * 100 min = 60.6 L, above the 22.1 L reserve
  expect(screen.getByText(/At landing 60.6 L/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '10 minutes longer' }));
  expect(screen.getByDisplayValue('1:50')).toBeInTheDocument();
  expect(await screen.findByText(/Set by you/)).toBeInTheDocument();
});

it('a route with a waypoint asks for weather via it and counts all legs', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESGG', via: ['ESCF'], auto: false }));
  mockedRoute.mockResolvedValue({
    ...routeWeather(essx, esgg, 200),
    waypoints: [{ ...esgg, code: 'ESCF', name: 'Malmen', runways: [] }],
    legs: [
      { from: 'ESSX', to: 'ESCF', distanceNm: 80, trueCourseDeg: 200 },
      { from: 'ESCF', to: 'ESGG', distanceNm: 120, trueCourseDeg: 250 },
    ],
  });
  render(<WeightBalanceCalculator />);
  await waitFor(() => expect(mockedRoute).toHaveBeenCalledWith('ESSX', 'ESGG', ['ESCF']));
  expect(await screen.findByText(/From the route: 200 NM at 107 kt, no wind, 2 legs/)).toBeInTheDocument();
  expect(screen.getByText(/ESSX → ESCF: 80 NM, 200° true/)).toBeInTheDocument();
  expect(screen.getByLabelText('Waypoint 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove waypoint 1' }));
  await waitFor(() => expect(mockedRoute).toHaveBeenLastCalledWith('ESSX', 'ESGG', []));
});
