import React from 'react';
import { fetchAdminAccess } from '../api/backend';
import { useAuth } from '../api/useAuth';
import type { AdminAccess } from '../types/admin';

/**
 * What the signed-in user may administer, fetched on sign-in; null when signed out, not an admin,
 * or not known yet. Only hides or shows the admin page - the backend checks every request.
 */
export function useAdminAccess(): AdminAccess | null {
  const { user } = useAuth();
  const [access, setAccess] = React.useState<AdminAccess | null>(null);
  const userId = user?.id;

  React.useEffect(() => {
    setAccess(null);
    if (userId === undefined) return;
    let cancelled = false;
    fetchAdminAccess()
      .then(result => { if (!cancelled) setAccess(result.admin ? result : null); })
      .catch(() => { /* not an admin as far as the page knows; the backend decides anyway */ });
    return () => { cancelled = true; };
  }, [userId]);

  return access;
}
