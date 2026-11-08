import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import GoogleSignInButton from './GoogleSignInButton';
import { fetchAuthProviders, session } from '../../api/session';

jest.mock('../../api/session', () => ({
  fetchAuthProviders: jest.fn(),
  session: { signInWithGoogle: jest.fn() },
}));
const providers = fetchAuthProviders as jest.Mock;
const signInWithGoogle = session.signInWithGoogle as jest.Mock;

let gsi: { initialize: jest.Mock; renderButton: jest.Mock; disableAutoSelect: jest.Mock };

beforeEach(() => {
  providers.mockReset();
  signInWithGoogle.mockReset();
  gsi = { initialize: jest.fn(), renderButton: jest.fn(), disableAutoSelect: jest.fn() };
  // Stands in for Google's script, which the component would otherwise load from accounts.google.com.
  window.google = { accounts: { id: gsi } } as unknown as typeof window.google;
});

afterEach(() => {
  Reflect.deleteProperty(window, 'google');
});

/** The callback the component registered with Google. */
const googleCallback = () => gsi.initialize.mock.calls[0][0].callback as (r: { credential: string }) => Promise<void>;

it('renders nothing when the server has Google sign-in off', async () => {
  providers.mockResolvedValue({ google: null });
  const onAvailability = jest.fn();
  render(<GoogleSignInButton onSuccess={jest.fn()} onError={jest.fn()} onAvailability={onAvailability} />);
  await waitFor(() => expect(onAvailability).toHaveBeenCalledWith(false));
  expect(gsi.initialize).not.toHaveBeenCalled();
  expect(screen.getByTestId('google-signin')).toHaveClass('hidden');
});

it('initializes Google with the server\'s client id and renders its button', async () => {
  providers.mockResolvedValue({ google: { clientId: 'abc.apps.googleusercontent.com' } });
  const onAvailability = jest.fn();
  render(<GoogleSignInButton onSuccess={jest.fn()} onError={jest.fn()} onAvailability={onAvailability} />);

  await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled());
  expect(gsi.initialize.mock.calls[0][0].client_id).toBe('abc.apps.googleusercontent.com');
  expect(gsi.renderButton.mock.calls[0][1]).toMatchObject({ text: 'continue_with', theme: 'outline' });
  expect(onAvailability).toHaveBeenCalledWith(true);
});

it('signs in with the credential Google returns', async () => {
  providers.mockResolvedValue({ google: { clientId: 'abc' } });
  signInWithGoogle.mockResolvedValue({ id: 1 });
  const onSuccess = jest.fn();
  render(<GoogleSignInButton onSuccess={onSuccess} onError={jest.fn()} />);
  await waitFor(() => expect(gsi.initialize).toHaveBeenCalled());

  await googleCallback()({ credential: 'google-id-token' });
  expect(signInWithGoogle).toHaveBeenCalledWith('google-id-token');
  expect(onSuccess).toHaveBeenCalled();
});

it('reports the server\'s reason when Google sign-in is refused', async () => {
  providers.mockResolvedValue({ google: { clientId: 'abc' } });
  signInWithGoogle.mockRejectedValue(new Error('An account with this email already exists. Sign in with your password.'));
  const onError = jest.fn();
  const onSuccess = jest.fn();
  render(<GoogleSignInButton onSuccess={onSuccess} onError={onError} />);
  await waitFor(() => expect(gsi.initialize).toHaveBeenCalled());

  await googleCallback()({ credential: 'google-id-token' });
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('Sign in with your password'));
  expect(onSuccess).not.toHaveBeenCalled();
});

it('loads Google\'s script when it is not on the page yet', async () => {
  Reflect.deleteProperty(window, 'google');
  providers.mockResolvedValue({ google: { clientId: 'abc' } });
  render(<GoogleSignInButton onSuccess={jest.fn()} onError={jest.fn()} />);
  await waitFor(() =>
    expect(document.head.querySelector('script[src="https://accounts.google.com/gsi/client"]')).not.toBeNull());
});
