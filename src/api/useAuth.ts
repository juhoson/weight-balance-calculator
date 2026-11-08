import React from 'react';
import { session, type SessionState } from './session';

/** The current sign-in state; re-renders on sign-in, sign-out and changes from other tabs. */
export function useAuth(): SessionState {
  return React.useSyncExternalStore(session.subscribe, session.getState);
}
