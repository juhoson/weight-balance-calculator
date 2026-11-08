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

// Empty = same origin; in development package.json's "proxy" forwards /api to the backend.
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
