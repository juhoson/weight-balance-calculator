import React from 'react';
import { fetchMyClubs } from '../api/backend';
import { useAuth } from '../api/useAuth';
import type { MyClub } from '../types/profile';

/**
 * Every club with the signed-in user's role in it; null when signed out or not loaded yet (or it
 * failed). Fetched on sign-in and whenever a page using it mounts, so a change made on the profile
 * page shows on the calculator when you go back.
 */
export function useMyClubs(): [MyClub[] | null, (clubs: MyClub[]) => void] {
  const { user } = useAuth();
  const [clubs, setClubs] = React.useState<MyClub[] | null>(null);
  const userId = user?.id;

  React.useEffect(() => {
    setClubs(null);
    if (userId === undefined) return;
    let cancelled = false;
    fetchMyClubs()
      .then(result => { if (!cancelled) setClubs(result); })
      .catch(() => { /* leave null: the hint stays hidden, the profile page shows its own error */ });
    return () => { cancelled = true; };
  }, [userId]);

  return [clubs, setClubs];
}
