import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordDialog from './ResetPasswordDialog';
import { AuthError, fetchAuthProviders, session } from '../../api/session';

jest.mock('../../api/session', () => {
  const actual = jest.requireActual('../../api/session');
  return { ...actual, session: { resetPassword: jest.fn() }, fetchAuthProviders: jest.fn() };
});
const resetPassword = session.resetPassword as jest.Mock;

beforeEach(() => {
  resetPassword.mockReset();
  (fetchAuthProviders as jest.Mock).mockResolvedValue({ google: null });
  window.history.replaceState(null, '', '/weight-balance/');
});

it('stays hidden on a normal page load', () => {
  render(<ResetPasswordDialog />);
  expect(screen.queryByText('Choose a new password')).not.toBeInTheDocument();
});

it('opens from an emailed link and removes the token from the address bar', async () => {
  window.history.replaceState(null, '', '/weight-balance/#reset-token=abc123');
  const user = userEvent.setup();
  resetPassword.mockResolvedValue(undefined);
  render(<ResetPasswordDialog />);

  expect(screen.getByText('Choose a new password')).toBeInTheDocument();
  expect(window.location.hash).toBe('');
  expect(window.location.pathname).toBe('/weight-balance/');

  await user.type(screen.getByLabelText('New password'), 'new password');
  await user.type(screen.getByLabelText('Repeat new password'), 'new password');
  await user.click(screen.getByRole('button', { name: 'Set new password' }));

  expect(resetPassword).toHaveBeenCalledWith('abc123', 'new password');
  expect(await screen.findByText(/other devices have been signed out/)).toBeInTheDocument();
});

it('greets an invited member and sets their first password', async () => {
  window.history.replaceState(null, '', '/weight-balance/#invite-token=inv456');
  const user = userEvent.setup();
  resetPassword.mockResolvedValue(undefined);
  render(<ResetPasswordDialog />);

  expect(screen.getByText('Welcome! Choose your password')).toBeInTheDocument();
  expect(window.location.hash).toBe('');
  await user.type(screen.getByLabelText('Password'), 'first password');
  await user.type(screen.getByLabelText('Repeat password'), 'first password');
  await user.click(screen.getByRole('button', { name: 'Set password' }));

  expect(resetPassword).toHaveBeenCalledWith('inv456', 'first password');
  expect(await screen.findByText(/Your password is set/)).toBeInTheDocument();
});

it('explains an expired invite', async () => {
  window.history.replaceState(null, '', '/weight-balance/#invite-token=old');
  const user = userEvent.setup();
  resetPassword.mockRejectedValue(new AuthError(400, 'Invalid or expired reset link'));
  render(<ResetPasswordDialog />);
  await user.type(screen.getByLabelText('Password'), 'first password');
  await user.type(screen.getByLabelText('Repeat password'), 'first password');
  await user.click(screen.getByRole('button', { name: 'Set password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ask your club admin to send a new one');
});

it('catches mismatched passwords before sending', async () => {
  window.history.replaceState(null, '', '/weight-balance/#reset-token=abc123');
  const user = userEvent.setup();
  render(<ResetPasswordDialog />);
  await user.type(screen.getByLabelText('New password'), 'new password');
  await user.type(screen.getByLabelText('Repeat new password'), 'other password');
  await user.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(screen.getByRole('alert')).toHaveTextContent('don\'t match');
  expect(resetPassword).not.toHaveBeenCalled();
});

it('explains an expired or used link', async () => {
  window.history.replaceState(null, '', '/weight-balance/#reset-token=old');
  const user = userEvent.setup();
  resetPassword.mockRejectedValue(new AuthError(400, 'Invalid or expired reset link'));
  render(<ResetPasswordDialog />);
  await user.type(screen.getByLabelText('New password'), 'new password');
  await user.type(screen.getByLabelText('Repeat new password'), 'new password');
  await user.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired reset link');
});
