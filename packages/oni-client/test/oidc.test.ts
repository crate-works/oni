import { beforeEach, describe, expect, it, vi } from 'vitest';

const oidc = vi.hoisted(() => {
  const handlers: Record<string, (user?: unknown) => unknown> = {};
  const on = (name: string) =>
    vi.fn((fn: (user?: unknown) => unknown) => {
      handlers[name] = fn;
    });
  const manager = {
    getUser: vi.fn(),
    signinSilent: vi.fn(),
    signinRedirect: vi.fn(),
    signinCallback: vi.fn(),
    removeUser: vi.fn(),
    stopSilentRenew: vi.fn(),
    events: {
      addUserLoaded: on('loaded'),
      addUserUnloaded: on('unloaded'),
      addAccessTokenExpired: on('expired'),
      addSilentRenewError: on('error'),
      removeUserLoaded: vi.fn(),
      removeUserUnloaded: vi.fn(),
      removeAccessTokenExpired: vi.fn(),
      removeSilentRenewError: vi.fn(),
    },
  };
  return { handlers, manager, settings: vi.fn(), stores: vi.fn() };
});
vi.mock('oidc-client-ts', () => ({
  UserManager: class {
    constructor(settings: unknown) {
      oidc.settings(settings);
      Object.assign(this, oidc.manager);
    }
  },
  WebStorageStateStore: class {
    constructor(options: unknown) {
      oidc.stores(options);
    }
  },
}));

const { createOidcSession, safeReturnPath } = await import('../src/oidc.js');

const user = (token = 'valid', expired = false, state?: unknown) => ({
  access_token: token,
  expired,
  expires_at: 2_000_000_000,
  state,
  profile: { sub: 'u1', email: 'member@test', name: 'Member Name', given_name: 'Member', family_name: 'Name' },
});
const storage = {} as Storage;
let location = { pathname: '/', search: '', hash: '' };
const session = (options: Partial<Parameters<typeof createOidcSession>[0]> = {}) =>
  createOidcSession({
    authority: 'https://idp.test',
    clientId: 'portal',
    redirectUri: 'https://portal.test/auth/callback',
    storage,
    location: () => location,
    ...options,
  });

beforeEach(() => {
  vi.resetAllMocks();
  location = { pathname: '/', search: '', hash: '' };
  oidc.manager.getUser.mockResolvedValue(null);
  oidc.manager.removeUser.mockResolvedValue(undefined);
  oidc.manager.signinRedirect.mockResolvedValue(undefined);
});

describe('safeReturnPath', () => {
  it.each([
    ['/search?q=a#top', '/search?q=a#top'],
    ['//evil.test/path', '/'],
    ['/\\evil.test', '/'],
    ['https://evil.test', '/'],
    ['/a\nb', '/'],
    ['/\t/evil.test', '/'],
    [undefined, '/'],
    [{ path: '/' }, '/'],
  ])('maps %j to %j', (value, expected) => {
    expect(safeReturnPath(value)).toBe(expected);
  });
});

describe('createOidcSession', () => {
  it('configures PKCE code flow with per-tab storage and safe defaults', () => {
    session();
    expect(oidc.settings).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: 'https://idp.test',
        client_id: 'portal',
        redirect_uri: 'https://portal.test/auth/callback',
        response_type: 'code',
        scope: 'openid profile email',
        automaticSilentRenew: true,
      }),
    );
    expect(oidc.stores).toHaveBeenCalledTimes(2);
    expect(oidc.stores).toHaveBeenCalledWith({ store: storage, prefix: 'oidc.' });
  });

  it('lets portals override scope, storage and raw oidc-client-ts settings', () => {
    session({
      scope: 'openid email',
      storagePrefix: 'p.',
      automaticSilentRenew: false,
      settings: { loadUserInfo: true },
    });
    expect(oidc.settings).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'openid email', automaticSilentRenew: false, loadUserInfo: true }),
    );
    expect(oidc.stores).toHaveBeenCalledWith({ store: storage, prefix: 'p.' });
  });

  it('hydrates a stored user, notifies subscribers once and keeps snapshots stable', async () => {
    const s = session();
    const listener = vi.fn();
    s.subscribe(listener);
    expect(s.getState()).toEqual({ status: 'loading' });
    oidc.manager.getUser.mockResolvedValue(user());
    await s.init();
    await s.ready;
    const snapshot = s.getState();
    expect(snapshot).toEqual({
      status: 'authenticated',
      user: {
        subject: 'u1',
        email: 'member@test',
        name: 'Member Name',
        firstName: 'Member',
        lastName: 'Name',
        accessToken: 'valid',
        expiresAt: 2_000_000_000,
      },
    });
    oidc.handlers.loaded?.(user());
    expect(s.getState()).toBe(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await s.getAccessToken()).toBe('valid');
    expect(oidc.manager.signinSilent).not.toHaveBeenCalled();
  });

  it('starts anonymous without a stored user and never redirects on its own', async () => {
    const s = session();
    await s.init();
    expect(s.getState()).toEqual({ status: 'anonymous' });
    expect(await s.getAccessToken()).toBeUndefined();
    expect(await s.getUser()).toBeUndefined();
    expect(oidc.manager.signinRedirect).not.toHaveBeenCalled();
  });

  it('renews an expired stored session during init', async () => {
    const s = session();
    oidc.manager.getUser.mockResolvedValue(user('old', true));
    oidc.manager.signinSilent.mockResolvedValue(user('new'));
    await s.init();
    expect(s.getState().user?.accessToken).toBe('new');
  });

  it('settles readiness and reports anonymous when storage fails', async () => {
    const s = session();
    oidc.manager.getUser.mockRejectedValue(new Error('storage unavailable'));
    await expect(s.init()).rejects.toThrow('storage unavailable');
    await s.ready;
    expect(s.getState()).toEqual({ status: 'anonymous' });
  });

  it('leaves the callback route to handleCallback', async () => {
    location = { pathname: '/auth/callback', search: '?code=x&state=y', hash: '' };
    const s = session();
    await s.init();
    await s.ready;
    expect(s.isCallback()).toBe(true);
    expect(oidc.manager.getUser).not.toHaveBeenCalled();
    expect(s.getState()).toEqual({ status: 'loading' });
  });

  it('shares one silent renewal between concurrent callers', async () => {
    const s = session();
    oidc.manager.getUser.mockResolvedValue(user('old', true));
    let finish!: (value: unknown) => void;
    oidc.manager.signinSilent.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const tokens = Promise.all([s.getAccessToken(), s.auth.renewAccessToken(), s.renew()]);
    await vi.waitFor(() => expect(oidc.manager.signinSilent).toHaveBeenCalledTimes(1));
    finish(user('new'));
    expect(await tokens).toEqual(['new', 'new', 'new']);
  });

  it('ends the session without redirecting when renewal fails by default', async () => {
    const s = session();
    oidc.manager.getUser.mockResolvedValue(user());
    await s.init();
    oidc.manager.signinSilent.mockRejectedValue(new Error('login_required'));
    expect(await s.renew()).toBeUndefined();
    expect(oidc.manager.removeUser).toHaveBeenCalled();
    expect(s.getState()).toEqual({ status: 'anonymous' });
    expect(oidc.manager.signinRedirect).not.toHaveBeenCalled();
  });

  it('skips the silent frame when no session is stored', async () => {
    const s = session({ loginOnRenewalFailure: true });
    expect(await s.renew()).toBeUndefined();
    expect(oidc.manager.signinSilent).not.toHaveBeenCalled();
    expect(oidc.manager.signinRedirect).toHaveBeenCalledTimes(1);
  });

  it.each(['expired', 'error'])('redirects once after a failed %s event when configured', async (event) => {
    const s = session({ loginOnRenewalFailure: true });
    oidc.manager.getUser.mockResolvedValue(user());
    await s.init();
    oidc.manager.signinSilent.mockRejectedValue(new Error('renewal failed'));
    oidc.handlers[event]?.();
    oidc.handlers.error?.();
    await vi.waitFor(() => expect(oidc.manager.signinRedirect).toHaveBeenCalledTimes(1));
    expect(s.getState()).toEqual({ status: 'anonymous' });
  });

  it('ends the session when the API rejects it', async () => {
    const s = session();
    oidc.manager.getUser.mockResolvedValue(user());
    await s.init();
    await s.auth.onUnauthorized?.({} as never);
    expect(oidc.manager.removeUser).toHaveBeenCalled();
    expect(s.getState()).toEqual({ status: 'anonymous' });
  });

  describe.each(['/', '/portal/', 'portal'])('return paths with base %s', (base) => {
    const prefix = base === '/' ? '' : '/portal';
    it('stores the location relative to the base, coalesces redirects and resets after failure', async () => {
      location = { pathname: `${prefix}/file`, search: '?id=a%2Fb&start=9', hash: '#t' };
      const s = session({ basePath: base, redirectUri: `https://portal.test${prefix}/auth/callback` });
      await Promise.all([s.login(), s.login()]);
      expect(oidc.manager.signinRedirect).toHaveBeenCalledExactlyOnceWith({
        state: { returnPath: '/file?id=a%2Fb&start=9#t' },
      });
    });

    it('returns to the stored path after the callback and never to the callback itself', async () => {
      const s = session({ basePath: base, redirectUri: `https://portal.test${prefix}/auth/callback` });
      oidc.manager.signinCallback.mockResolvedValueOnce(user('valid', false, { returnPath: '/file?id=1' }));
      expect(await s.handleCallback('https://portal.test/cb')).toEqual({
        user: expect.objectContaining({ accessToken: 'valid' }),
        returnPath: '/file?id=1',
      });
      expect(s.getState().status).toBe('authenticated');
      oidc.manager.signinCallback.mockResolvedValueOnce(user('valid', false, { returnPath: '/auth/callback?code=1' }));
      expect((await s.handleCallback())?.returnPath).toBe('/');
      oidc.manager.signinCallback.mockResolvedValueOnce(user('valid', false, { returnPath: '//evil.test' }));
      expect((await s.handleCallback())?.returnPath).toBe('/');
    });
  });

  it('uses the configured fallback and rejects unsafe explicit return paths', async () => {
    const s = session({ defaultReturnPath: '/search' });
    await s.login('https://evil.test');
    expect(oidc.manager.signinRedirect).toHaveBeenCalledWith({ state: { returnPath: '/search' } });
  });

  it('allows a new login after the redirect fails to start', async () => {
    const s = session();
    oidc.manager.signinRedirect.mockRejectedValueOnce(new Error('metadata unavailable'));
    await expect(s.login('/a')).rejects.toThrow('metadata unavailable');
    await s.login('/a');
    expect(oidc.manager.signinRedirect).toHaveBeenCalledTimes(2);
  });

  it('completes silent renewal frames without a user and reports failed callbacks', async () => {
    const s = session();
    oidc.manager.signinCallback.mockResolvedValueOnce(undefined);
    expect(await s.handleCallback()).toBeUndefined();
    oidc.manager.signinCallback.mockRejectedValueOnce(new Error('state mismatch'));
    await expect(s.handleCallback()).rejects.toThrow('state mismatch');
    expect(s.getState()).toEqual({ status: 'anonymous' });
  });

  it('logs out locally and detaches listeners on dispose', async () => {
    const s = session();
    oidc.manager.getUser.mockResolvedValue(user());
    await s.init();
    const listener = vi.fn();
    s.subscribe(listener);
    await s.logout();
    expect(oidc.manager.removeUser).toHaveBeenCalled();
    expect(s.getState()).toEqual({ status: 'anonymous' });
    s.dispose();
    expect(oidc.manager.events.removeUserLoaded).toHaveBeenCalled();
    expect(oidc.manager.stopSilentRenew).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
