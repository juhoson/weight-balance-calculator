import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./api/useAuth', () => ({ useAuth: () => ({ user: null, signOutReason: null }) }));
jest.mock('./lib/useAdminAccess', () => ({ useAdminAccess: () => null }));
jest.mock('./components/WeightBalanceCalculator', () => () => <p>The calculator page</p>);

beforeAll(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
});

it('the account deletion link asks a signed-out visitor to sign in, and leaves the address clean', async () => {
  window.history.replaceState(null, '', '/?delete-account&x=1');
  render(<App />);
  expect(screen.getByText('Sign in to delete your account and its data.')).toBeInTheDocument();
  expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByText('The calculator page')).not.toBeInTheDocument();
  expect(window.location.search).toBe('?x=1');
  window.history.replaceState(null, '', '/');
});
