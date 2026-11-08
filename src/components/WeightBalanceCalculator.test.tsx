import React, { Profiler } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeightBalanceCalculator from './WeightBalanceCalculator';
import { fetchAirframes, fetchGenericTypes } from '../api/backend';
import { allBuiltinViews, genericFromBuiltin, viewFromBuiltin } from '../lib/testViews';

jest.mock('../api/backend', () => ({
  fetchAirframes: jest.fn(), fetchGenericTypes: jest.fn(), fetchClubs: jest.fn(), saveClubSelection: jest.fn(),
}));
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
