import React from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';
import SignInButton from './SignInButton';
import { session } from '../../api/session';
import { useAuth } from '../../api/useAuth';

/** Header control: "Sign in" when signed out, the user's name and "Sign out" when signed in. */
const AccountMenu: React.FC = () => {
  const { user } = useAuth();
  if (!user) {
    return <SignInButton variant="outline" size="sm" />;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground" title={user.email}>
        {user.pictureUrl
          // Google photo URLs can refuse requests that carry a referrer.
          ? <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
          : <UserRound className="h-4 w-4" />}
        {user.displayName}
      </span>
      <Button variant="ghost" size="sm" onClick={() => session.signOut()}>
        <LogOut className="mr-1 h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
};

export default AccountMenu;
