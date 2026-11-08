import { act, renderHook, waitFor } from '@testing-library/react';
import { useAircraftCatalog } from './useAircraftCatalog';
import { fetchAirframes, fetchGenericTypes } from '../api/backend';
import { loadCachedCatalog, saveCachedCatalog } from './aircraftCatalog';
import { allBuiltinViews, genericFromBuiltin, viewFromBuiltin } from './testViews';

jest.mock('../api/backend', () => ({ fetchAirframes: jest.fn(), fetchGenericTypes: jest.fn() }));
let mockUser: { id: number; email: string; displayName: string } | null = null;
jest.mock('../api/useAuth', () => ({ useAuth: () => ({ user: mockUser, signOutReason: null }) }));
const mockedAirframes = fetchAirframes as jest.MockedFunction<typeof fetchAirframes>;
const mockedGenerics = fetchGenericTypes as jest.MockedFunction<typeof fetchGenericTypes>;

const generics = () => [genericFromBuiltin('PA28-161 (SE-KMI)'), genericFromBuiltin('TB9 (F-GKVK)')];

beforeEach(() => {
  localStorage.clear();
  mockedAirframes.mockReset();
  mockedGenerics.mockReset();
  mockUser = null;
});

it('signed out: loads only the generic types, and caches them', async () => {
  mockedGenerics.mockResolvedValue(generics());
  const { result } = renderHook(() => useAircraftCatalog());

  expect(result.current.source).toBe('builtin'); // until the database answers
  await waitFor(() => expect(result.current.source).toBe('database'));
  expect(Object.keys(result.current.aircraft)).toEqual(['PA28-161 (generic)', 'TB9 (generic)']);
  expect(mockedAirframes).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
  expect(loadCachedCatalog(null)?.generics).toHaveLength(2);
});

it('reloads on sign-in with own and club aircraft, and forgets them on sign-out', async () => {
  mockedGenerics.mockResolvedValue(generics());
  const { result, rerender } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.source).toBe('database'));

  const club = viewFromBuiltin('PA28-161 (SE-KMI)', { club: { id: 1, name: 'Club' } });
  const own = viewFromBuiltin('PA28-161 (SE-KMI)', { registration: 'SE-OWN', owned: true });
  mockedAirframes.mockResolvedValue([club, own]);
  mockUser = { id: 7, email: 'p@example.com', displayName: 'Pilot' };
  act(() => rerender());
  await waitFor(() => expect(result.current.aircraft['PA28-161 (SE-OWN)']).toBeDefined());
  expect(result.current.aircraft['PA28-161 (SE-KMI)']).toBeDefined();
  expect(result.current.aircraft['PA28-161 (generic)']).toBeDefined();
  expect(loadCachedCatalog(7)?.views).toHaveLength(2);

  mockedGenerics.mockRejectedValue(new Error('offline'));
  mockUser = null;
  act(() => rerender());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.aircraft['PA28-161 (SE-OWN)']).toBeUndefined(); // not shown after sign-out
  expect(result.current.aircraft['PA28-161 (SE-KMI)']).toBeUndefined();
  expect(loadCachedCatalog(7)).toBeNull();
});

it('reload() fetches again, e.g. after choosing club aircraft', async () => {
  mockUser = { id: 7, email: 'p@example.com', displayName: 'Pilot' };
  mockedGenerics.mockResolvedValue(generics());
  mockedAirframes.mockResolvedValue([]);
  const { result } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.source).toBe('database'));

  mockedAirframes.mockResolvedValue([viewFromBuiltin('TB9 (F-GKVK)', { club: { id: 1, name: 'Club' } })]);
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.aircraft['TB9 (F-GKVK)']).toBeDefined());
  expect(mockedAirframes).toHaveBeenCalledTimes(2);
});

it('falls back to the cached list when the database cannot be reached', async () => {
  saveCachedCatalog([], [genericFromBuiltin('TB9 (F-GKVK)')], null, new Date('2026-10-01T00:00:00Z'));
  mockedGenerics.mockRejectedValue(new Error('Could not reach the aircraft database.'));
  const { result } = renderHook(() => useAircraftCatalog());

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('cache');
  expect(result.current.savedAt).toBe('2026-10-01T00:00:00.000Z');
  expect(Object.keys(result.current.aircraft)).toEqual(['TB9 (generic)']);
  expect(result.current.error).toMatch(/Could not reach/);
});

it('falls back to the built-in generic aircraft with no cache', async () => {
  mockedGenerics.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('builtin');
  expect(Object.keys(result.current.aircraft)).toHaveLength(8);
});

it('keeps the fallback if the database returns nothing usable', async () => {
  mockedGenerics.mockResolvedValue([]);
  const { result } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.source).toBe('builtin');
  expect(result.current.error).toMatch(/no usable aircraft/);
  expect(loadCachedCatalog(null)).toBeNull();
});

it('still turns every built-in aircraft into a usable club aircraft', async () => {
  mockUser = { id: 7, email: 'p@example.com', displayName: 'Pilot' };
  mockedGenerics.mockResolvedValue([]);
  mockedAirframes.mockResolvedValue(allBuiltinViews());
  const { result } = renderHook(() => useAircraftCatalog());
  await waitFor(() => expect(result.current.source).toBe('database'));
  expect(result.current.skipped).toEqual([]);
  expect(Object.keys(result.current.aircraft)).toHaveLength(12);
});
