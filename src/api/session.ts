// Sign-in session for the weight-balance-backend JWT auth (ported from cellarmate).
//
// - The access token (15 min) lives only in memory.
// - The refresh token and the user's public profile are kept in localStorage so a reload stays
//   signed in. Refresh tokens rotate: each refresh returns a new one and revokes the old.
// - Refreshes are single-flight within a tab. Across tabs, a 401 on refresh first checks whether
//   another tab already rotated the token (it is then in storage) before signing out.

const API_BASE = process.env.REACT_APP_API_URL ?? '';
const STORAGE_KEY = 'auth.session.v1';
/** Refresh this long before the access token expires. */
const EXPIRY_MARGIN_MS = 30_000;

export interface SessionUser {
  id: number;
  email: string;
  displayName: string;
  /** Google profile photo, for accounts that have signed in with Google. */
  pictureUrl?: string | null;
  /** False for a Google-only account. */
  hasPassword?: boolean;
}

export interface AuthProviders {
  /** Null when Google sign-in is not configured on the server. */
  google: { clientId: string } | null;
}

let providersPromise: Promise<AuthProviders> | null = null;

/** Which sign-in methods the server offers. Fetched once; on failure, password only. */
export function fetchAuthProviders(): Promise<AuthProviders> {
  if (!providersPromise) {
    providersPromise = fetch(`${API_BASE}/api/auth/providers`)
      .then(r => (r.ok ? r.json() : { google: null }))
      .catch(() => {
        providersPromise = null; // try again next time, e.g. after coming back online
        return { google: null };
      });
  }
  return providersPromise as Promise<AuthProviders>;
}

/** Why the session ended without the user signing out. */
export type SignOutReason = 'DEVICE_LIMIT' | 'EXPIRED' | null;

export interface SessionState {
  user: SessionUser | null;
  signOutReason: SignOutReason;
}

interface StoredSession {
  refreshToken: string;
  user: SessionUser;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export class AuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed && typeof parsed.refreshToken === 'string' && parsed.user ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the session still works until the page is closed.
  }
}

/** Expiry of a JWT in ms since epoch, or 0 if it can't be read. Not verified - only the server does that. */
function expiryOf(token: string): number {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload)) as { exp?: number };
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function postAuth(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string' && body.message) return body.message;
  } catch {
    // not JSON
  }
  return fallback;
}

class Session {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private stored: StoredSession | null = readStored();
  private signOutReason: SignOutReason = null;
  private refreshing: Promise<string | null> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: SessionState = { user: this.stored?.user ?? null, signOutReason: null };

  constructor() {
    if (typeof window !== 'undefined') {
      // Another tab signed in, out, or rotated the refresh token.
      window.addEventListener('storage', event => {
        if (event.key !== STORAGE_KEY) return;
        const next = readStored();
        const userChanged = next?.user.id !== this.stored?.user.id;
        this.stored = next;
        if (userChanged) {
          this.accessToken = null;
          this.emit();
        }
      });
    }
  }

  // ---- State for React (useSyncExternalStore) ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getState = (): SessionState => this.snapshot;

  private emit(): void {
    this.snapshot = { user: this.stored?.user ?? null, signOutReason: this.signOutReason };
    this.listeners.forEach(l => l());
  }

  // ---- Sign in / out ----

  async signIn(email: string, password: string): Promise<SessionUser> {
    return this.start(await postAuth('login', { email, password }), 'Sign-in failed.');
  }

  /** Signs in with the ID token Google Identity Services gave the browser; creates the account on first use. */
  async signInWithGoogle(idToken: string): Promise<SessionUser> {
    return this.start(await postAuth('google', { idToken }), 'Google sign-in failed.');
  }

  async register(email: string, password: string, displayName: string): Promise<SessionUser> {
    return this.start(await postAuth('register', { email, password, displayName }), 'Could not create the account.');
  }

  private async start(response: Response, fallback: string): Promise<SessionUser> {
    if (!response.ok) {
      throw new AuthError(response.status, await messageOf(response, fallback));
    }
    const auth = (await response.json()) as AuthResponse;
    this.accept(auth);
    this.signOutReason = null;
    this.emit();
    return auth.user;
  }

  /** Emails a reset link if the address has an account. Resolves the same either way. */
  async requestPasswordReset(email: string): Promise<void> {
    const response = await postAuth('forgot-password', { email });
    if (!response.ok) {
      throw new AuthError(response.status, await messageOf(response, 'Could not send the reset email.'));
    }
  }

  /**
   * Sets a new password from an emailed link. The server signs the account out everywhere, so
   * this browser's session (if any) is cleared too.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const response = await postAuth('reset-password', { token, newPassword });
    if (!response.ok) {
      throw new AuthError(response.status, await messageOf(response, 'Could not reset the password.'));
    }
    if (this.stored) this.clear(null);
  }

  async signOut(): Promise<void> {
    const refreshToken = this.stored?.refreshToken;
    this.clear(null);
    // Stop Google from silently signing the same account back in.
    try { window.google?.accounts.id.disableAutoSelect(); } catch { /* not loaded */ }
    if (refreshToken) {
      // Best effort: revoke server-side. Signed out locally either way.
      try { await postAuth('logout', { refreshToken }); } catch { /* offline */ }
    }
  }

  private accept(auth: AuthResponse): void {
    this.accessToken = auth.accessToken;
    this.accessExpiresAt = expiryOf(auth.accessToken);
    this.stored = { refreshToken: auth.refreshToken, user: auth.user };
    writeStored(this.stored);
  }

  private clear(reason: SignOutReason): void {
    this.accessToken = null;
    this.accessExpiresAt = 0;
    this.stored = null;
    this.signOutReason = reason;
    writeStored(null);
    this.emit();
  }

  // ---- Tokens ----

  /** A usable access token, refreshing if needed; null when signed out or offline. */
  async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.accessExpiresAt - EXPIRY_MARGIN_MS) {
      return this.accessToken;
    }
    return this.refresh();
  }

  /** Forget the access token (e.g. the server rejected it) and get a new one. */
  async forceRefresh(): Promise<string | null> {
    this.accessToken = null;
    return this.refresh();
  }

  private refresh(): Promise<string | null> {
    if (!this.stored) return Promise.resolve(null);
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  private async doRefresh(): Promise<string | null> {
    const used = this.stored?.refreshToken;
    if (!used) return null;
    let response: Response;
    try {
      response = await postAuth('refresh', { refreshToken: used });
    } catch {
      return null; // offline: stay signed in, try again later
    }
    if (response.ok) {
      const auth = (await response.json()) as AuthResponse;
      this.accept(auth);
      this.emit();
      return auth.accessToken;
    }
    if (response.status === 401) {
      // Another tab may have rotated the token we just used; theirs is then in storage.
      const latest = readStored();
      if (latest && latest.refreshToken !== used) {
        this.stored = latest;
        return this.doRefresh();
      }
      const message = await messageOf(response, '');
      this.clear(message === 'DEVICE_LIMIT' ? 'DEVICE_LIMIT' : 'EXPIRED');
      return null;
    }
    return null; // 429/5xx: keep the session, the next call retries
  }

  /** Clears the "why were you signed out" notice once shown. */
  dismissSignOutReason(): void {
    if (this.signOutReason) {
      this.signOutReason = null;
      this.emit();
    }
  }
}

export const session = new Session();

/**
 * fetch with the access token attached when signed in. If the server still answers 401 (token
 * revoked or clock skew), refreshes once and retries.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withToken = (token: string | null): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const token = await session.getAccessToken();
  const response = await fetch(input, withToken(token));
  if (response.status !== 401 || !token) return response;
  const fresh = await session.forceRefresh();
  return fresh ? fetch(input, withToken(fresh)) : response;
}
