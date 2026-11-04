import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/configuration');
vi.mock('@/services/auth', () => ({ getValidAccessToken: vi.fn(), forceRenewToken: vi.fn() }));

import { OniClientError } from '@researchdatabox/oni-client';
import { api } from '@/configuration';
import { ApiService } from '@/services/api';
import { forceRenewToken, getValidAccessToken } from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { useCapabilitiesStore } from '@/stores/capabilities';
import { validPayload } from './fixtures/capabilities';

const originalFetch = globalThis.fetch;
const originalOidc = api.oidc;
const originalEndpoint = api.rocrate.endpoint;
const originalUrl = window.location.href;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  api.oidc = undefined;
  api.rocrate.usesRedirects = false;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  api.oidc = originalOidc;
  api.rocrate.endpoint = originalEndpoint;
  api.rocrate.usesRedirects = undefined;
  window.history.replaceState(null, '', originalUrl);
});

it.each([
  ['', ''],
  ['/api', '/api'],
  ['api', '/portal/api'],
])('preserves endpoint resolution under a subpath (%s)', async (endpoint, expectedPath) => {
  window.history.replaceState(null, '', '/portal/collection?id=opaque');
  api.rocrate.endpoint = endpoint;
  globalThis.fetch = vi.fn(async () => json({ total: 0, entities: [] }));
  await new ApiService().getEntities({});
  expect(globalThis.fetch).toHaveBeenCalledWith(`${window.location.origin}${expectedPath}/entities`, expect.anything());
});

it('preserves optional 404 and missing entity/file return shapes', async () => {
  globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 }));
  const service = new ApiService();
  expect(await service.getAnnouncements()).toEqual({ error: 'Not found' });
  expect(await service.getCapabilities()).toEqual({ error: 'Not found' });
  expect(await service.getEntity('missing')).toEqual({ error: 'Not found' });
  expect(await service.getRoCrateJSON('missing')).toBe('{"error":"Not found"}');
  api.rocrate.usesRedirects = true;
  expect(await new ApiService().getFileUrl('missing')).toBeUndefined();
});

it.each([403, 404])('maps ZIP status %s to the legacy shape', async (status) => {
  globalThis.fetch = vi.fn(async () => new Response(null, { status }));
  expect(await new ApiService().getZipMeta('id')).toEqual({ status: status === 403 ? 'noAccess' : 'notFound' });
});

it('passes current auth callbacks to the client and resets only after bounded 401 failure', async () => {
  api.oidc = { clientId: 'test-client' };
  vi.mocked(getValidAccessToken).mockResolvedValue('old');
  vi.mocked(forceRenewToken).mockResolvedValue('new');
  globalThis.fetch = vi.fn(async () => json({ error: { code: 'EXPIRED', message: 'Expired' } }, 401));
  const store = useAuthStore();
  const reset = vi.spyOn(store, 'reset');
  await expect(new ApiService().getEntities({})).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  expect(forceRenewToken).toHaveBeenCalledTimes(1);
  expect(reset).toHaveBeenCalledTimes(1);
});

it('does not renew or reset a forbidden session', async () => {
  api.oidc = { clientId: 'test-client' };
  vi.mocked(getValidAccessToken).mockResolvedValue('old');
  globalThis.fetch = vi.fn(async () => json({ error: { code: 'FORBIDDEN', message: 'Denied' } }, 403));
  const reset = vi.spyOn(useAuthStore(), 'reset');
  await expect(new ApiService().getEntities({})).rejects.toBeInstanceOf(OniClientError);
  expect(forceRenewToken).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();
});

it('omits the auth adapter for anonymous config, including rejected requests', async () => {
  globalThis.fetch = vi.fn(async () => json({}, 401));
  const reset = vi.spyOn(useAuthStore(), 'reset');
  await expect(new ApiService().getEntities({})).rejects.toMatchObject({ status: 401 });
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(getValidAccessToken).not.toHaveBeenCalled();
  expect(forceRenewToken).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();
  expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
});

it('renews a protected file once and keeps the session on successful retry', async () => {
  api.oidc = { clientId: 'test-client' };
  api.rocrate.usesRedirects = true;
  vi.mocked(getValidAccessToken).mockResolvedValueOnce('old').mockResolvedValue('new');
  vi.mocked(forceRenewToken).mockResolvedValue('new');
  globalThis.fetch = vi
    .fn()
    .mockResolvedValueOnce(json({}, 401))
    .mockResolvedValueOnce(json({ location: 'https://storage.test/file?sig=renewed' }));
  const store = useAuthStore();
  store.isLoggedIn = true;
  const reset = vi.spyOn(store, 'reset');
  expect(await new ApiService().getFileUrl('protected')).toBe('https://storage.test/file?sig=renewed');
  expect(forceRenewToken).toHaveBeenCalledTimes(1);
  expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  expect(reset).not.toHaveBeenCalled();
  expect(store.isLoggedIn).toBe(true);
});

it('retains filter sanitisation at the Vue seam once capabilities are loaded', async () => {
  const capabilities = useCapabilitiesStore();
  const fetch = vi.fn<typeof globalThis.fetch>(async () => json(validPayload));
  globalThis.fetch = fetch;
  const service = new ApiService();
  await capabilities.init(service);
  fetch.mockClear();
  fetch.mockImplementation(async () => json({ total: 0, entities: [] }));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await service.search({ query: '', filters: { inLanguage: ['en'], stale: ['ignored'] } });
    const init = vi.mocked(globalThis.fetch).mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ query: '', filters: { inLanguage: ['en'] } });
  } finally {
    warning.mockRestore();
  }
});

it('passes request cancellation through the facade', async () => {
  globalThis.fetch = vi.fn();
  const controller = new AbortController();
  controller.abort();
  await expect(new ApiService().search({ query: '' }, { signal: controller.signal })).rejects.toMatchObject({
    kind: 'aborted',
  });
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it.each(['/', '/portal/'])('preserves direct and redirected file URLs under %s', async (basePath) => {
  window.history.replaceState(null, '', `${basePath}collection?id=opaque`);
  const base = document.createElement('base');
  base.href = basePath;
  document.head.append(base);
  try {
    for (const endpoint of ['', '/api', 'api', 'https://api.test/api']) {
      api.rocrate.endpoint = endpoint;
      api.rocrate.usesRedirects = false;
      globalThis.fetch = vi.fn(async () => json({ location: '_content/x?sig=a%2Fb' }));
      expect(await new ApiService().getFileUrl('x')).toBe(`${endpoint}/file/x?disposition=inline`);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      api.rocrate.usesRedirects = true;
      const redirectBase = new URL(`${endpoint.replace(/\/$/, '')}/`, window.location.origin);
      expect(await new ApiService().getFileUrl('x')).toBe(new URL('_content/x?sig=a%2Fb', redirectBase).href);
      const requestBase = new URL(endpoint || '/', document.baseURI).href.replace(/\/+$/, '');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${requestBase}/file/x?disposition=inline&noRedirect=true`,
        expect.anything(),
      );
    }
  } finally {
    base.remove();
  }
});

it.each([201, 400, 500])('throws for unexpected ZIP status %s', async (status) => {
  globalThis.fetch = vi.fn(async () => new Response(null, { status }));
  await expect(new ApiService().getZipMeta('id')).rejects.toMatchObject({ kind: 'http', status });
});

it.each([
  ['1234', 1234],
  ['invalid', null],
  [null, 0],
] as const)('retains ZIP numeric size semantics (%s)', async (size, expected) => {
  const response = new Response(null, { headers: size === null ? {} : { 'Content-Length-Estimate': size } });
  Object.defineProperty(response, 'url', { value: 'https://storage.test/archive.zip' });
  globalThis.fetch = vi.fn(async () => response);
  expect(await new ApiService().getZipMeta('id')).toEqual({
    status: 'ok',
    expandedSize: expected,
    numberOfFiles: 0,
    url: 'https://storage.test/archive.zip',
  });
});
