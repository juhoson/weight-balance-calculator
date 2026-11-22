import React from 'react';
import { fetchAirframes, fetchGenericTypes } from '../api/backend';
import type { AirframeView } from '../types/airframeImport';
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
  /** Load the list again, e.g. after the user changed which club aircraft to show. */
  reload: () => void;
}

type CatalogState = Omit<AircraftCatalog, 'reload'>;

/** A cached club's aircraft: those of the cached list that belong to it. */
const ofClub = (views: AirframeView[], club: string | null) =>
  club ? views.filter(v => v.club?.code?.toLowerCase() === club) : views;

function initial(userId: number | null, club: string | null): CatalogState {
  const cached = loadCachedCatalog(userId);
  if (cached) {
    const views = ofClub(cached.views, club);
    const data = toCatalog(views, cached.generics);
    if (Object.keys(data.aircraft).length > 0) {
      return { ...data, source: 'cache', savedAt: cached.savedAt, loading: true, error: null };
    }
  }
  return { ...builtinCatalog(), source: 'builtin', savedAt: null, loading: true, error: null };
}

/**
 * Aircraft for the calculator: the generic types for everyone, and every club's aircraft - or when
 * signed in, the user's own and chosen club aircraft. With a club code (a club link), just that
 * club's aircraft. Cached for offline use: until the database answers - or if it can't be reached -
 * the last cached list is used, else built-in generic types. `source` says which. Reloads on
 * sign-in and sign-out, since the list depends on the user.
 */
export function useAircraftCatalog(club: string | null = null): AircraftCatalog {
  const userId = useAuth().user?.id ?? null;
  const [catalog, setCatalog] = React.useState<CatalogState>(() => initial(userId, club));
  const previousUser = React.useRef(userId);
  const [generation, setGeneration] = React.useState(0);
  const reload = React.useCallback(() => setGeneration(g => g + 1), []);

  React.useEffect(() => {
    if (previousUser.current !== userId) {
      if (previousUser.current !== null) clearCachedCatalog(); // signed out or switched account
      previousUser.current = userId;
      setCatalog(initial(userId, club));
    }
    let cancelled = false;
    Promise.all([fetchAirframes(club), fetchGenericTypes()])
      .then(([views, generics]) => {
        if (cancelled) return;
        const data = toCatalog(views, generics);
        if (Object.keys(data.aircraft).length === 0) {
          setCatalog(prev => ({ ...prev, loading: false, error: 'The aircraft database returned no usable aircraft.' }));
          return;
        }
        // The cache keeps the full list; a club link's list is a subset of it.
        if (!club) saveCachedCatalog(views, generics, userId);
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
  }, [userId, club, generation]);

  return React.useMemo(() => ({ ...catalog, reload }), [catalog, reload]);
}
