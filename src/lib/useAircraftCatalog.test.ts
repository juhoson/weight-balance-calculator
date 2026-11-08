import { act, renderHook, waitFor } from '@testing-library/react';
import { useAircraftCatalog } from './useAircraftCatalog';
import { fetchAirframes } from '../api/backend';
import { loadCachedCatalog, saveCachedCatalog } from './aircraftCatalog';
import { allBuiltinViews, viewFromBuiltin } from './testViews';

jest.mock('../api/backend', () => ({ fetchAirframes: jest.fn() }));
let mockUser: { id: number; email: string; displayName: string } | null = null;
jest.mock('../api/useAuth', () => ({ useAuth: () => ({ user: mockUser, signOutReason: null }) }));
const mockedFetch = fetchAirframes as jest.MockedFunction<typeof fetchAirframes>;

beforeEach(() => {
  localStorage.clear();
  mockedFetch.mockReset();
  mockUser = null;
});

it('reloads on sign-in, and forgets the user\'s list on sign-out', async () => {
  mockedFetch.mockResolvedValue(allBuiltinViews());
  const { result, rerender } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.source).toBe('database'));
  expect(mockedFetch).toHaveBeenCalledTimes(1);

  const own = viewFromBuiltin('PA28-161 (SE-KMI)', { registration: 'SE-OWN', owned: true });
  mockedFetch.mockResolvedValue([...allBuiltinViews(), own]);
  mockUser = { id: 7, email: 'p@example.com', displayName: 'Pilot' };
  act(() => rerender());
  await waitFor(() => expect(result.current.aircraft['PA28-161 (SE-OWN)']).toBeDefined());
  expect(mockedFetch).toHaveBeenCalledTimes(2);
  expect(loadCachedCatalog(7)?.views).toHaveLength(13);

  mockedFetch.mockRejectedValue(new Error('offline'));
  mockUser = null;
  act(() => rerender());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.aircraft['PA28-161 (SE-OWN)']).toBeUndefined(); // not shown after sign-out
  expect(loadCachedCatalog(7)).toBeNull();
});

it('uses the database list and caches it for offline use', async () => {
  const mine = viewFromBuiltin('PA28-161 (SE-KMI)', { registration: 'SE-NEW', owned: true });
  mockedFetch.mockResolvedValue([...allBuiltinViews(), mine]);
  const { result } = renderHook(() => useAircraftCatalog());

  expect(result.current.source).toBe('builtin'); // until the database answers
  await waitFor(() => expect(result.current.source).toBe('database'));
  expect(result.current.aircraft['PA28-161 (SE-NEW)']).toBeDefined();
  expect(result.current.error).toBeNull();
  expect(loadCachedCatalog(null)?.views).toHaveLength(13);
});

it('falls back to the cached list when the database cannot be reached', async () => {
  saveCachedCatalog([viewFromBuiltin('TB9 (F-GKVK)')], null, new Date('2026-10-01T00:00:00Z'));
  mockedFetch.mockRejectedValue(new Error('Could not reach the aircraft database.'));
  const { result } = renderHook(() => useAircraftCatalog());

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('cache');
  expect(result.current.savedAt).toBe('2026-10-01T00:00:00.000Z');
  expect(Object.keys(result.current.aircraft)).toEqual(['TB9 (F-GKVK)']);
  expect(result.current.error).toMatch(/Could not reach/);
});

it('falls back to the built-in list with no cache', async () => {
  mockedFetch.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('builtin');
  expect(Object.keys(result.current.aircraft)).toHaveLength(12);
});

it('keeps the fallback if the database returns nothing usable', async () => {
  mockedFetch.mockResolvedValue([]);
  const { result } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('builtin');
  expect(result.current.error).toMatch(/no usable aircraft/);
  expect(loadCachedCatalog(null)).toBeNull();
});
