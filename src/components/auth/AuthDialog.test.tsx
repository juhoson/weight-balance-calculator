import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthDialog from './AuthDialog';
import { AuthError, fetchAuthProviders, session } from '../../api/session';
import { fetchClubNames } from '../../api/backend';

jest.mock('../../api/session', () => {
  const actual = jest.requireActual('../../api/session');
  return {
    ...actual,
    session: { signIn: jest.fn(), register: jest.fn(), requestPasswordReset: jest.fn() },
    fetchAuthProviders: jest.fn(),
  };
});
jest.mock('../../api/backend', () => ({ fetchClubNames: jest.fn() }));
const signIn = session.signIn as jest.Mock;
const register = session.register as jest.Mock;

beforeEach(() => {
  signIn.mockReset();
  register.mockReset();
  // CRA resets mocks before each test, so the providers answer is set here.
  (fetchAuthProviders as jest.Mock).mockResolvedValue({ google: null });
  (fetchClubNames as jest.Mock).mockResolvedValue([]);
});

it('signs in and closes', async () => {
  const user = userEvent.setup();
  const onOpenChange = jest.fn();
  signIn.mockResolvedValue({ id: 1, email: 'pilot@example.com', displayName: 'Pilot' });
  render(<AuthDialog open onOpenChange={onOpenChange} />);

  await user.type(screen.getByLabelText('Email'), ' pilot@example.com ');
  await user.type(screen.getByLabelText('Password'), 'correct horse');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(signIn).toHaveBeenCalledWith('pilot@example.com', 'correct horse');
});

it('shows the server message and stays open on failure', async () => {
  const user = userEvent.setup();
  const onOpenChange = jest.fn();
  signIn.mockRejectedValue(new AuthError(401, 'Invalid email or password'));
  render(<AuthDialog open onOpenChange={onOpenChange} />);

  await user.type(screen.getByLabelText('Email'), 'pilot@example.com');
  await user.type(screen.getByLabelText('Password'), 'wrong');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});

it('creates an account from the register mode', async () => {
  const user = userEvent.setup();
  register.mockResolvedValue({ id: 2, email: 'new@example.com', displayName: 'New Pilot' });
  render(<AuthDialog open onOpenChange={jest.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Create an account' }));
  await user.type(screen.getByLabelText('Name'), 'New Pilot');
  await user.type(screen.getByLabelText('Email'), 'new@example.com');
  await user.type(screen.getByLabelText('Password'), 'long enough');
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  await waitFor(() => expect(register).toHaveBeenCalledWith('new@example.com', 'long enough', 'New Pilot', undefined));
});

it('asks which club you fly with when registering', async () => {
  const user = userEvent.setup();
  (fetchClubNames as jest.Mock).mockResolvedValue([{ id: 10, name: 'Club A' }, { id: 20, name: 'Club B' }]);
  register.mockResolvedValue({ id: 2, email: 'new@example.com', displayName: 'New Pilot' });
  render(<AuthDialog open onOpenChange={jest.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Create an account' }));
  await user.type(screen.getByLabelText('Name'), 'New Pilot');
  await user.type(screen.getByLabelText('Email'), 'new@example.com');
  await user.type(screen.getByLabelText('Password'), 'long enough');
  await user.selectOptions(await screen.findByLabelText('Which club do you fly with?'), 'Club B');
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  await waitFor(() => expect(register).toHaveBeenCalledWith('new@example.com', 'long enough', 'New Pilot', 20));
});

it('sends a reset link from "Forgot password?" without revealing whether the account exists', async () => {
  const user = userEvent.setup();
  const requestPasswordReset = session.requestPasswordReset as jest.Mock;
  requestPasswordReset.mockResolvedValue(undefined);
  render(<AuthDialog open onOpenChange={jest.fn()} />);

  await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
  await user.type(screen.getByLabelText('Email'), 'pilot@example.com');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));

  expect(requestPasswordReset).toHaveBeenCalledWith('pilot@example.com');
  expect(await screen.findByRole('status')).toHaveTextContent('If pilot@example.com has an account');
  await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
});
