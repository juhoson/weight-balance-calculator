import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { setupUser } from '../../test/setupUser';
import ProfilePage from './ProfilePage';
import { fetchMyClubs, joinClub, leaveClub } from '../../api/backend';
import type { MyClub } from '../../types/profile';
import { session } from '../../api/session';

jest.mock('../../api/backend', () => ({ fetchMyClubs: jest.fn(), joinClub: jest.fn(), leaveClub: jest.fn() }));
jest.mock('../../api/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, email: 'pilot@example.com', displayName: 'Pilot' }, signOutReason: null }),
}));

const clubA: MyClub = { id: 10, name: 'Club A', homeAirport: 'ESSB', role: null };
const clubB: MyClub = { id: 20, name: 'Club B', homeAirport: null, role: null };

beforeEach(() => {
  (fetchMyClubs as jest.Mock).mockResolvedValue([clubA, clubB]);
});

it('shows the account and joins a club', async () => {
  const user = setupUser();
  (joinClub as jest.Mock).mockResolvedValue([{ ...clubA, role: 'MEMBER' }, clubB]);
  render(<ProfilePage />);

  expect(screen.getByText('pilot@example.com')).toBeInTheDocument();
  expect(await screen.findByText('You\'re not a member of any club.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Join Club A' }));

  expect(joinClub).toHaveBeenCalledWith(10);
  expect(await screen.findByRole('status')).toHaveTextContent('You\'re now a member of Club A');
  expect(screen.getByRole('button', { name: 'Leave Club A' })).toBeInTheDocument();
  expect(screen.queryByText('You\'re not a member of any club.')).not.toBeInTheDocument();
});

it('leaves a club, but a club admin has to ask a site admin', async () => {
  const user = setupUser();
  (fetchMyClubs as jest.Mock).mockResolvedValue([{ ...clubA, role: 'ADMIN' }, { ...clubB, role: 'MEMBER' }]);
  (leaveClub as jest.Mock).mockResolvedValue([{ ...clubA, role: 'ADMIN' }, clubB]);
  render(<ProfilePage />);

  const clubARow = (await screen.findByText('Club A')).closest('li') as HTMLElement;
  expect(within(clubARow).queryByRole('button')).not.toBeInTheDocument();
  expect(within(clubARow).getByText('Ask a site admin to step down')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Leave Club B' }));
  expect(leaveClub).toHaveBeenCalledWith(20);
  expect(await screen.findByRole('status')).toHaveTextContent('You\'ve left Club B.');
});

it('shows the server\'s reason when a change fails', async () => {
  const user = setupUser();
  (joinClub as jest.Mock).mockRejectedValue(new Error('Unknown club'));
  render(<ProfilePage />);
  await user.click(await screen.findByRole('button', { name: 'Join Club B' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unknown club');
});

it('deletes the account once DELETE is typed', async () => {
  const user = setupUser();
  const remove = jest.spyOn(session, 'deleteAccount').mockResolvedValue();
  render(<ProfilePage />);

  await user.click(screen.getByRole('button', { name: 'Delete account…' }));
  const confirm = screen.getByRole('button', { name: 'Delete for good' });
  expect(confirm).toBeDisabled();
  await user.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
  await user.click(confirm);

  expect(remove).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole('status')).toHaveTextContent('Your account and its data are deleted.');
  remove.mockRestore();
});
