import React, { Profiler } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import WeightBalanceCalculator from './WeightBalanceCalculator';
import { fetchAirframes } from '../api/backend';
import { allBuiltinViews, viewFromBuiltin } from '../lib/testViews';

jest.mock('../api/backend', () => ({ fetchAirframes: jest.fn() }));
jest.mock('./CGEnvelopeVisualization', () => () => <div data-testid="envelope" />);
const mockedFetch = fetchAirframes as jest.MockedFunction<typeof fetchAirframes>;

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
});

const emptyWeightShown = () =>
  screen.getByText('Empty Weight:').parentElement?.textContent?.replace(/\s+/g, ' ');

it('selects an aircraft that was just added once the database list loads', async () => {
  const added = viewFromBuiltin('PA18-150 (SE-GCG)', {
    registration: 'SE-CUB', owned: true, basicEmptyWeight: 455, weighedOn: '2026-05-04',
  });
  added.spec.code = 'PA-18'; // a code the old name-based seat rule would not have recognised
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
  mockedFetch.mockResolvedValue([...allBuiltinViews(), ai]);
  render(<WeightBalanceCalculator preferredRegistration="F-NEWX" />);
  expect(await screen.findByText(/AI-suggested type values/)).toBeInTheDocument();
});

it('keeps working on the built-in list when the database is unreachable', async () => {
  mockedFetch.mockRejectedValue(new Error('offline'));
  render(<WeightBalanceCalculator />);
  expect(await screen.findByText(/Offline: using the built-in aircraft list/)).toBeInTheDocument();
  expect(emptyWeightShown()).toContain('682.4 kg'); // default PA28-161 (SE-KMI)
});

it('settles after rendering instead of re-rendering endlessly', async () => {
  mockedFetch.mockResolvedValue(allBuiltinViews());
  let commits = 0;
  render(<Profiler id="calc" onRender={() => { commits += 1; }}><WeightBalanceCalculator /></Profiler>);
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });
  const settled = commits;
  await act(async () => { await new Promise(r => setTimeout(r, 300)); });
  expect(commits).toBe(settled); // nothing re-renders without input
  expect(settled).toBeLessThan(15);
});
