// Each test loads a fresh session module, since the session reads localStorage when created.
export {};

const USER = { id: 7, email: 'pilot@example.com', displayName: 'Pilot' };

let tokenCounter = 0;

function jwt(expiresInSeconds: number): string {
  const encode = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = { sub: '7', jti: ++tokenCounter, exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.sig`;
}

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

const auth = (refreshToken: string, expiresIn = 900) => ({ accessToken: jwt(expiresIn), refreshToken, user: USER });

type SessionModule = typeof import('./session');
let fetchMock: jest.Mock;

function load(): SessionModule {
  let mod!: SessionModule;
  jest.isolateModules(() => { mod = require('./session'); });
  return mod;
}

function storedSession() {
  return JSON.parse(localStorage.getItem('auth.session.v1') ?? 'null');
}

/** fetch calls to a given auth endpoint. */
const callsTo = (path: string) => fetchMock.mock.calls.filter(([url]) => String(url).endsWith(path));

beforeEach(() => {
  localStorage.clear();
  fetchMock = jest.fn();
  global.fetch = fetchMock;
});

describe('sign in and out', () => {
  it('keeps the refresh token and profile, never the access token, in storage', async () => {
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(200, auth('r1')));
    await session.signIn('pilot@example.com', 'secret123');

    expect(session.getState().user).toEqual(USER);
    expect(storedSession()).toEqual({ refreshToken: 'r1', user: USER });
    expect(localStorage.getItem('auth.session.v1')).not.toContain('eyJ'); // no JWT stored
  });

  it('reports the server message on a failed sign-in', async () => {
    const { session, AuthError } = load();
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Invalid email or password' }));
    await expect(session.signIn('pilot@example.com', 'wrong')).rejects.toEqual(
      new AuthError(401, 'Invalid email or password'));
    expect(session.getState().user).toBeNull();
  });

  it('signs out locally and revokes the refresh token on the server', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(204, null));
    await session.signOut();

    expect(session.getState().user).toBeNull();
    expect(storedSession()).toBeNull();
    expect(JSON.parse(callsTo('/api/auth/logout')[0][1].body)).toEqual({ refreshToken: 'r1' });
  });

  it('stays signed out even if the logout request fails', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await session.signOut();
    expect(session.getState().user).toBeNull();
  });
});

describe('Google sign-in', () => {
  it('exchanges the Google ID token for a session', async () => {
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(200, { ...auth('r1'), user: { ...USER, pictureUrl: 'https://lh3/photo', hasPassword: false } }));
    const user = await session.signInWithGoogle('google-id-token');

    expect(JSON.parse(callsTo('/api/auth/google')[0][1].body)).toEqual({ idToken: 'google-id-token' });
    expect(user.pictureUrl).toBe('https://lh3/photo');
    expect(session.getState().user?.hasPassword).toBe(false);
  });

  it('surfaces a refused link to an existing account', async () => {
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(409, { message: 'An account with this email already exists. Sign in with your password.' }));
    await expect(session.signInWithGoogle('t')).rejects.toThrow('Sign in with your password');
    expect(session.getState().user).toBeNull();
  });

  it('asks the server once which providers it offers, and falls back to password-only when offline', async () => {
    const mod = load();
    fetchMock.mockResolvedValueOnce(json(200, { google: { clientId: 'abc' } }));
    expect(await mod.fetchAuthProviders()).toEqual({ google: { clientId: 'abc' } });
    expect(await mod.fetchAuthProviders()).toEqual({ google: { clientId: 'abc' } });
    expect(callsTo('/api/auth/providers')).toHaveLength(1);

    const offline = load();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await offline.fetchAuthProviders()).toEqual({ google: null });
  });
});

describe('password reset', () => {
  it('requests a link and sets a new password, clearing this browser\'s session', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(204, null)).mockResolvedValueOnce(json(204, null));

    await session.requestPasswordReset('pilot@example.com');
    await session.resetPassword('tok', 'new password');

    expect(JSON.parse(callsTo('/api/auth/forgot-password')[0][1].body)).toEqual({ email: 'pilot@example.com' });
    expect(JSON.parse(callsTo('/api/auth/reset-password')[0][1].body)).toEqual({ token: 'tok', newPassword: 'new password' });
    expect(session.getState()).toEqual({ user: null, signOutReason: null });
  });

  it('reports an invalid link', async () => {
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(400, { message: 'Invalid or expired reset link' }));
    await expect(session.resetPassword('bad', 'new password')).rejects.toThrow('Invalid or expired reset link');
  });
});

describe('access tokens', () => {
  it('restores a stored session with one refresh, shared by concurrent callers', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    expect(session.getState().user).toEqual(USER); // signed in before any network call
    fetchMock.mockResolvedValueOnce(json(200, auth('r2')));

    const [a, b, c] = await Promise.all([session.getAccessToken(), session.getAccessToken(), session.getAccessToken()]);
    expect(a).toBeTruthy();
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(callsTo('/api/auth/refresh')).toHaveLength(1);
    expect(storedSession().refreshToken).toBe('r2'); // rotated
  });

  it('reuses a valid access token and refreshes one about to expire', async () => {
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(200, auth('r1', 900)));
    await session.signIn('pilot@example.com', 'secret123');
    await session.getAccessToken();
    expect(callsTo('/api/auth/refresh')).toHaveLength(0);

    fetchMock.mockResolvedValueOnce(json(200, auth('r2', 10)));
    await session.forceRefresh(); // now holds a token with 10 s left
    fetchMock.mockResolvedValueOnce(json(200, auth('r3', 900)));
    await session.getAccessToken();
    expect(callsTo('/api/auth/refresh')).toHaveLength(2);
  });

  it('explains a sign-out caused by a newer sign-in elsewhere', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(401, { message: 'DEVICE_LIMIT' }));

    expect(await session.getAccessToken()).toBeNull();
    expect(session.getState()).toEqual({ user: null, signOutReason: 'DEVICE_LIMIT' });
    expect(storedSession()).toBeNull();
  });

  it('treats any other rejected refresh as an expired session', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Refresh token expired or revoked' }));
    await session.getAccessToken();
    expect(session.getState().signOutReason).toBe('EXPIRED');
  });

  it('adopts a token another tab already rotated instead of signing out', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    fetchMock.mockImplementationOnce(async () => {
      // Meanwhile another tab used r1 and stored its replacement r2.
      localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r2', user: USER }));
      return json(401, { message: 'Refresh token expired or revoked' });
    });
    fetchMock.mockResolvedValueOnce(json(200, auth('r3')));

    expect(await session.getAccessToken()).toBeTruthy();
    expect(session.getState().user).toEqual(USER);
    expect(JSON.parse(callsTo('/api/auth/refresh')[1][1].body)).toEqual({ refreshToken: 'r2' });
    expect(storedSession().refreshToken).toBe('r3');
  });

  it('stays signed in when offline or the server is busy', async () => {
    localStorage.setItem('auth.session.v1', JSON.stringify({ refreshToken: 'r1', user: USER }));
    const { session } = load();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await session.getAccessToken()).toBeNull();
    fetchMock.mockResolvedValueOnce(json(429, {}));
    expect(await session.getAccessToken()).toBeNull();
    expect(session.getState().user).toEqual(USER);
    expect(storedSession().refreshToken).toBe('r1');
  });
});

describe('authFetch', () => {
  it('sends no Authorization header when signed out', async () => {
    const { authFetch } = load();
    fetchMock.mockResolvedValueOnce(json(200, []));
    await authFetch('/api/airframes');
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  it('attaches the token, and on a 401 refreshes once and retries', async () => {
    const { session, authFetch } = load();
    fetchMock.mockResolvedValueOnce(json(200, auth('r1')));
    await session.signIn('pilot@example.com', 'secret123');

    fetchMock
      .mockResolvedValueOnce(json(401, {}))           // token rejected (e.g. revoked)
      .mockResolvedValueOnce(json(200, auth('r2')))   // refresh
      .mockResolvedValueOnce(json(201, { ok: true })); // retried request
    const response = await authFetch('/api/airframe-imports', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

    expect(response.status).toBe(201);
    const apiCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/airframe-imports');
    expect(apiCalls).toHaveLength(2);
    expect(apiCalls[0][1].headers.Authorization).toMatch(/^Bearer /);
    expect(apiCalls[1][1].headers.Authorization).not.toBe(apiCalls[0][1].headers.Authorization);
    expect(apiCalls[1][1].headers['Content-Type']).toBe('application/json');
  });
});
