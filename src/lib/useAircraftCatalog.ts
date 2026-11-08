import React from 'react';
import { fetchAirframes } from '../api/backend';
import { useAuth } from '../api/useAuth';
import {
  builtinCatalog,
  type CatalogData,
  clearCachedCatalog,
  loadCachedCatalog,
  saveCachedCatalog,
  toCatalog,
} from './aircraftCatalog';

export type CatalogSource = 'database' | 'cache' | 'builtin';

export interface AircraftCatalog extends CatalogData {
  source: CatalogSource;
  /** When the cached copy was saved (source 'cache'). */
  savedAt: string | null;
  loading: boolean;
  error: string | null;
}

function initial(userId: number | null): AircraftCatalog {
  const cached = loadCachedCatalog(userId);
  if (cached) {
    const data = toCatalog(cached.views);
    if (Object.keys(data.aircraft).length > 0) {
      return { ...data, source: 'cache', savedAt: cached.savedAt, loading: true, error: null };
    }
  }
  return { ...builtinCatalog(), source: 'builtin', savedAt: null, loading: true, error: null };
}

/**
 * Aircraft for the calculator: from the database, cached for offline use. Until the database
 * answers - or if it can't be reached - the last cached list is used, else the built-in one.
 * The calculator works the same either way; `source` says which data is shown.
 * Reloads on sign-in and sign-out, since the list includes the user's own aircraft.
 */
export function useAircraftCatalog(): AircraftCatalog {
  const userId = useAuth().user?.id ?? null;
  const [catalog, setCatalog] = React.useState<AircraftCatalog>(() => initial(userId));
  const previousUser = React.useRef(userId);

  React.useEffect(() => {
    if (previousUser.current !== userId) {
      if (previousUser.current !== null) clearCachedCatalog(); // signed out or switched account
      previousUser.current = userId;
      setCatalog(initial(userId));
    }
    let cancelled = false;
    fetchAirframes()
      .then(views => {
        if (cancelled) return;
        const data = toCatalog(views);
        if (Object.keys(data.aircraft).length === 0) {
          setCatalog(prev => ({ ...prev, loading: false, error: 'The aircraft database returned no usable aircraft.' }));
          return;
        }
        saveCachedCatalog(views, userId);
        setCatalog({ ...data, source: 'database', savedAt: null, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCatalog(prev => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : 'Could not load aircraft.',
        }));
      });
    return () => { cancelled = true; };
  }, [userId]);

  return catalog;
}
