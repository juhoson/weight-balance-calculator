import { authFetch, session, type SessionUser } from './session';
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
import type { AerodromeInfo, AirportInfo, AirspaceView, MapArea, NearbyAirport, PointInfo, RouteWeather, SavedRoute, SharedRoute } from '../types/route';
import type { RouteAltitudes } from '../lib/route';
import type { ClubName, MyClub } from '../types/profile';
import type { ChangeView, ClubAircraft, EditPreviewResponse } from '../types/clubAircraft';

// The backend's address: set at build time for production, from .env.development for npm start.
// Empty = same origin.
const API_BASE = process.env.REACT_APP_API_URL ?? '';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit, onHeaders?: (headers: Headers) => void): Promise<T> {
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
  if (response.headers) onHeaders?.(response.headers);
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

/**
 * The signed-in user's own aircraft and chosen club aircraft; signed out, every club's aircraft.
 * With a club code (a club link, ?club=vfk): just that club's aircraft, for anyone.
 */
export function fetchAirframes(club?: string | null): Promise<AirframeView[]> {
  return request<AirframeView[]>(club ? `/api/airframes?${new URLSearchParams({ club })}` : '/api/airframes');
}

export interface MapStatus {
  /** False when the server has no openAIP key: the map then shows the route only. */
  airspace: boolean;
  minZoom: number;
  maxZoom: number;
  /** The self-hosted base map (vector tiles), when the server has one: its zooms and [west, south, east, north]. */
  basemap?: { minZoom: number; maxZoom: number; bounds: [number, number, number, number] };
}

/** Whether the route map's airspace overlay is available. Public. */
export function fetchMapStatus(): Promise<MapStatus> {
  return request<MapStatus>('/api/map/status');
}

/** The airspaces near a route (departure, waypoints, arrival in order). Public. */
/**
 * Bumped when the airspace answers change shape: browsers keep them for an hour, and an answer
 * from before frequencies existed crashed the new code (2026-11-24).
 */
const AIRSPACE_API_VERSION = '3';

/** Missing lists as empty, so an answer from an older backend can't break the page. */
function normalizeAirspace(a: AirspaceView): AirspaceView {
  return { ...a, frequencies: Array.isArray(a.frequencies) ? a.frequencies : [], polygon: Array.isArray(a.polygon) ? a.polygon : [] };
}

const fetchedAt = new WeakMap<AirspaceView[], number>();

/** When the server gave this list (its Date header), so an answer kept offline shows its own age. */
export const airspacesFetchedAt = (list: AirspaceView[] | null | undefined): number | null => (list && fetchedAt.get(list)) ?? null;

export async function fetchAirspacesAlong(points: Array<{ lat: number; lon: number }>): Promise<AirspaceView[]> {
  const route = points.map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  let date: number | null = null;
  const list = await request<AirspaceView[]>(`/api/map/airspaces?${new URLSearchParams({ route, v: AIRSPACE_API_VERSION })}`,
    undefined, h => { const d = Date.parse(h?.get('Date') ?? ''); date = Number.isFinite(d) ? d : null; });
  const out = Array.isArray(list) ? list.map(normalizeAirspace) : [];
  fetchedAt.set(out, date ?? Date.now());
  return out;
}

/** An aerodrome's circuits and visual reporting points. Public. */
export function fetchAerodrome(code: string): Promise<AerodromeInfo> {
  return request<AerodromeInfo>(`/api/map/aerodrome/${encodeURIComponent(code)}`);
}

/** The signed-in user accepts the navigation mode's terms; the account (and this device) keeps it. */
export async function acceptNavTerms(version: number): Promise<SessionUser> {
  const user = await request<SessionUser>('/api/users/me/nav-terms', { method: 'POST', body: JSON.stringify({ version }) });
  session.updateUser(user);
  return user;
}

/** A flight the navigation mode recorded (signed in): stored without its points. */
export interface FlightTrack {
  id: number;
  name: string;
  startedAt: string;
  endedAt: string;
  distanceNm: number;
  pointCount: number;
}

export interface TrackPoint { lat: number; lon: number; altFt: number | null; at: number }

export function saveTrack(name: string, points: TrackPoint[]): Promise<FlightTrack> {
  return request<FlightTrack>('/api/tracks', { method: 'POST', body: JSON.stringify({ name, points }) });
}

export function listTracks(): Promise<FlightTrack[]> {
  return request<FlightTrack[]>('/api/tracks');
}

export async function deleteTrack(id: number): Promise<void> {
  await request<void>(`/api/tracks/${id}`, { method: 'DELETE' });
}

/** Saves the flight's KML (for Google Earth) to the device. */
export async function downloadTrackKml(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/tracks/${id}/kml`);
  if (!res.ok) throw new ApiError(res.status, 'Could not download the flight.', null);
  const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `flight-${id}.kml`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The airports in a part of the map (at most 5° north to south) and their reporting points. Public. */
export async function fetchMapArea(south: number, west: number, north: number, east: number): Promise<MapArea> {
  const f = (n: number) => n.toFixed(2);
  const area = await request<MapArea>(`/api/map/area?${new URLSearchParams({ south: f(south), west: f(west), north: f(north), east: f(east) })}`);
  return {
    airports: Array.isArray(area.airports) ? area.airports : [],
    reportingPoints: Array.isArray(area.reportingPoints) ? area.reportingPoints : [],
    complete: area.complete !== false,
    reportingPointsAvailable: !!area.reportingPointsAvailable,
  };
}

/** The airspaces above a point and the nearest airports' frequencies. Public. */
export async function fetchPointInfo(lat: number, lon: number): Promise<PointInfo> {
  const info = await request<PointInfo>(`/api/map/here?${new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), v: AIRSPACE_API_VERSION })}`);
  return {
    ...info,
    airspaces: (info.airspaces ?? []).map(normalizeAirspace),
    airports: (info.airports ?? []).map(a => ({ ...a, frequencies: Array.isArray(a.frequencies) ? a.frequencies : [] })),
  };
}

/** Leaflet URL template for the airspace overlay (openAIP, proxied by the backend). */
export const AIRSPACE_TILE_URL = `${API_BASE}/api/map/airspace/{z}/{x}/{y}.png`;
/** The self-hosted base map's vector tiles (see MapStatus.basemap). */
export const BASEMAP_TILE_URL = `${API_BASE}/api/map/base/{z}/{x}/{y}.mvt`;

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

/** Airports or ICAO positions (5930N01700E) by code; unknown ones are left out. */
export function lookupAirports(codes: string[]): Promise<AirportInfo[]> {
  return request<AirportInfo[]>(`/api/airports/lookup?${new URLSearchParams({ codes: codes.join(',') })}`);
}

/** Every airfield within `nm` of a route (at most 30), nearest the route first, with runways. Public. */
export async function fetchAirportsAlong(points: Array<{ lat: number; lon: number }>, nm = 25): Promise<AirportInfo[]> {
  const route = points.map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  const list = await request<AirportInfo[]>(`/api/airports/along?${new URLSearchParams({ route, nm: String(nm) })}`);
  return Array.isArray(list) ? list.map(a => ({ ...a, runways: Array.isArray(a.runways) ? a.runways : [] })) : [];
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

/** With the cruise altitude and the altitude changes, when given. */
export function createRoute(name: string, airports: string[], altitudes?: RouteAltitudes): Promise<SavedRoute> {
  return request<SavedRoute>('/api/routes', { method: 'POST', body: JSON.stringify({ name, airports, ...altitudes }) });
}

export function updateRoute(id: number, name: string, airports: string[], altitudes?: RouteAltitudes): Promise<SavedRoute> {
  return request<SavedRoute>(`/api/routes/${id}`, { method: 'PUT', body: JSON.stringify({ name, airports, ...altitudes }) });
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

/** Every club, with the signed-in user's role in each (null when not a member). */
export function fetchMyClubs(): Promise<MyClub[]> {
  return request<MyClub[]>('/api/users/me/clubs');
}

/** Joins as a member; also shows the club's aircraft unless the user already chose some. */
export function joinClub(clubId: number): Promise<MyClub[]> {
  return request<MyClub[]>(`/api/users/me/clubs/${clubId}`, { method: 'PUT' });
}

export function leaveClub(clubId: number): Promise<MyClub[]> {
  return request<MyClub[]>(`/api/users/me/clubs/${clubId}`, { method: 'DELETE' });
}

/** Club names for the registration form. Public; an empty list if they can't be loaded. */
export async function fetchClubNames(): Promise<ClubName[]> {
  try {
    return await request<ClubName[]>('/api/auth/clubs');
  } catch {
    return [];
  }
}

/** A club's aircraft, for its admins. */
export function listClubAircraft(clubId: number): Promise<ClubAircraft[]> {
  return request<ClubAircraft[]>(`/api/admin/clubs/${clubId}/aircraft`);
}

/** Adds an aircraft to the club; 422 until every alert is acknowledged, 409 for a registration in use. */
export function addClubAircraft(clubId: number, body: AirframeImportRequest): Promise<ImportResult> {
  return request<ImportResult>(`/api/admin/clubs/${clubId}/aircraft`, { method: 'POST', body: JSON.stringify(body) });
}

/** What an edit would change, and how the new values compare with the standard. */
export function previewClubAircraftEdit(clubId: number, airframeId: number, body: AirframeImportRequest): Promise<EditPreviewResponse> {
  return request<EditPreviewResponse>(`/api/admin/clubs/${clubId}/aircraft/${airframeId}/preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateClubAircraft(clubId: number, airframeId: number, body: AirframeImportRequest): Promise<ImportResult> {
  return request<ImportResult>(`/api/admin/clubs/${clubId}/aircraft/${airframeId}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function removeClubAircraft(clubId: number, airframeId: number): Promise<void> {
  await request<void>(`/api/admin/clubs/${clubId}/aircraft/${airframeId}`, { method: 'DELETE' });
}

/** The club's aircraft change log, newest first. */
export function listClubAircraftChanges(clubId: number): Promise<ChangeView[]> {
  return request<ChangeView[]>(`/api/admin/clubs/${clubId}/aircraft-changes`);
}

/** An aircraft near the pilot (ADS-B, adsb.lol): see the backend's TrafficView. */
export interface Traffic {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  lat: number;
  lon: number;
  /** True altitude, ft MSL; null on the ground or unknown. */
  altFt: number | null;
  altFromPressure: boolean;
  onGround: boolean;
  gsKt: number | null;
  trackDeg: number | null;
  vsFpm: number | null;
  seenS: number;
}

/** The traffic within `nm` of a point (signed in). */
export function fetchTraffic(lat: number, lon: number, nm = 10): Promise<Traffic[]> {
  return request<Traffic[]>(`/api/traffic?${new URLSearchParams({ lat: lat.toFixed(3), lon: lon.toFixed(3), nm: String(nm) })}`)
    .then(list => (Array.isArray(list) ? list : []));
}
