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
  await waitFor(() => expect(mocked.create).toHaveBeenCalledWith('ESSX → ESCF → ESGG', ['ESSX', 'ESCF', 'ESGG']));
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
  expect(onLoad).toHaveBeenCalledWith({ from: 'ESSX', to: 'ESKN', via: [], auto: false });

  fireEvent.click(screen.getByRole('button', { name: 'Delete Kaffeflyg' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
  await waitFor(() => expect(screen.queryByText('Kaffeflyg')).not.toBeInTheDocument());
  expect(mocked.remove).toHaveBeenCalledWith(1);
});
