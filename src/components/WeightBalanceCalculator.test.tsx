import React, { Profiler } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeightBalanceCalculator from './WeightBalanceCalculator';
import { fetchAirframes, fetchGenericTypes, fetchRouteWeather, fetchWindsAloft } from '../api/backend';
import { esgg, essx, routeWeather } from '../lib/testRoute';
import { allBuiltinViews, genericFromBuiltin, viewFromBuiltin } from '../lib/testViews';

jest.mock('../api/backend', () => ({
  fetchAirframes: jest.fn(), fetchGenericTypes: jest.fn(), fetchClubs: jest.fn(), saveClubSelection: jest.fn(),
  fetchRouteWeather: jest.fn(), nearestAirports: jest.fn(), searchAirports: jest.fn(), fetchWindsAloft: jest.fn(),
}));
const mockedRoute = fetchRouteWeather as jest.MockedFunction<typeof fetchRouteWeather>;
const mockedWinds = fetchWindsAloft as jest.MockedFunction<typeof fetchWindsAloft>;
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
  mockedFetch.mockResolvedValue([]);
  mockedGenerics.mockReset();
  mockedGenerics.mockResolvedValue([genericFromBuiltin('PA28-161 (SE-KMI)')]);
  mockedRoute.mockReset();
  mockedRoute.mockImplementation(async (from, to) => (from === to ? routeWeather(essx, essx, 0) : routeWeather(essx, esgg, 175)));
  mockUser = null;
  mockedWinds.mockReset();
  mockedWinds.mockImplementation(async (_from, _to, _via, altitudeFt) => ({ available: false, altitudeFt, times: [], legs: [] }));
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
  expect(mockedFetch).toHaveBeenCalledWith(null);
  expect(screen.getByText(/typical values for the model, not your aircraft/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Sign in to choose/ })).toBeInTheDocument();

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

it('a club aircraft based away from the club starts from its own airfield', async () => {
  mockUser = pilot;
  mockedFetch.mockResolvedValue([
    viewFromBuiltin('PA28-161 (SE-KMI)', {
      registration: 'OH-WOW', homeAirport: 'ESSU', club: { id: 2, name: 'Hässlö Flygförening', homeAirport: 'ESOW' },
    }),
  ]);
  localStorage.setItem('hideGenericAircraft.v1.7', 'true');
  render(<WeightBalanceCalculator />);
  await waitFor(() => expect(mockedRoute).toHaveBeenCalledWith('ESSU', 'ESSU', []));
  expect(await screen.findByText(/OH-WOW's home airfield/)).toBeInTheDocument();
});

it('picking a club aircraft moves a remembered route to its home airfield, but keeps a trip from there', async () => {
  mockUser = pilot;
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESGG', to: 'ESMS', via: [], auto: false }));
  localStorage.setItem('hideGenericAircraft.v1.7', 'true');
  localStorage.setItem('selectedAircraft.v1', 'PA28-161 (SE-KMI)');
  mockedFetch.mockResolvedValue([
    viewFromBuiltin('PA28-161 (SE-KMI)', { club: { id: 1, name: 'Västerås Flygklubb', homeAirport: 'ESSX' } }),
    viewFromBuiltin('DA40D (SE-MBC)', { club: { id: 2, name: 'Hässlö Flygförening', homeAirport: 'ESOW' } }),
  ]);
  render(<WeightBalanceCalculator />);
  // On load the pilot's own route stays.
  await waitFor(() => expect(mockedRoute).toHaveBeenCalledWith('ESGG', 'ESMS', []));

  const user = userEvent.setup();
  const pick = async (text: string, reg: RegExp) => {
    await user.click(screen.getByRole('combobox', { name: 'Aircraft' }));
    await user.keyboard(`{Control>}a{/Control}${text}`);
    await user.click(await screen.findByRole('option', { name: reg }));
  };
  await pick('mbc', /SE-MBC/);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'SE-MBC' })).toBeInTheDocument());
  await waitFor(() => expect(mockedRoute).toHaveBeenLastCalledWith('ESOW', 'ESOW', []));
  expect(await screen.findByText(/Hässlö Flygförening's home airfield/)).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('route.v1') ?? '{}')).toMatchObject({ from: 'ESOW', to: 'ESOW', auto: true });
});

it('picking a club aircraft keeps a trip that already starts at its home airfield', async () => {
  mockUser = pilot;
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESOW', to: 'ESGG', via: [], auto: false }));
  localStorage.setItem('hideGenericAircraft.v1.7', 'true');
  localStorage.setItem('selectedAircraft.v1', 'PA28-161 (SE-KMI)');
  mockedFetch.mockResolvedValue([
    viewFromBuiltin('PA28-161 (SE-KMI)', { club: { id: 1, name: 'Västerås Flygklubb', homeAirport: 'ESSX' } }),
    viewFromBuiltin('DA40D (SE-MBC)', { club: { id: 2, name: 'Hässlö Flygförening', homeAirport: 'ESOW' } }),
  ]);
  render(<WeightBalanceCalculator />);
  await waitFor(() => expect(mockedRoute).toHaveBeenCalledWith('ESOW', 'ESGG', []));
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Aircraft' }));
  await user.keyboard('{Control>}a{/Control}mbc');
  await user.click(await screen.findByRole('option', { name: /SE-MBC/ }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'SE-MBC' })).toBeInTheDocument());
  expect(mockedRoute).not.toHaveBeenCalledWith('ESOW', 'ESOW', []);
  expect(JSON.parse(localStorage.getItem('route.v1') ?? '{}')).toMatchObject({ from: 'ESOW', to: 'ESGG' });
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

it('times a trip in the forecast wind at the cruise altitude', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESGG', auto: false }));
  const first = new Date();
  first.setMinutes(0, 0, 0);
  const times = Array.from({ length: 48 }, (_, h) => new Date(first.getTime() + h * 3600_000).toISOString());
  mockedWinds.mockImplementation(async (from, to, _via, altitudeFt) => ({
    available: true, altitudeFt, times,
    // A 20 kt headwind on the 231° course at 3,000 ft, 30 kt higher up.
    legs: [{ from, to, windDirTrue: times.map(() => 231), windKt: times.map(() => (altitudeFt > 3000 ? 30 : 20)), tempC: times.map(() => -4) }],
  }));
  render(<WeightBalanceCalculator />);
  // PA28-161 at 75%: 107 kt - 20 kt = 87 kt -> 175 NM in 121 min, rounded up to 2:05.
  expect(await screen.findByText(/in the forecast wind at 3,000 ft, average groundspeed 87 kt/)).toBeInTheDocument();
  expect(screen.getByDisplayValue('2:05')).toBeInTheDocument();
  expect(screen.getByText(/Wind 231°\/20 kt · −4 °C · head 20 kt · TH 231° \(0°\) · GS 87 kt/)).toBeInTheDocument();
  expect(mockedWinds).toHaveBeenCalledWith('ESSX', 'ESGG', [], 3000);

  fireEvent.change(screen.getByLabelText('Cruise altitude'), { target: { value: '5500' } });
  await waitFor(() => expect(mockedWinds).toHaveBeenLastCalledWith('ESSX', 'ESGG', [], 5500));
  // 77 kt -> 136 min -> 2:20
  expect(await screen.findByDisplayValue('2:20')).toBeInTheDocument();
  expect(localStorage.getItem('cruiseAltitudeFt')).toBe('5500');
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

describe('a club link (?club=)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('signed out: lists just the club\'s aircraft and plans from its airfield', async () => {
    window.history.replaceState(null, '', '/?club=VFK');
    localStorage.setItem('route.v1', JSON.stringify({ from: 'ESGG', to: 'ESMS', via: [], auto: false }));
    mockedFetch.mockResolvedValue([
      viewFromBuiltin('PA28-161 (SE-KMI)', { club: { id: 1, name: 'Västerås Flygklubb', homeAirport: 'ESSX', code: 'vfk' } }),
    ]);
    render(<WeightBalanceCalculator />);
    expect(await screen.findByText('Västerås Flygklubb', { selector: 'strong' })).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith('vfk');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'SE-KMI' })).toBeInTheDocument());
    await waitFor(() => expect(mockedRoute).toHaveBeenLastCalledWith('ESSX', 'ESSX', []));
    expect(screen.queryByLabelText('Show generic aircraft')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show all aircraft' })).toHaveAttribute('href', '/');
  });

  it('says so for an unknown club and offers the generic aircraft', async () => {
    window.history.replaceState(null, '', '/?club=nope&x=1');
    render(<WeightBalanceCalculator />);
    expect(await screen.findByText(/No club called/)).toBeInTheDocument();
    expect(screen.getByText(/typical values for the model/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Show all aircraft' })).toHaveAttribute('href', '/?x=1');
  });
});
