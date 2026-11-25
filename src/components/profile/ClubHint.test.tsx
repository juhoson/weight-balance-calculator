import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '../../test/setupUser';
import ClubHint from './ClubHint';
import { fetchMyClubs } from '../../api/backend';

jest.mock('../../api/backend', () => ({ fetchMyClubs: jest.fn() }));
jest.mock('../../api/useAuth', () => ({
  useAuth: () => ({ user: { id: 7, email: 'g@example.com', displayName: 'Google User' }, signOutReason: null }),
}));

const clubs = [{ id: 10, name: 'Club A', homeAirport: null, role: null }];

beforeEach(() => localStorage.clear());

it('points someone without a club to the profile page', async () => {
  const user = setupUser();
  const onOpenProfile = jest.fn();
  (fetchMyClubs as jest.Mock).mockResolvedValue(clubs);
  render(<ClubHint onOpenProfile={onOpenProfile} />);

  expect(await screen.findByRole('note')).toHaveTextContent('choose your club under Profile');
  await user.click(screen.getByRole('button', { name: 'Profile' }));
  expect(onOpenProfile).toHaveBeenCalled();
});

it('stays away once dismissed', async () => {
  const user = setupUser();
  (fetchMyClubs as jest.Mock).mockResolvedValue(clubs);
  const { unmount } = render(<ClubHint onOpenProfile={jest.fn()} />);
  await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
  unmount();

  render(<ClubHint onOpenProfile={jest.fn()} />);
  await waitFor(() => expect(fetchMyClubs).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

it('is hidden for a club member', async () => {
  (fetchMyClubs as jest.Mock).mockResolvedValue([{ ...clubs[0], role: 'MEMBER' }]);
  render(<ClubHint onOpenProfile={jest.fn()} />);
  await waitFor(() => expect(fetchMyClubs).toHaveBeenCalled());
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});
