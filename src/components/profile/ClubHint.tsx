import React from 'react';
import { Users, X } from 'lucide-react';
import { useAuth } from '../../api/useAuth';
import { useMyClubs } from '../../lib/useMyClubs';

const dismissKey = (userId: number) => `wb.clubHintDismissed.${userId}`;

function readDismissed(userId: number): boolean {
  try {
    return localStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Under the aircraft picker, for a signed-in user who isn't in any club yet (e.g. signed up with
 * Google, which doesn't ask): points them to the profile page. Can be dismissed, since not everyone
 * flies with a club.
 */
const ClubHint: React.FC<{ onOpenProfile: () => void }> = ({ onOpenProfile }) => {
  const { user } = useAuth();
  const [clubs] = useMyClubs();
  const [dismissed, setDismissed] = React.useState(false);

  if (!user || !clubs || clubs.length === 0 || clubs.some(c => c.role !== null)) return null;
  if (dismissed || readDismissed(user.id)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(user.id), '1');
    } catch {
      /* hidden for this visit only */
    }
  };

  return (
    <div role="note" className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
      <Users className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1">
        Fly with a club? You can choose your club under{' '}
        <button type="button" onClick={onOpenProfile} className="font-medium underline underline-offset-2 hover:no-underline">
          Profile
        </button>
        {' '}to get its aircraft.
      </p>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ClubHint;
