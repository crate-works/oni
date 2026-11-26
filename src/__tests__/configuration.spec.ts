import { describe, expect, it, vi } from 'vitest';

import { loadSampleConfiguration } from './sample-configuration';

const loadWithRocrate = (rocrate: Record<string, unknown>) => {
  vi.resetModules();

  return loadSampleConfiguration(
    () => import('@/configuration'),
    (sample) => {
      Object.assign(sample.api.rocrate, rocrate);
    },
  );
};

describe('api.rocrate token cookie settings', () => {
  it('leaves the token cookie off by default', async () => {
    const { api } = await loadWithRocrate({});

    expect(api.rocrate.usesTokenCookie).toBeFalsy();
  });

  it('names the cookie oni_access_token when no name is given', async () => {
    const { api } = await loadWithRocrate({ usesTokenCookie: true });

    expect(api.rocrate.tokenCookieName).toBe('oni_access_token');
  });

  it('accepts a custom cookie name', async () => {
    const { api } = await loadWithRocrate({ usesTokenCookie: true, tokenCookieName: 'catalog_token' });

    expect(api.rocrate.tokenCookieName).toBe('catalog_token');
  });

  it.each(['', 'oni token', 'oni;token', 'oni=token'])('rejects the cookie name %j', async (tokenCookieName) => {
    await expect(loadWithRocrate({ usesTokenCookie: true, tokenCookieName })).rejects.toThrow();
  });
});
