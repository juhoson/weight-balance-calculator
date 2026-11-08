import React from 'react';
import { LogOut } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/Alert';
import { Button } from '../ui/Button';
import SignInButton from './SignInButton';
import { session } from '../../api/session';
import { useAuth } from '../../api/useAuth';

/** Explains a sign-out the user didn't ask for. */
const SignedOutNotice: React.FC = () => {
  const { user, signOutReason } = useAuth();
  if (user || !signOutReason) return null;
  return (
    <Alert variant="warning" className="mb-4">
      <LogOut className="h-4 w-4" />
      <AlertTitle>You were signed out</AlertTitle>
      <AlertDescription>
        <p>
          {signOutReason === 'DEVICE_LIMIT'
            ? 'Your account signed in on another device, and only a few devices can be signed in at once.'
            : 'Your session expired.'}
          {' '}The calculator still works; sign in again to use your own aircraft.
        </p>
        <div className="mt-2 flex gap-2">
          <SignInButton size="sm" label="Sign in again" />
          <Button size="sm" variant="ghost" onClick={() => session.dismissSignOutReason()}>Dismiss</Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default SignedOutNotice;
