import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminPage from './AdminPage';
import {
  deleteMember,
  inviteMember,
  listMembers,
  removeFromClub,
  sendPasswordLink,
  setClubRole,
  setMemberDisabled,
} from '../../api/backend';
import type { AdminAccess, MemberView } from '../../types/admin';

jest.mock('../../api/backend', () => ({
  listMembers: jest.fn(),
  inviteMember: jest.fn(),
  sendPasswordLink: jest.fn(),
  setMemberDisabled: jest.fn(),
  deleteMember: jest.fn(),
  setClubRole: jest.fn(),
  removeFromClub: jest.fn(),
}));
jest.mock('../../api/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, email: 'me@example.com', displayName: 'Me' }, signOutReason: null }),
}));

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.MockedFunction<T>;

const clubA = { id: 10, name: 'Club A' };
const clubB = { id: 20, name: 'Club B' };

function member(id: number, name: string, overrides: Partial<MemberView> = {}): MemberView {
  return {
    id, email: `${name.toLowerCase()}@example.com`, displayName: name, status: 'ACTIVE', hasPassword: true,
    google: false, siteAdmin: false, lastLoginAt: '2026-11-01T10:00:00Z',
    clubs: [{ clubId: clubA.id, clubName: clubA.name, role: 'MEMBER' }], ...overrides,
  };
}

const me = member(1, 'Me', { clubs: [{ clubId: clubA.id, clubName: clubA.name, role: 'ADMIN' }] });
const anna = member(2, 'Anna');
const pending = member(3, 'Pending', { status: 'INVITED', hasPassword: false, lastLoginAt: null });

const clubAdmin: AdminAccess = { siteAdmin: false, clubs: [clubA], admin: true };
const siteAdmin: AdminAccess = { siteAdmin: true, clubs: [clubA, clubB], admin: true };

beforeEach(() => {
  jest.resetAllMocks();
  mocked(listMembers).mockResolvedValue([anna, me, pending]);
});

const row = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement;

it('lets a club admin send links, but not disable or delete accounts', async () => {
  const user = userEvent.setup();
  mocked(sendPasswordLink).mockResolvedValue({ kind: 'RESET', email: 'anna@example.com' });
  render(<AdminPage access={clubAdmin} />);

  expect(screen.getByText('Admin of Club A.')).toBeInTheDocument();
  const annaRow = await row('Anna');
  expect(within(annaRow).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
  expect(within(annaRow).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  // Can remove an ordinary member, but not themselves.
  expect(within(annaRow).getByRole('button', { name: 'Remove Anna from Club A' })).toBeInTheDocument();
  expect(within(await row('Me')).queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();

  await user.click(within(annaRow).getByRole('button', { name: 'Send reset link' }));
  expect(sendPasswordLink).toHaveBeenCalledWith(2);
  expect(await screen.findByRole('status')).toHaveTextContent('Password reset link sent to anna@example.com.');

  expect(within(await row('Pending')).getByRole('button', { name: 'Resend invite' })).toBeInTheDocument();
});

it('shows the server\'s reason when an action is refused', async () => {
  const user = userEvent.setup();
  mocked(sendPasswordLink).mockRejectedValue(new Error('A link was sent to this member less than a minute ago.'));
  render(<AdminPage access={clubAdmin} />);
  await user.click(within(await row('Anna')).getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('less than a minute ago');
});

it('asks before a site admin disables or deletes an account', async () => {
  const user = userEvent.setup();
  mocked(setMemberDisabled).mockResolvedValue({ ...anna, status: 'DISABLED' });
  mocked(deleteMember).mockResolvedValue(undefined);
  render(<AdminPage access={siteAdmin} />);

  // Never on your own account.
  expect(within(await row('Me')).queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();

  await user.click(within(await row('Anna')).getByRole('button', { name: 'Disable' }));
  expect(screen.getByText('Disable this account?')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Disable' }));
  await waitFor(() => expect(setMemberDisabled).toHaveBeenCalledWith(2, true));
  expect(await within(await row('Anna')).findByText('Disabled')).toBeInTheDocument();
  expect(within(await row('Anna')).getByRole('button', { name: 'Enable' })).toBeInTheDocument();

  await user.click(within(await row('Anna')).getByRole('button', { name: 'Delete Anna' }));
  expect(screen.getByText(/can't be undone/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(deleteMember).toHaveBeenCalledWith(2));
  await waitFor(() => expect(screen.queryByText('Anna')).not.toBeInTheDocument());
});

it('lets a site admin make someone a club admin', async () => {
  const user = userEvent.setup();
  mocked(setClubRole).mockResolvedValue({ ...anna, clubs: [{ clubId: 10, clubName: 'Club A', role: 'ADMIN' }] });
  render(<AdminPage access={siteAdmin} />);
  await user.click(within(await row('Anna')).getByRole('button', { name: 'member' }));
  expect(setClubRole).toHaveBeenCalledWith(10, 2, 'ADMIN');
  expect(await screen.findByRole('status')).toHaveTextContent('Anna is now an admin of Club A.');
});

it('removes a member from the club after asking', async () => {
  const user = userEvent.setup();
  mocked(removeFromClub).mockResolvedValue({ ...anna, clubs: [] });
  render(<AdminPage access={clubAdmin} />);
  await user.click(within(await row('Anna')).getByRole('button', { name: 'Remove Anna from Club A' }));
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(removeFromClub).toHaveBeenCalledWith(10, 2));
  await waitFor(() => expect(screen.queryByText('Anna')).not.toBeInTheDocument());
});

it('invites someone to the club admin\'s club and reloads the list', async () => {
  const user = userEvent.setup();
  const newcomer = member(4, 'Newcomer', { status: 'INVITED', hasPassword: false });
  mocked(inviteMember).mockResolvedValue({ outcome: 'INVITED', emailSent: true, member: newcomer });
  render(<AdminPage access={clubAdmin} />);
  await screen.findByText('Anna');

  await user.click(screen.getByRole('button', { name: 'Invite member' }));
  // Club admins can't choose a role or skip the club.
  expect(screen.queryByText('Role in the club')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Email'), 'newcomer@example.com');
  await user.click(screen.getByRole('button', { name: 'Send invite' }));

  expect(inviteMember).toHaveBeenCalledWith({ email: 'newcomer@example.com', displayName: undefined, clubId: 10, role: 'MEMBER' });
  expect(await screen.findByRole('status')).toHaveTextContent('Invite sent to newcomer@example.com.');
  await waitFor(() => expect(listMembers).toHaveBeenCalledTimes(2));
});

it('filters by club and searches', async () => {
  const user = userEvent.setup();
  render(<AdminPage access={siteAdmin} />);
  await screen.findByText('Anna');
  await user.selectOptions(screen.getByLabelText('Club'), 'Club B');
  await waitFor(() => expect(listMembers).toHaveBeenLastCalledWith('', 20));
  await user.type(screen.getByLabelText('Search members'), 'ann');
  await waitFor(() => expect(listMembers).toHaveBeenLastCalledWith('ann', 20));
});
