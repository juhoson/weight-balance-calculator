import React, { Profiler } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '../test/setupUser';
import WeightBalanceCalculator from './WeightBalanceCalculator';
import { fetchAirframes, fetchAirspacesAlong, fetchGenericTypes, fetchRouteWeather, fetchSharedRoute } from '../api/backend';
import { forecastAlongRoute } from '../lib/openMeteo';
import { esgg, essx, routeWeather } from '../lib/testRoute';
import { clearAirspaceCache } from '../lib/useAirspaces';
import { allBuiltinViews, genericFromBuiltin, viewFromBuiltin } from '../lib/testViews';

jest.mock('../api/backend', () => ({
  fetchAirframes: jest.fn(), fetchGenericTypes: jest.fn(), fetchClubs: jest.fn(), saveClubSelection: jest.fn(),
  fetchRouteWeather: jest.fn(), nearestAirports: jest.fn(), searchAirports: jest.fn(), fetchAirspacesAlong: jest.fn(), fetchSharedRoute: jest.fn(),
  ApiError: jest.requireActual('../api/backend').ApiError,
}));
jest.mock('../lib/openMeteo', () => ({ ...jest.requireActual('../lib/openMeteo'), forecastAlongRoute: jest.fn() }));
const mockedRoute = fetchRouteWeather as jest.MockedFunction<typeof fetchRouteWeather>;
const mockedWinds = forecastAlongRoute as jest.MockedFunction<typeof forecastAlongRoute>;
/** The airport codes and altitude of the last forecast asked for. */
const forecastCalls = () => mockedWinds.mock.calls.map(([route, altitudeFt, departure]) => [route.map(p => p.code), altitudeFt, departure]);
const lastForecast = () => { const [route, altitudeFt, departure] = mockedWinds.mock.calls[mockedWinds.mock.calls.length - 1]; return [route.map(p => p.code), altitudeFt, departure]; };
jest.mock('./route/RouteMap', () => ({ airports }: { airports: Array<{ code: string }> }) => (
  <div data-testid="route-map">{airports.map(a => a.code).join(' ')}</div>
));
jest.mock('./CGEnvelopeVisualization', () => () => <div data-testid="envelope" />);
let mockUser: { id: number; email: string; displayName: string } | null = null;
jest.mock('../api/useAuth', () => ({ useAuth: () => ({ user: mockUser, signOutReason: null }) }));
const mockedAirspaces = fetchAirspacesAlong as jest.MockedFunction<typeof fetchAirspacesAlong>;
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
  mockedWinds.mockImplementation(async (_route, altitudeFt) => ({ available: false, altitudeFt, times: [], segments: [] }));
  mockedAirspaces.mockReset();
  mockedAirspaces.mockResolvedValue([]);
  clearAirspaceCache();
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

  const user = setupUser();
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

  const user = setupUser();
  const pick = async (text: string, reg: RegExp) => {
    await user.click(await screen.findByRole('combobox', { name: 'Aircraft' }));
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
  const user = setupUser();
  await user.click(await screen.findByRole('combobox', { name: 'Aircraft' }));
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

it('times a trip segment by segment in the forecast wind at the cruise altitude', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESGG', auto: false }));
  const first = new Date();
  first.setMinutes(0, 0, 0);
  const times = Array.from({ length: 12 }, (_, h) => new Date(first.getTime() + h * 3600_000).toISOString());
  const each = <T,>(v: T) => times.map(() => v);
  mockedWinds.mockImplementation(async (_route, altitudeFt) => ({
    available: true, altitudeFt, times,
    // 175 NM in 7 segments; a 20 kt headwind on the 231° course at 3,000 ft, 30 kt higher up.
    segments: Array.from({ length: 7 }, (_, k) => ({
      leg: 0, startNm: k * 25, distanceNm: 25, trueCourseDeg: 231, lat: 59 - k * 0.25, lon: 16 - k * 0.6, groundFt: 300,
      windDirTrue: each(231), windKt: each(altitudeFt > 3000 ? 30 : 20), tempC: each(-4),
      cloudBaseFt: each(k === 3 ? 2900 : null), freezingLevelFt: each(800),
      layers: each([{ heightFt: 1000, cloudCover: 10 }, { heightFt: 3500, cloudCover: k === 3 ? 80 : 20 }]),
    })),
  }));
  render(<WeightBalanceCalculator />);
  // PA28-161 at 75%: 107 kt - 20 kt = 87 kt -> 175 NM in 120.7 min. The climb from ESSX (33 ft) at
  // Vy 79 kt (81 kt true) and 500 ft/min takes 5.9 min at 61 kt over the ground: +1.7 min -> 2:05.
  expect(await screen.findByText(/in the forecast wind at 3,000 ft, climbing at 79 kt and 500 ft\/min, average groundspeed 86 kt/)).toBeInTheDocument();
  expect(screen.getByText(/Top of climb/).parentElement).toHaveTextContent(/Top of climb 6 NM out, .* \(0:06 climbing\)/);
  // Descent at cruise speed from 3,000 ft to ESGG's circuit altitude (506 + 1,000 ft): 3 min.
  expect(screen.getByText(/Top of climb/).parentElement).toHaveTextContent(/Top of descent 171 NM out, .* \(0:03 to circuit altitude, 1,506 ft\)/);
  expect(screen.getByDisplayValue('2:05')).toBeInTheDocument();
  // The cruise altitude, then every altitude up to FL100 for the suggestions (from the cache).
  expect(forecastCalls()[0]).toEqual([['ESSX', 'ESGG'], 3000, null]);
  await waitFor(() => expect(lastForecast()).toEqual([['ESSX', 'ESGG'], 10000, null]));
  expect(screen.getByRole('region', { name: 'Suggested cruise altitudes' })).toBeInTheDocument();
  const log = screen.getByRole('table', { name: 'Nav log' });
  expect(log).toHaveTextContent(/ESSX → ESGG · 175 NM · 2:02 · var \d°E/);
  expect(screen.getAllByText('231/20')).toHaveLength(7);
  expect(screen.getByRole('img', { name: /Route profile, 175 NM at 3000 ft/ })).toBeInTheDocument();
  // Cloud base 2,900 ft on one segment: the cruise is in it, above the freezing level.
  expect(screen.getByText(/Cloud base forecast below or less than 500 ft above your cruise altitude \(3,000 ft\) on 1 of 7 segments \(lowest ≈ 2,900 ft\)/)).toBeInTheDocument();
  expect(screen.getByText(/Icing possible/)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Cruise altitude'), { target: { value: '5500' } });
  await waitFor(() => expect(lastForecast()).toEqual([['ESSX', 'ESGG'], 5500, null]));
  // Faster higher up: 111 kt true at 5,500 ft (107 kt at 3,000 ft, +1.5% per 1,000 ft) - 30 kt = 81 kt
  // -> 130 min, +4 min for the longer climb -> 2:15 (at the book 107 kt it would be 2:20).
  expect(await screen.findByDisplayValue('2:15')).toBeInTheDocument();
  expect(screen.getByText(/NM at 111 kt true airspeed in the forecast wind at 5,500 ft/)).toBeInTheDocument();
  expect(localStorage.getItem('cruiseAltitudeFt')).toBe('5500');
});

it('does not ask for the en-route forecast when the fuel does not cover the trip', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESGG', auto: false }));
  render(<WeightBalanceCalculator />);
  await screen.findByText(/From the route: 175 NM/);
  fireEvent.change(screen.getByLabelText('Fuel amount'), { target: { value: '40' } });
  expect(await screen.findByText(/Not enough fuel for this route even without wind/)).toBeInTheDocument();
  // Past the forecast's debounce, inside act: the calculator updates meanwhile.
  await act(() => new Promise(r => setTimeout(r, 900)));
  expect(mockedWinds).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Fuel amount'), { target: { value: '150' } });
  await waitFor(() => expect(mockedWinds).toHaveBeenCalledTimes(1));
});

it('lists the airspace the planned path enters, and the ones it passes over', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESGG', auto: false }));
  const box = (lon0: number, lat0: number, lon1: number, lat1: number): Array<[number, number]> =>
    [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]];
  mockedAirspaces.mockResolvedValue([
    { id: 'tma', name: 'TEST TMA', type: 'TMA', icaoClass: 'C', activation: null, polygon: box(14.0, 58.3, 14.8, 58.9),
      frequencies: [{ value: '126.405', name: 'TEST APPROACH', kind: 'APP', primary: true, source: 'ESXX' }],
      lower: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' }, upper: { ft: 9500, datum: 'STD', label: 'FL95' } },
    { id: 'd', name: 'ES D 99', type: 'D', icaoClass: null, activation: 'NOTAM', polygon: box(15.0, 58.8, 15.3, 59.1), frequencies: [],
      lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 1000, datum: 'GND', label: '1,000 ft AGL' } },
    { id: 'far', name: 'FAR CTR', type: 'CTR', icaoClass: 'D', activation: null, polygon: box(20, 65, 21, 66), frequencies: [],
      lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 2500, datum: 'MSL', label: '2,500 ft MSL' } },
  ]);
  render(<WeightBalanceCalculator />);
  const panel = await screen.findByRole('region', { name: 'Airspace along the route' });
  await waitFor(() => expect(panel).toHaveTextContent(/Enters 1 airspace, 1 needing a clearance\./));
  // No forecast here: the still-air climb to 3,000 ft.
  expect(panel).toHaveTextContent(/Altitudes for the planned path to 3,000 ft \(500 ft\/min up, 500 ft\/min down, no wind\)/);
  expect(panel).toHaveTextContent(/TEST TMA/);
  expect(panel).toHaveTextContent(/Terminal area \(class C\)/);
  expect(panel).toHaveTextContent(/1,500 ft MSL – FL95 · you 3,000 ft/);
  expect(panel).toHaveTextContent(/Inside\. Clearance needed\./);
  expect(panel).toHaveTextContent(/126\.405 TEST APPROACH \(from ESXX\)/);
  // The danger area tops out at 1,000 ft AGL (taken over ESGG, 506 ft): passed over with room to spare.
  expect(screen.getByText('Over or under 1 more')).toBeInTheDocument();
  expect(panel).toHaveTextContent(/ES D 99 \(GND – 1,000 ft AGL\) · over it/);
  expect(panel).not.toHaveTextContent(/FAR CTR/);
  expect(mockedAirspaces).toHaveBeenCalledWith([{ lat: essx.lat, lon: essx.lon }, { lat: esgg.lat, lon: esgg.lon }]);

  // A long list can be hidden; the summary stays, and the choice is remembered.
  fireEvent.click(screen.getByRole('button', { name: 'Hide list' }));
  expect(panel).not.toHaveTextContent(/TEST TMA/);
  expect(panel).toHaveTextContent(/Enters 1 airspace/);
  expect(localStorage.getItem('airspaceList.hidden')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Show list' }));
  expect(panel).toHaveTextContent(/TEST TMA/);

  // At 1,000 ft: under the TMA's floor, but into the danger area.
  fireEvent.change(screen.getByLabelText('Cruise altitude'), { target: { value: '1000' } });
  await waitFor(() => expect(panel).toHaveTextContent(/Enters 1 airspace, 1 restricted, danger or prohibited\./));
  expect(panel).toHaveTextContent(/ES D 99Danger area.*Inside\. Check whether it is active\. Active by NOTAM\./);
  expect(panel).toHaveTextContent(/TEST TMA \(1,500 ft MSL – FL95\) · under it/);
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
  expect(await screen.findByText(/From the route: 200 NM at 107 kt true airspeed, no wind, 2 legs/)).toBeInTheDocument();
  expect(screen.getByText(/ESSX → ESCF: 80 NM, 200° true/)).toBeInTheDocument();
  expect(screen.getByLabelText('Waypoint 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove waypoint 1' }));
  await waitFor(() => expect(mockedRoute).toHaveBeenLastCalledWith('ESSX', 'ESGG', []));
});

it('an aircraft with two baggage areas takes both, each at its own arm, within the joint limit', async () => {
  const generic = genericFromBuiltin('PA28-161 (SE-KMI)');
  generic.spec.stations.baggage2 = { arm: 3.5, maxWeight: 20 };
  generic.spec.maxBaggageTotal = 40;
  mockedGenerics.mockResolvedValue([generic]);
  render(<WeightBalanceCalculator />);
  const area2 = await screen.findByLabelText(/Baggage area 2/);
  const area1 = screen.getByLabelText(/Baggage area 1/);
  expect(screen.getByText('Both areas together at most 40 kg.')).toBeInTheDocument();

  const cgBefore = screen.getAllByText(/CG [\d.]+ m/)[0].textContent;
  fireEvent.change(area2, { target: { value: '15' } });
  // 15 kg at 3.5 m, aft of everything else: the CG moves aft.
  await waitFor(() => expect(screen.getAllByText(/CG [\d.]+ m/)[0].textContent).not.toBe(cgBefore));
  fireEvent.change(area1, { target: { value: '30' } });
  expect(await screen.findByText('Both areas together: 45 kg, above the 40 kg joint limit.')).toBeInTheDocument();
  // Over a baggage limit is outside limits, not just a note under the field.
  expect(screen.getByText('Baggage 45 kg in both areas is over the 40 kg joint limit.')).toBeInTheDocument();
  expect(screen.getAllByText('Outside limits').length).toBeGreaterThan(0);
  fireEvent.change(area2, { target: { value: '25' } });
  expect(screen.getByText('Above the 20 kg limit for this area.')).toBeInTheDocument();
});

it('a generic type without typical values waits for the pilot\'s own empty weight', async () => {
  mockedGenerics.mockResolvedValue([genericFromBuiltin('PA28-161 (SE-KMI)', { typicalEmptyWeight: null, typicalEmptyArm: null })]);
  render(<WeightBalanceCalculator />);
  expect(await screen.findByText(/The POH gives no typical empty weight for this model/)).toBeInTheDocument();
  expect(screen.getByText(/Enter your aircraft's empty weight and arm from its weighing report/)).toBeInTheDocument();
  expect(screen.queryByText('Within limits', { selector: 'span' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use typical values' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Empty weight (kg)'), { target: { value: '690' } });
  fireEvent.change(screen.getByLabelText('Empty arm (m)'), { target: { value: '2.15' } });
  expect((await screen.findAllByText('Within limits', { selector: 'span' })).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Enter your aircraft's empty weight and arm from its weighing report/)).not.toBeInTheDocument();
});

it('enforces a max landing weight below the MTOW and a max zero-fuel weight', async () => {
  const generic = genericFromBuiltin('PA28-161 (SE-KMI)');
  // Typical PA28-161: 682.4 kg empty + 85 kg pilot + 128 L fuel (92.2 kg) = 859.6 kg at takeoff.
  generic.spec.maxLandingWeight = 800;
  generic.spec.maxZeroFuelWeight = 750;
  mockedGenerics.mockResolvedValue([generic]);
  render(<WeightBalanceCalculator />);
  expect(await screen.findByText(/over the 800 kg max landing weight/)).toBeInTheDocument();
  // Zero-fuel weight: 682.4 + 85 = 767.4 kg.
  expect(screen.getByText('Zero-fuel weight 767.4 kg is over the 750 kg limit.')).toBeInTheDocument();
  expect(screen.getAllByText('Outside limits').length).toBeGreaterThan(0);
});

it('a side-by-side two-seater shows two seats and ignores rear-seat weights from another aircraft', async () => {
  const user = setupUser();
  const twoSeater = genericFromBuiltin('PA28-161 (SE-KMI)');
  twoSeater.spec.code = 'C152';
  twoSeater.spec.name = 'Cessna 152';
  delete twoSeater.spec.stations.passengerRear;
  mockedGenerics.mockResolvedValue([genericFromBuiltin('PA28-161 (SE-KMI)'), twoSeater]);
  render(<WeightBalanceCalculator />);
  // On the four-seater, someone in the back.
  await user.click(await screen.findByRole('button', { name: /Rear Left/ }));
  await user.type(screen.getByRole('dialog').querySelector('input') as HTMLInputElement, '90{Enter}');
  const takeoffWith = () => screen.getByText(/^Takeoff [\d.]+ kg/).textContent;
  await waitFor(() => expect(takeoffWith()).toContain('950 kg'));

  await user.click(screen.getByRole('combobox', { name: 'Aircraft' }));
  await user.click(await screen.findByRole('option', { name: /Cessna 152/ }));
  expect(await screen.findByRole('button', { name: /Passenger/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Rear Left/ })).not.toBeInTheDocument();
  // The 90 kg in the old rear seat no longer counts.
  await waitFor(() => expect(takeoffWith()).toContain('860 kg'));
});

it('a second tank counts at its own arm, and the landing is checked whichever tank is used first', async () => {
  const twoTanks = genericFromBuiltin('PA28-161 (SE-KMI)');
  // A simple envelope so the numbers below are easy to follow: 2.11-2.36 m, 700-1055 kg.
  const box = [[2.11, 700], [2.11, 1055], [2.36, 1055], [2.36, 700], [2.11, 700]].map(([cg, weight]) => ({ cg, weight }));
  twoTanks.spec.envelope = { points: box, limits: { maxWeight: 1055, minWeight: 700, forwardCG: 2.11, aftCG: 2.36 } };
  twoTanks.spec.stations.fuel = { ...twoTanks.spec.stations.fuel, label: 'Main tank' };
  twoTanks.spec.stations.fuel2 = { arm: 0.10, maxLiters: 80, standardLiters: 0, weightPerLiter: 0.72, label: 'Wing tanks' };
  // Like the DR400/180: no 55% row.
  twoTanks.spec.performance.fuelConsumption = twoTanks.spec.performance.fuelConsumption.filter(f => f.powerSetting !== '55%');
  mockedGenerics.mockResolvedValue([twoTanks]);
  render(<WeightBalanceCalculator />);

  const wing = await screen.findByLabelText(/Wing tanks/);
  expect(wing).toHaveValue(null); // empty by default, like the DR400's
  expect(screen.getByText('Main tank')).toBeInTheDocument();
  fireEvent.change(wing, { target: { value: '20' } });
  // Takeoff: 682.4 empty + 85 pilot + 128 L (92.16 kg) main + 20 L (14.4 kg) wing = 873.96 kg at 2.118 m.
  await waitFor(() => expect(screen.getAllByText(/^Takeoff 874 kg · CG 2\.118 m$/).length).toBeGreaterThan(0));
  // Landing after 42.1 L (30.31 kg): main tank first leaves the CG at 2.108 m, ahead of 2.11; wing tanks first, 2.147 m.
  expect(await screen.findByText('Outside the envelope at landing if the main tank is used first.')).toBeInTheDocument();
  expect(screen.getAllByText('Outside limits').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: 'Empty' }));
  await waitFor(() => expect(screen.queryByText(/if the main tank is used first/)).not.toBeInTheDocument());
  // No 55% row: the cruise power is one the aircraft has.
  expect(screen.getByRole('combobox', { name: 'Cruise power' })).toHaveTextContent('75%');
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

it('flies a stretch at another altitude, in that altitude\'s wind', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESGG', auto: false }));
  const first = new Date();
  first.setMinutes(0, 0, 0);
  const times = Array.from({ length: 12 }, (_, h) => new Date(first.getTime() + h * 3600_000).toISOString());
  const each = <T,>(v: T) => times.map(() => v);
  mockedWinds.mockImplementation(async (_route, altitudeFt) => ({
    available: true, altitudeFt, times,
    segments: Array.from({ length: 7 }, (_, k) => ({
      leg: 0, startNm: k * 25, distanceNm: 25, trueCourseDeg: 231, lat: 59 - k * 0.25, lon: 16 - k * 0.6, groundFt: 300,
      windDirTrue: each(231), windKt: each(altitudeFt > 3000 ? 30 : 20), tempC: each(5),
      cloudBaseFt: each(null), freezingLevelFt: each(null), layers: each([]),
    })),
  }));
  render(<WeightBalanceCalculator />);
  const changes = await screen.findByRole('region', { name: 'Altitude changes along the route' });
  expect(changes).toHaveTextContent('All of it at 3,000 ft.');
  expect(screen.getByRole('table', { name: 'Nav log' })).not.toHaveTextContent('Alt');

  // Added in the middle third (58-117 NM), 1,000 ft below the cruise.
  fireEvent.click(within(changes).getByRole('button', { name: 'Add' }));
  expect(within(changes).getByLabelText('Change 1 altitude')).toHaveValue(2000);
  fireEvent.change(within(changes).getByLabelText('Change 1 altitude'), { target: { value: '4500' } });
  // The three segments in it are flown at 4,500 ft, in the 30 kt wind there.
  await waitFor(() => expect(screen.getAllByText('231/30')).toHaveLength(3));
  const log = screen.getByRole('table', { name: 'Nav log' });
  expect(log).toHaveTextContent('Alt');
  expect(within(log).getAllByText('4,500')).toHaveLength(3);
  expect(screen.getByText(/1 altitude change, in the forecast wind/)).toBeInTheDocument();

  fireEvent.click(within(changes).getByRole('button', { name: 'Remove change 1' }));
  await waitFor(() => expect(screen.getAllByText('231/20')).toHaveLength(7));
});

it('a shared route brings its cruise altitude and altitude changes', async () => {
  localStorage.setItem('route.v1', JSON.stringify({ from: 'ESSX', to: 'ESSX', auto: false }));
  window.history.replaceState(null, '', '/?route=tok123');
  (fetchSharedRoute as jest.MockedFunction<typeof fetchSharedRoute>).mockResolvedValue({
    name: 'Under the TMA', airports: ['ESSX', 'ESGG'], sharedBy: 'Juho', cruiseAltitudeFt: 4500,
    altitudeChanges: [{ fromNm: 9, toNm: 41, ft: 2000, note: 'Under STOCKHOLM TMA' }],
  });
  const first = new Date();
  first.setMinutes(0, 0, 0);
  const times = Array.from({ length: 12 }, (_, h) => new Date(first.getTime() + h * 3600_000).toISOString());
  const each = <T,>(v: T) => times.map(() => v);
  mockedWinds.mockImplementation(async (_route, altitudeFt) => ({
    available: true, altitudeFt, times,
    segments: Array.from({ length: 7 }, (_, k) => ({
      leg: 0, startNm: k * 25, distanceNm: 25, trueCourseDeg: 231, lat: 59 - k * 0.25, lon: 16 - k * 0.6, groundFt: 300,
      windDirTrue: each(231), windKt: each(20), tempC: each(5), cloudBaseFt: each(null), freezingLevelFt: each(null), layers: each([]),
    })),
  }));
  render(<WeightBalanceCalculator />);
  fireEvent.click(await screen.findByRole('button', { name: 'Use this route' }));
  await waitFor(() => expect(screen.getByLabelText('Cruise altitude')).toHaveValue(4500));
  const changes = await screen.findByRole('region', { name: 'Altitude changes along the route' });
  expect(within(changes).getByLabelText('Change 1 altitude')).toHaveValue(2000);
  expect(within(changes).getByText('Under STOCKHOLM TMA')).toBeInTheDocument();
  window.history.replaceState(null, '', '/');
});

it('on a narrow screen, plans one step at a time: next, back, and a tap on a step', async () => {
  const user = setupUser();
  render(<WeightBalanceCalculator />);
  const steps = await screen.findByRole('navigation', { name: 'Planning steps' });
  const current = () => within(steps).getByRole('button', { current: 'step' }).textContent;
  expect(current()).toBe('Aircraft');
  // The other steps are hidden below lg; the one on screen isn't.
  expect(screen.getByRole('heading', { name: /People and baggage/ }).closest('section')).toHaveClass('max-lg:hidden');
  await user.click(screen.getByRole('button', { name: 'Next: Load' }));
  expect(current()).toBe('Load');
  expect(screen.getByRole('heading', { name: /People and baggage/ }).closest('section')).not.toHaveClass('max-lg:hidden');
  await user.click(screen.getByRole('button', { name: 'Previous step' }));
  expect(current()).toBe('Aircraft');
  await user.click(within(steps).getByRole('button', { name: 'Check' }));
  expect(current()).toBe('Check');
  expect(screen.getByRole('region', { name: 'Results' }).closest('aside')).not.toHaveClass('max-lg:hidden');
});
