import React from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { Button } from '../ui/Button';
import SignInButton from './SignInButton';
import { session } from '../../api/session';
import { useAuth } from '../../api/useAuth';

interface AccountMenuProps {
  /** Opens the profile page; the user's name is the way there. */
  onOpenProfile: () => void;
  profileOpen: boolean;
}

/** Header control: "Sign in" when signed out; the user's name (to the profile) and "Sign out" when signed in. */
const AccountMenu: React.FC<AccountMenuProps> = ({ onOpenProfile, profileOpen }) => {
  const { user } = useAuth();
  if (!user) {
    return <SignInButton variant="outline" size="sm" />;
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant={profileOpen ? 'default' : 'ghost'} size="sm" title={`Profile: ${user.email}`}
        aria-current={profileOpen ? 'page' : undefined} onClick={onOpenProfile}>
        {user.pictureUrl
          // Google photo URLs can refuse requests that carry a referrer.
          ? <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-5 w-5 rounded-full sm:mr-1.5" />
          : <UserRound className="h-4 w-4 sm:mr-1.5" />}
        <span className="sr-only sm:not-sr-only">{user.displayName}</span>
        <span className="sr-only">profile</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => session.signOut()}>
        <LogOut className="h-4 w-4 sm:mr-1" />
        <span className="sr-only sm:not-sr-only">Sign out</span>
      </Button>
    </div>
  );
};

export default AccountMenu;
