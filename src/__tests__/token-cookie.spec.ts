import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/configuration');

import { api } from '@/configuration';
import { ApiService } from '@/services/api';
import type { OniUser } from '@/services/auth';
import { useAuthStore } from '@/stores/auth';

type AuthStore = ReturnType<typeof useAuthStore>;

const NOW = new Date('2026-11-26T00:00:00Z');
const nowSeconds = NOW.getTime() / 1000;

const user = (accessToken: string, expiresIn: number): OniUser => ({
  email: 'researcher@example.test',
  accessToken,
  expiresAt: nowSeconds + expiresIn,
});

const DELETED = 'oni_access_token=; Path=/api/file/; Max-Age=0; Secure; SameSite=Strict';

let writes: string[];

// Creates the store and discards the startup write, which clears any leftover cookie.
const startStore = () => {
  const store = useAuthStore();
  writes.length = 0;

  return store;
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  writes = [];
  vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
    writes.push(value);
  });
  api.rocrate = {
    endpoint: 'https://api.example.test/api',
    usesTokenCookie: true,
    tokenCookieName: 'oni_access_token',
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('token cookie', () => {
  it('clears a leftover cookie when the app starts with nobody signed in', () => {
    useAuthStore();

    expect(writes).toEqual([DELETED]);
  });

  it('writes the access token when a user signs in', () => {
    const store = startStore();

    store.user = user('token-a', 3600);

    expect(writes).toEqual(['oni_access_token=token-a; Path=/api/file/; Max-Age=3600; Secure; SameSite=Strict']);
  });

  it('replaces the token when it is renewed', () => {
    const store = startStore();
    store.user = user('token-a', 60);

    vi.advanceTimersByTime(30_000);
    store.user = user('token-b', 3630);

    expect(writes).toEqual([
      'oni_access_token=token-a; Path=/api/file/; Max-Age=60; Secure; SameSite=Strict',
      'oni_access_token=token-b; Path=/api/file/; Max-Age=3600; Secure; SameSite=Strict',
    ]);
  });

  it.each([
    ['assigning no user', (store: AuthStore) => (store.user = undefined)],
    ['reset', (store: AuthStore) => store.reset()],
    ['logout', (store: AuthStore) => store.logout()],
  ])('deletes the cookie on %s', (_, signOut) => {
    const store = startStore();
    store.user = user('token-a', 3600);

    signOut(store);

    expect(writes).toEqual([
      'oni_access_token=token-a; Path=/api/file/; Max-Age=3600; Secure; SameSite=Strict',
      DELETED,
    ]);
  });

  it.each([
    ['no path', 'https://api.example.test', '/file/'],
    ['a path', 'https://api.example.test/api', '/api/file/'],
    ['a trailing slash', 'https://api.example.test/api/', '/api//file/'],
  ])('scopes the cookie to the file URLs the API service builds for an endpoint with %s', async (_, endpoint, path) => {
    api.rocrate = { endpoint, usesTokenCookie: true, tokenCookieName: 'oni_access_token' };
    const store = startStore();

    store.user = user('token-a', 3600);

    const fileUrl = await new ApiService().getFileUrl('arcp://name,corpus/object/1', 'audio.mp3');
    expect(writes).toEqual([`oni_access_token=token-a; Path=${path}; Max-Age=3600; Secure; SameSite=Strict`]);
    expect(new URL(fileUrl ?? '').pathname.startsWith(path)).toBe(true);
  });

  it.each([
    ['already expired', -120],
    ['expiring now', 0],
  ])('deletes the cookie when the token is %s', (_, expiresIn) => {
    const store = startStore();

    store.user = user('token-a', expiresIn);

    expect(writes).toEqual([DELETED]);
  });

  it('keeps the cookie for the browser session when the token has no expiry', () => {
    const store = startStore();

    store.user = { email: 'researcher@example.test', accessToken: 'token-a' };

    expect(writes).toEqual(['oni_access_token=token-a; Path=/api/file/; Secure; SameSite=Strict']);
  });

  it('uses the configured cookie name', () => {
    api.rocrate = { endpoint: 'https://api.example.test/api', usesTokenCookie: true, tokenCookieName: 'catalog_token' };
    const store = startStore();

    store.user = user('token-a', 3600);

    expect(writes).toEqual(['catalog_token=token-a; Path=/api/file/; Max-Age=3600; Secure; SameSite=Strict']);
  });

  it.each([
    ['turned off', false],
    ['not set', undefined],
  ])('writes no cookie when the token cookie is %s', (_, usesTokenCookie) => {
    api.rocrate = { endpoint: 'https://api.example.test/api', usesTokenCookie, tokenCookieName: 'oni_access_token' };
    const store = useAuthStore();

    store.user = user('token-a', 3600);
    store.user = user('token-b', 3600);
    store.reset();
    store.user = user('token-c', 3600);
    store.logout();

    expect(writes).toEqual([]);
  });
});
