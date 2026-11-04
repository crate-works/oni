import { createOidcSession, type OidcSession, type OniUser as OidcUser } from '@researchdatabox/oni-client/oidc';

import { api } from '@/configuration';
import { useAuthStore } from '@/stores/auth';

export type OniUser = {
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  accessToken: string;
};

const clientId = api.oidc?.clientId;

let session: OidcSession | undefined;

let authReadyResolve: () => void;
export const authReady: Promise<void> = new Promise((resolve) => {
  authReadyResolve = resolve;
});

const transformUser = (user: OidcUser): OniUser => ({
  email: user.email || 'No email supplied',
  firstName: user.firstName,
  lastName: user.lastName,
  name: user.name,
  accessToken: user.accessToken,
});

const getSession = () => {
  if (!clientId) {
    throw new Error('OIDC is not configured');
  }
  if (session) {
    return session;
  }

  const store = useAuthStore();
  const baseUrl = import.meta.env.BASE_URL;

  session = createOidcSession({
    authority: api.oidc?.endpoint || api.rocrate.endpoint,
    clientId,
    redirectUri: `${window.location.origin}${baseUrl}auth/callback`,
    scope: api.oidc?.scope || 'public openid profile email',
    storage: window.localStorage,
    basePath: baseUrl,
    loginOnRenewalFailure: true,
  });

  session.subscribe(() => {
    const state = session?.getState();
    if (state?.status === 'authenticated') {
      store.user = transformUser(state.user);
      store.isLoggedIn = true;
    } else if (state?.status === 'anonymous') {
      store.reset();
    }
  });

  return session;
};

export const initAuth = async () => {
  if (!clientId) {
    authReadyResolve();
    return;
  }

  // Clean up stale Pinia auth data from localStorage (previously persisted by pinia-plugin-persistedstate)
  localStorage.removeItem('auth');

  try {
    // Skips hydration on the OAuth callback page — OauthCallbackView handles that flow
    await getSession().init();
  } finally {
    authReadyResolve();
  }
};

export const getValidAccessToken = async (): Promise<string | undefined> =>
  clientId ? getSession().getAccessToken() : undefined;

// Force a token renewal, bypassing client-side expiry checks.
// Used by the 401 retry path where the server rejects a token the client considers valid.
export const forceRenewToken = async (): Promise<string | undefined> => (clientId ? getSession().renew() : undefined);

export const login = async () => {
  if (!clientId) {
    return;
  }
  try {
    await getSession().login();
  } catch (error) {
    console.error('Login could not start', error);
  }
};

export const handleCallback = async () => {
  if (!clientId) {
    return;
  }
  const result = await getSession().handleCallback();
  if (result) {
    return { user: transformUser(result.user), returnUrl: result.returnPath };
  }
};

export const getUser = async () => {
  if (!clientId) {
    return;
  }
  const user = await getSession().getUser();
  return user && transformUser(user);
};

export const logout = async () => {
  // We don't sign out of the provider as we don't want to necessarily sign the user out of Nabu for example just Oni
  if (clientId) {
    await getSession().logout();
  }
};
