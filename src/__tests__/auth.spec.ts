import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const oidc = vi.hoisted(() => {
  const handlers: Record<string, (user?: unknown) => unknown> = {};
  const manager = {
    getUser: vi.fn(),
    signinSilent: vi.fn(),
    signinRedirect: vi.fn(),
    signinCallback: vi.fn(),
    removeUser: vi.fn(),
    stopSilentRenew: vi.fn(),
    events: {
      addUserLoaded: vi.fn((fn) => {
        handlers.loaded = fn;
      }),
      addUserUnloaded: vi.fn((fn) => {
        handlers.unloaded = fn;
      }),
      addAccessTokenExpired: vi.fn((fn) => {
        handlers.expired = fn;
      }),
      addSilentRenewError: vi.fn((fn) => {
        handlers.error = fn;
      }),
    },
  };
  return { handlers, manager, settings: vi.fn() };
});
vi.mock('oidc-client-ts', () => ({
  UserManager: class {
    constructor(settings: unknown) {
      oidc.settings(settings);
      Object.assign(this, oidc.manager);
    }
  },
  WebStorageStateStore: class {},
}));

const session = {
  access_token: 'valid',
  expired: false,
  profile: { sub: 'member', email: 'member@test', name: 'Member' },
};
const originalUrl = window.location.href;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('BASE_URL', '/');
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  oidc.manager.getUser.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', originalUrl);
  vi.doUnmock('@/configuration');
});

async function setup(authenticated = true) {
  vi.doMock('@/configuration', () => ({
    api: {
      rocrate: { endpoint: '/api' },
      oidc: authenticated ? { clientId: 'portal', endpoint: 'https://idp.test', scope: 'openid email' } : undefined,
    },
  }));
  const { createPinia, setActivePinia } = await import('pinia');
  setActivePinia(createPinia());
  const auth = await import('@/services/auth');
  const { useAuthStore } = await import('@/stores/auth');
  return { auth, store: useAuthStore() };
}

it('starts anonymously with no OIDC manager, token lookup, or redirect', async () => {
  const { auth } = await setup(false);
  await auth.initAuth();
  await auth.authReady;
  expect(await auth.getUser()).toBeUndefined();
  expect(await auth.getValidAccessToken()).toBeUndefined();
  expect(await auth.forceRenewToken()).toBeUndefined();
  expect(await auth.handleCallback()).toBeUndefined();
  await auth.login();
  await auth.logout();
  expect(oidc.settings).not.toHaveBeenCalled();
});

it('hydrates a valid user and removes legacy persisted auth', async () => {
  const { auth, store } = await setup();
  localStorage.setItem('auth', 'stale');
  oidc.manager.getUser.mockResolvedValue(session);
  await auth.initAuth();
  await auth.authReady;
  expect(store.user).toMatchObject({ email: 'member@test', accessToken: 'valid' });
  expect(store.isLoggedIn).toBe(true);
  expect(localStorage.getItem('auth')).toBeNull();
  expect(await auth.getValidAccessToken()).toBe('valid');
  expect(oidc.manager.signinSilent).not.toHaveBeenCalled();
});

it('renews an expired session and lets the loaded event hydrate Pinia', async () => {
  const { auth, store } = await setup();
  oidc.manager.getUser.mockResolvedValue({ ...session, expired: true });
  oidc.manager.signinSilent.mockImplementation(async () => {
    oidc.handlers.loaded?.(session);
    return session;
  });
  await auth.initAuth();
  expect(oidc.manager.signinSilent).toHaveBeenCalledTimes(1);
  expect(store.isLoggedIn).toBe(true);
  expect(store.user?.accessToken).toBe('valid');
  await oidc.handlers.unloaded?.();
  expect(store.user).toBeUndefined();
  expect(store.isLoggedIn).toBe(false);
});

it('resolves startup readiness even when stored-session lookup fails', async () => {
  const { auth } = await setup();
  oidc.manager.getUser.mockRejectedValue(new Error('storage unavailable'));
  await expect(auth.initAuth()).rejects.toThrow('storage unavailable');
  await auth.authReady;
});

it('skips silent renewal without a session and resets all Pinia session fields', async () => {
  const { auth, store } = await setup();
  store.isLoggedIn = true;
  store.user = { email: 'stale@test', accessToken: 'old' };
  store.loginTermsUrl = '/old-terms';
  expect(await auth.forceRenewToken()).toBeUndefined();
  expect(oidc.manager.signinSilent).not.toHaveBeenCalled();
  expect(oidc.manager.signinRedirect).toHaveBeenCalledTimes(1);
  expect(store.isLoggedIn).toBe(false);
  expect(store.user).toBeUndefined();
  expect(store.loginTermsUrl).toBeUndefined();
});

it.each(['expired', 'error'])('preserves reset and one login redirect on the %s event', async (event) => {
  const { auth, store } = await setup();
  oidc.manager.getUser.mockResolvedValue(session);
  await auth.initAuth();
  expect(store.isLoggedIn).toBe(true);
  oidc.manager.signinSilent.mockRejectedValue(new Error('renewal failed'));
  oidc.handlers[event]?.();
  oidc.handlers.error?.();
  await vi.waitFor(() => expect(oidc.manager.signinRedirect).toHaveBeenCalledTimes(1));
  expect(store.isLoggedIn).toBe(false);
});

describe.each(['/', '/portal/'])('OIDC routes at %s', (base) => {
  it('keeps the return path/query relative to the deployment base and coalesces redirects', async () => {
    vi.stubEnv('BASE_URL', base);
    window.history.replaceState(null, '', `${base}file?id=a%2Fb&start=9`);
    const { auth } = await setup();
    await Promise.all([auth.login(), auth.login()]);
    expect(oidc.settings).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'portal',
        redirect_uri: `${window.location.origin}${base}auth/callback`,
      }),
    );
    expect(oidc.manager.signinRedirect).toHaveBeenCalledExactlyOnceWith({
      state: { returnPath: '/file?id=a%2Fb&start=9' },
    });
  });

  it('leaves callback hydration to the callback view and preserves its return URL', async () => {
    vi.stubEnv('BASE_URL', base);
    window.history.replaceState(null, '', `${base}auth/callback?code=test&state=test`);
    const { auth } = await setup();
    await auth.initAuth();
    await auth.authReady;
    expect(oidc.manager.getUser).not.toHaveBeenCalled();
    oidc.manager.signinCallback.mockResolvedValue({
      ...session,
      state: { returnPath: '/file?id=a%2Fb&start=9' },
    });
    expect(await auth.handleCallback()).toEqual({
      user: expect.objectContaining({ email: 'member@test', accessToken: 'valid' }),
      returnUrl: '/file?id=a%2Fb&start=9',
    });
  });
});
