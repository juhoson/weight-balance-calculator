import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SavedRoutesDialog } from './SavedRoutesDialog';
import { createRoute, deleteRoute, listRoutes, shareRoute } from '../../api/backend';
import type { SavedRoute } from '../../types/route';

jest.mock('../../api/backend', () => ({
  listRoutes: jest.fn(), createRoute: jest.fn(), deleteRoute: jest.fn(), shareRoute: jest.fn(), unshareRoute: jest.fn(),
}));
const mocked = {
  list: listRoutes as jest.MockedFunction<typeof listRoutes>,
  create: createRoute as jest.MockedFunction<typeof createRoute>,
  remove: deleteRoute as jest.MockedFunction<typeof deleteRoute>,
  share: shareRoute as jest.MockedFunction<typeof shareRoute>,
};
const saved: SavedRoute = { id: 1, name: 'Kaffeflyg', airports: ['ESSX', 'ESKN'], shareToken: null, updatedAt: '2026-11-08T18:00:00Z' };

beforeEach(() => {
  Object.values(mocked).forEach(m => m.mockReset());
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
});

it('saves the current route under a suggested name', async () => {
  mocked.list.mockResolvedValue([]);
  mocked.create.mockResolvedValue({ ...saved, id: 2, name: 'ESSX → ESCF → ESGG', airports: ['ESSX', 'ESCF', 'ESGG'] });
  render(<SavedRoutesDialog open onOpenChange={jest.fn()} onLoad={jest.fn()}
    route={{ from: 'ESSX', to: 'ESGG', via: ['ESCF'], auto: false }}/>);
  expect(await screen.findByText('No saved routes yet.')).toBeInTheDocument();
  expect(screen.getByLabelText('Save the current route')).toHaveValue('ESSX → ESCF → ESGG');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mocked.create).toHaveBeenCalledWith('ESSX → ESCF → ESGG', ['ESSX', 'ESCF', 'ESGG'], undefined));
  expect(await screen.findByText('ESSX → ESCF → ESGG', { selector: 'p.font-semibold' })).toBeInTheDocument();
});

it('loads, shares (copying the link) and deletes a saved route', async () => {
  mocked.list.mockResolvedValue([saved]);
  mocked.share.mockResolvedValue({ ...saved, shareToken: 'tok123' });
  mocked.remove.mockResolvedValue(undefined);
  const onLoad = jest.fn();
  render(<SavedRoutesDialog open onOpenChange={jest.fn()} onLoad={onLoad} route={{ from: '', to: '', via: [], auto: true }}/>);
  await screen.findByText('Kaffeflyg');

  fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
  const link = await screen.findByLabelText('Share link for Kaffeflyg');
  expect((link as HTMLInputElement).value).toMatch(/\?route=tok123$/);
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/\?route=tok123$/)));

  fireEvent.click(screen.getByRole('button', { name: 'Use' }));
  expect(onLoad).toHaveBeenCalledWith({ from: 'ESSX', to: 'ESKN', via: [], auto: false }, { cruiseAltitudeFt: null, altitudeChanges: [] });

  fireEvent.click(screen.getByRole('button', { name: 'Delete Kaffeflyg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
  await waitFor(() => expect(screen.queryByText('Kaffeflyg')).not.toBeInTheDocument());
  expect(mocked.remove).toHaveBeenCalledWith(1);
});

it('saves the cruise altitude and altitude changes with the route, and loads them back', async () => {
  const altitudes = { cruiseAltitudeFt: 4500, altitudeChanges: [{ fromNm: 9, toNm: 41, ft: 2000, note: 'Under STOCKHOLM TMA' }] };
  mocked.list.mockResolvedValue([{ ...saved, id: 3, name: 'Under the TMA', ...altitudes }, saved]);
  mocked.create.mockResolvedValue({ ...saved, id: 4, name: 'ESSX → ESGG', airports: ['ESSX', 'ESGG'], ...altitudes });
  const onLoad = jest.fn();
  render(<SavedRoutesDialog open onOpenChange={jest.fn()} onLoad={onLoad} altitudes={altitudes}
    route={{ from: 'ESSX', to: 'ESGG', via: [], auto: false }}/>);
  expect(await screen.findByText('ESSX → ESKN · 4,500 ft, 1 altitude change')).toBeInTheDocument();
  expect(screen.getByText('ESSX → ESGG · 4,500 ft, 1 altitude change')).toBeInTheDocument(); // what Save will keep
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mocked.create).toHaveBeenCalledWith('ESSX → ESGG', ['ESSX', 'ESGG'], altitudes));

  fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[0]);
  expect(onLoad).toHaveBeenCalledWith({ from: 'ESSX', to: 'ESKN', via: [], auto: false }, altitudes);
  fireEvent.click(screen.getAllByRole('button', { name: 'Use' })[1]); // saved before altitudes were
  expect(onLoad).toHaveBeenLastCalledWith({ from: 'ESSX', to: 'ESKN', via: [], auto: false }, { cruiseAltitudeFt: null, altitudeChanges: [] });
});
