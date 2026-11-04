import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getUser: vi.fn(), login: vi.fn(), logout: vi.fn() }));
vi.mock('@/configuration');
vi.mock('@/services/auth', () => ({ ...auth, authReady: Promise.resolve() }));

beforeEach(() => {
  vi.resetModules();
  window.scrollTo = vi.fn();
  vi.clearAllMocks();
  setActivePinia(createPinia());
  // Exercise the real route table and guard without mounting page contents.
  for (const name of [
    'About',
    'Collection',
    'Entity',
    'File',
    'Home',
    'List',
    'NotFound',
    'OauthCallback',
    'Object',
    'Person',
    'Privacy',
    'SearchMap',
    'Search',
    'Shell',
    'Terms',
    'User',
  ]) {
    vi.doMock(`@/views/${name}View.vue`, () => ({ default: { template: '<div />' } }));
  }
  auth.getUser.mockResolvedValue(undefined);
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

it('allows anonymous browsing while clearing stale session state', async () => {
  const { useAuthStore } = await import('@/stores/auth');
  const store = useAuthStore();
  store.isLoggedIn = true;
  store.user = { email: 'stale@test', accessToken: 'old' };
  const { default: router } = await import('@/router');
  await router.push('/search?q=hello');
  expect(router.currentRoute.value.fullPath).toBe('/search?q=hello');
  expect(store.isLoggedIn).toBe(false);
  expect(store.user).toBeUndefined();
  expect(auth.login).not.toHaveBeenCalled();
});

it('blocks a protected route once and keeps a valid user on it', async () => {
  const { default: router } = await import('@/router');
  await router.push('/');
  await router.push('/user');
  expect(router.currentRoute.value.path).toBe('/');
  expect(auth.login).toHaveBeenCalledTimes(1);
  auth.getUser.mockResolvedValue({ email: 'member@test', accessToken: 'valid' });
  await router.push('/user');
  expect(router.currentRoute.value.path).toBe('/user');
  expect(auth.login).toHaveBeenCalledTimes(1);
});
