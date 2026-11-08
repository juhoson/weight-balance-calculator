import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SharedRouteBanner from './SharedRouteBanner';
import { createRoute, fetchSharedRoute } from '../../api/backend';

jest.mock('../../api/backend', () => ({ fetchSharedRoute: jest.fn(), createRoute: jest.fn() }));
const mockedShared = fetchSharedRoute as jest.MockedFunction<typeof fetchSharedRoute>;
const mockedCreate = createRoute as jest.MockedFunction<typeof createRoute>;

beforeEach(() => {
  mockedShared.mockReset();
  mockedCreate.mockReset();
  window.history.replaceState(null, '', '/weight-balance/?route=tok123');
});

it('opens a shared route from the link; use it or save a copy', async () => {
  mockedShared.mockResolvedValue({ name: 'Kaffeflyg', airports: ['ESSX', 'ESCF', 'ESKN'], sharedBy: 'Juho' });
  mockedCreate.mockResolvedValue({ id: 9, name: 'Kaffeflyg', airports: ['ESSX', 'ESCF', 'ESKN'], shareToken: null, updatedAt: '' });
  const onUse = jest.fn();
  render(<SharedRouteBanner signedIn onUse={onUse}/>);
  expect(await screen.findByText('Kaffeflyg')).toBeInTheDocument();
  expect(mockedShared).toHaveBeenCalledWith('tok123');
  expect(screen.getByText(/ESSX → ESCF → ESKN · shared by Juho/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Save a copy' }));
  await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('Kaffeflyg', ['ESSX', 'ESCF', 'ESKN']));
  expect(await screen.findByText('Saved')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Use this route' }));
  expect(onUse).toHaveBeenCalledWith({ from: 'ESSX', to: 'ESKN', via: ['ESCF'], auto: false });
  expect(window.location.search).toBe(''); // the link is used; a reload won't show it again
});

it('says so when the link no longer works, and offers no saving when signed out', async () => {
  mockedShared.mockRejectedValue(new Error('This shared route does not exist or is no longer shared.'));
  render(<SharedRouteBanner signedIn={false} onUse={jest.fn()}/>);
  expect(await screen.findByText(/no longer shared/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save a copy' })).not.toBeInTheDocument();
});

it('shows nothing without a link', () => {
  window.history.replaceState(null, '', '/weight-balance/');
  const { container } = render(<SharedRouteBanner signedIn onUse={jest.fn()}/>);
  expect(container).toBeEmptyDOMElement();
});
