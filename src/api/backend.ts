import { authFetch } from './session';
import type {
  AirframeImportRequest,
  AirframeView,
  ClubSelectionRequest,
  ClubView,
  GenericTypeView,
  ImportPreviewResponse,
  ImportResult,
  StandardTypeResponse,
} from '../types/airframeImport';
import type {
  AdminAccess,
  ClubRole,
  InviteRequest,
  InviteResponse,
  MemberView,
  PasswordLinkResponse,
} from '../types/admin';
import type { AirportInfo, NearbyAirport, RouteWeather, SavedRoute, SharedRoute } from '../types/route';

// The backend's address: set at build time for production, from .env.development for npm start.
// Empty = same origin.
const API_BASE = process.env.REACT_APP_API_URL ?? '';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // Sends the access token when signed in; see session.ts.
    response = await authFetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'Could not reach the aircraft database. Check your connection and try again.', null);
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string')
      ? body.message
      : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

/** Standard values for a model; null when none is known or could be suggested. */
export async function fetchStandard(code: string, name?: string): Promise<StandardTypeResponse | null> {
  const params = new URLSearchParams({ code });
  if (name) params.set('name', name);
  try {
    return await request<StandardTypeResponse>(`/api/aircraft-types/standard?${params}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function previewImport(body: AirframeImportRequest): Promise<ImportPreviewResponse> {
  return request<ImportPreviewResponse>('/api/airframe-imports/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Throws ApiError 422 (body: UnacknowledgedAlertsBody) if an alert was not acknowledged. */
export function confirmImport(body: AirframeImportRequest): Promise<ImportResult> {
  return request<ImportResult>('/api/airframe-imports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** The signed-in user's own aircraft and chosen club aircraft; empty when signed out. */
export function fetchAirframes(): Promise<AirframeView[]> {
  return request<AirframeView[]>('/api/airframes');
}

/** The generic version of each model. Public. */
export function fetchGenericTypes(): Promise<GenericTypeView[]> {
  return request<GenericTypeView[]>('/api/aircraft-types/generic');
}

/** Clubs and which of their aircraft the signed-in user shows. */
export function fetchClubs(): Promise<ClubView[]> {
  return request<ClubView[]>('/api/clubs');
}

/** Replaces the signed-in user's club selection; returns the updated clubs. */
export function saveClubSelection(body: ClubSelectionRequest): Promise<ClubView[]> {
  return request<ClubView[]>('/api/clubs/selection', { method: 'PUT', body: JSON.stringify(body) });
}

/** Airports by code, name or town. Public. */
export function searchAirports(query: string): Promise<AirportInfo[]> {
  return request<AirportInfo[]>(`/api/airports?${new URLSearchParams({ q: query })}`);
}

export function nearestAirports(lat: number, lon: number): Promise<NearbyAirport[]> {
  return request<NearbyAirport[]>(`/api/airports/nearest?${new URLSearchParams({ lat: String(lat), lon: String(lon) })}`);
}

/** METAR/TAF for departure, waypoints, arrival and stations about every 100 NM along each leg. Public. */
export function fetchRouteWeather(from: string, to: string, via: string[] = []): Promise<RouteWeather> {
  const params = new URLSearchParams({ from, to });
  if (via.length > 0) params.set('via', via.join(','));
  return request<RouteWeather>(`/api/weather/route?${params}`);
}

/** The signed-in user's saved routes. */
export function listRoutes(): Promise<SavedRoute[]> {
  return request<SavedRoute[]>('/api/routes');
}

export function createRoute(name: string, airports: string[]): Promise<SavedRoute> {
  return request<SavedRoute>('/api/routes', { method: 'POST', body: JSON.stringify({ name, airports }) });
}

export function updateRoute(id: number, name: string, airports: string[]): Promise<SavedRoute> {
  return request<SavedRoute>(`/api/routes/${id}`, { method: 'PUT', body: JSON.stringify({ name, airports }) });
}

export function deleteRoute(id: number): Promise<void> {
  return request<void>(`/api/routes/${id}`, { method: 'DELETE' });
}

/** Turns on the share link (keeps an existing one). */
export function shareRoute(id: number): Promise<SavedRoute> {
  return request<SavedRoute>(`/api/routes/${id}/share`, { method: 'POST' });
}

/** Turns the share link off; it stops working. */
export function unshareRoute(id: number): Promise<SavedRoute> {
  return request<SavedRoute>(`/api/routes/${id}/share`, { method: 'DELETE' });
}

/** A route shared by link. Public. */
export function fetchSharedRoute(token: string): Promise<SharedRoute> {
  return request<SharedRoute>(`/api/shared-routes/${encodeURIComponent(token)}`);
}

/** What the signed-in user may administer (nothing, for most). */
export function fetchAdminAccess(): Promise<AdminAccess> {
  return request<AdminAccess>('/api/admin/access');
}

/** Members the signed-in admin manages, optionally searched and/or of one club. */
export function listMembers(query?: string, clubId?: number): Promise<MemberView[]> {
  const params = new URLSearchParams();
  if (query?.trim()) params.set('q', query.trim());
  if (clubId !== undefined) params.set('clubId', String(clubId));
  const qs = params.toString();
  return request<MemberView[]>(`/api/admin/users${qs ? `?${qs}` : ''}`);
}

export function inviteMember(body: InviteRequest): Promise<InviteResponse> {
  return request<InviteResponse>('/api/admin/invites', { method: 'POST', body: JSON.stringify(body) });
}

/** A password reset link, or the invite again for someone who never finished signing up. */
export function sendPasswordLink(userId: number): Promise<PasswordLinkResponse> {
  return request<PasswordLinkResponse>(`/api/admin/users/${userId}/password-link`, { method: 'POST' });
}

export function setMemberDisabled(userId: number, disabled: boolean): Promise<MemberView> {
  return request<MemberView>(`/api/admin/users/${userId}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' });
}

export async function deleteMember(userId: number): Promise<void> {
  await request<void>(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

/** Adds to the club or changes the role there (site admins). */
export function setClubRole(clubId: number, userId: number, role: ClubRole): Promise<MemberView> {
  return request<MemberView>(`/api/admin/clubs/${clubId}/members/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

export function removeFromClub(clubId: number, userId: number): Promise<MemberView> {
  return request<MemberView>(`/api/admin/clubs/${clubId}/members/${userId}`, { method: 'DELETE' });
}
