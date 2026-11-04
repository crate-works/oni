import { type User, UserManager, type UserManagerSettings, WebStorageStateStore } from 'oidc-client-ts';

import type { OniAuth } from './client.js';

export type OniUser = {
  subject: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  accessToken: string;
  /** Token expiry in epoch seconds, when the provider supplies one. */
  expiresAt?: number;
};

export type OidcSessionState =
  | { status: 'loading'; user?: undefined }
  | { status: 'anonymous'; user?: undefined }
  | { status: 'authenticated'; user: OniUser };

type CurrentLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

export type OidcSessionOptions = {
  /** OpenID provider issuer URL. */
  authority: string;
  clientId: string;
  /** Absolute URL of the portal callback route, e.g. `${origin}${base}auth/callback`. */
  redirectUri: string;
  /** Defaults to `openid profile email`. */
  scope?: string;
  /** Token and sign-in state storage. Defaults to `sessionStorage`, which keeps sessions per tab. */
  storage?: Storage;
  /** Storage key prefix. Defaults to `oidc.`, the oidc-client-ts default, so existing sessions survive upgrades. */
  storagePrefix?: string;
  /** Renew access tokens shortly before they expire. Defaults to true. */
  automaticSilentRenew?: boolean;
  /**
   * Start a new sign-in redirect when renewal fails or the API rejects the session.
   * Defaults to false: the session ends and the portal continues anonymously.
   */
  loginOnRenewalFailure?: boolean;
  /** Deployment base path; return paths are stored relative to it. Defaults to `/`. */
  basePath?: string;
  /** Used when a stored return path is missing or unsafe. Defaults to `/`. */
  defaultReturnPath?: string;
  /** Current location. Defaults to `globalThis.location`. */
  location?: () => CurrentLocation;
  /** Additional oidc-client-ts settings, applied after the defaults above. */
  settings?: Partial<UserManagerSettings>;
};

export type OidcSession = {
  /** Adapter for `createOniClient({ auth })`. */
  readonly auth: OniAuth;
  /** Resolves once `init()` has settled, whether or not it succeeded. */
  readonly ready: Promise<void>;
  /** Stable snapshot; a new object is created only when the state changes. */
  getState(): OidcSessionState;
  subscribe(listener: () => void): () => void;
  /** Restores a stored session, renewing it when expired. Skipped on the callback route. */
  init(): Promise<void>;
  isCallback(location?: CurrentLocation): boolean;
  /** Re-reads storage and returns the user only while the access token is valid. */
  getUser(): Promise<OniUser | undefined>;
  /** Returns a valid token, renewing an expired one silently. */
  getAccessToken(): Promise<string | undefined>;
  /** Renews regardless of local expiry, e.g. after the API rejects a token. */
  renew(): Promise<string | undefined>;
  /** Redirects to the provider. Concurrent calls share one redirect. */
  login(returnPath?: string): Promise<void>;
  /** Completes redirect or silent callbacks. Returns undefined for silent renewal frames. */
  handleCallback(url?: string): Promise<{ user: OniUser; returnPath: string } | undefined>;
  /** Ends the portal session locally without signing out of the provider. */
  logout(): Promise<void>;
  dispose(): void;
};

type ReturnState = { returnPath?: unknown };

const normaliseBase = (basePath = '/') => `/${basePath.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

/**
 * Accepts only same-origin, root-relative paths. Rejects protocol-relative URLs,
 * backslashes and control characters, which browsers may treat as another origin.
 */
export function safeReturnPath(value: unknown, fallback = '/'): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    ![...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)
    ? value
    : fallback;
}

export function toOniUser(user: User): OniUser {
  const { profile } = user;
  return {
    subject: profile.sub,
    email: profile.email,
    name: profile.name,
    firstName: profile.given_name,
    lastName: profile.family_name,
    accessToken: user.access_token,
    expiresAt: user.expires_at,
  };
}

export function createOidcSession(options: OidcSessionOptions): OidcSession {
  const storage = options.storage ?? globalThis.sessionStorage;
  const prefix = options.storagePrefix ?? 'oidc.';
  const basePath = normaliseBase(options.basePath);
  const fallback = safeReturnPath(options.defaultReturnPath, '/');
  const currentLocation = options.location ?? (() => globalThis.location);
  const callbackPath = new URL(options.redirectUri).pathname;

  const manager = new UserManager({
    authority: options.authority,
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scope ?? 'openid profile email',
    automaticSilentRenew: options.automaticSilentRenew ?? true,
    userStore: new WebStorageStateStore({ store: storage, prefix }),
    stateStore: new WebStorageStateStore({ store: storage, prefix }),
    ...options.settings,
  });

  let state: OidcSessionState = { status: 'loading' };
  const listeners = new Set<() => void>();
  const setState = (next: OidcSessionState) => {
    if (next.status === state.status && next.user?.accessToken === state.user?.accessToken) {
      return;
    }
    state = next;
    for (const listener of listeners) {
      listener();
    }
  };
  const setUser = (user: User | null | undefined) =>
    setState(user && !user.expired ? { status: 'authenticated', user: toOniUser(user) } : { status: 'anonymous' });

  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const relativePath = (location: CurrentLocation) => {
    const path = location.pathname.startsWith(basePath)
      ? `/${location.pathname.slice(basePath.length)}`
      : location.pathname;
    return `${path}${location.search}${location.hash}`;
  };
  const isCallback = (location: CurrentLocation = currentLocation()) => location.pathname === callbackPath;
  // Returning to the callback route would replay a consumed authorisation response.
  const returnPathFor = (value: unknown) => {
    const path = safeReturnPath(value, fallback);
    return path.split(/[?#]/)[0] === relativePath({ pathname: callbackPath, search: '', hash: '' }) ? fallback : path;
  };

  let redirecting = false;
  const login = async (returnPath?: string) => {
    if (redirecting) {
      return;
    }
    redirecting = true;
    try {
      const state: ReturnState = { returnPath: returnPathFor(returnPath ?? relativePath(currentLocation())) };
      await manager.signinRedirect({ state });
    } catch (error) {
      redirecting = false;
      throw error;
    }
  };

  const end = async () => {
    try {
      await manager.removeUser();
    } catch {
      // The stored user may already be gone; the session still ends.
    }
    setState({ status: 'anonymous' });
    if (options.loginOnRenewalFailure) {
      try {
        await login();
      } catch {
        // A failed redirect leaves the portal usable anonymously.
      }
    }
  };

  let renewal: Promise<string | undefined> | undefined;
  const renew = () => {
    renewal ??= (async () => {
      // Without a stored session there is nothing to renew; signinSilent would wait for its frame timeout.
      if (!(await manager.getUser())) {
        await end();
        return undefined;
      }
      try {
        const user = await manager.signinSilent();
        setUser(user);
        return user?.access_token;
      } catch {
        await end();
        return undefined;
      }
    })().finally(() => {
      renewal = undefined;
    });
    return renewal;
  };

  const getAccessToken = async () => {
    const user = await manager.getUser();
    if (!user) {
      return undefined;
    }
    return user.expired ? renew() : user.access_token;
  };

  const loaded = (user: User) => setUser(user);
  const unloaded = () => setState({ status: 'anonymous' });
  const expired = () => void renew();
  const renewError = () => void end();
  manager.events.addUserLoaded(loaded);
  manager.events.addUserUnloaded(unloaded);
  manager.events.addAccessTokenExpired(expired);
  manager.events.addSilentRenewError(renewError);

  return {
    auth: {
      getAccessToken,
      renewAccessToken: renew,
      onUnauthorized: () => end(),
    },
    ready,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async init() {
      try {
        if (isCallback()) {
          return;
        }
        const user = await manager.getUser().catch((error: unknown) => {
          setState({ status: 'anonymous' });
          throw error;
        });
        if (user?.expired) {
          await renew();
        } else {
          setUser(user);
        }
      } finally {
        resolveReady();
      }
    },
    isCallback,
    async getUser() {
      const user = await manager.getUser();
      return user && !user.expired ? toOniUser(user) : undefined;
    },
    getAccessToken,
    renew,
    login,
    async handleCallback(url) {
      try {
        const user = await manager.signinCallback(url);
        if (!user) {
          return undefined;
        }
        setUser(user);
        return {
          user: toOniUser(user),
          returnPath: returnPathFor((user.state as ReturnState | undefined)?.returnPath),
        };
      } catch (error) {
        setState({ status: 'anonymous' });
        throw error;
      }
    },
    async logout() {
      await manager.removeUser();
      setState({ status: 'anonymous' });
    },
    dispose() {
      manager.events.removeUserLoaded(loaded);
      manager.events.removeUserUnloaded(unloaded);
      manager.events.removeAccessTokenExpired(expired);
      manager.events.removeSilentRenewError(renewError);
      manager.stopSilentRenew();
      listeners.clear();
    },
  };
}
