import { describe, expect, it } from 'vitest';
import { applyOverrides } from '../oni-dev-config.ts';

const base = {
  api: { rocrate: { endpoint: 'https://base.example.test' }, oidc: { scope: 'openid' } },
  ui: { title: 'Oni', sentry: { dsn: 'https://key@sentry.example.test/1', tracesSampleRate: 0.1 } },
};

describe('applyOverrides', () => {
  it('leaves the configuration unchanged when no overrides are set', () => {
    expect(applyOverrides(base, {})).toEqual(base);
  });

  it('ignores empty overrides', () => {
    expect(applyOverrides(base, { ONI_API_ENDPOINT: '' })).toEqual(base);
  });

  it('overrides each mapped key', () => {
    const merged = applyOverrides(base, {
      ONI_API_ENDPOINT: 'https://api.example.test',
      ONI_OIDC_ENDPOINT: 'https://auth.example.test',
      ONI_OIDC_CLIENT_ID: 'client-123',
      ONI_SENTRY_DSN: 'https://other@sentry.example.test/2',
      ONI_SENTRY_ENVIRONMENT: 'staging',
      ONI_GA_MEASUREMENT_ID: 'G-TEST',
    });

    expect(merged).toEqual({
      api: {
        rocrate: { endpoint: 'https://api.example.test' },
        oidc: { scope: 'openid', endpoint: 'https://auth.example.test', clientId: 'client-123' },
      },
      ui: {
        title: 'Oni',
        sentry: { dsn: 'https://other@sentry.example.test/2', tracesSampleRate: 0.1, environment: 'staging' },
        analytics: { gaMeasurementId: 'G-TEST' },
      },
    });
  });

  it('fills in sections absent from the configuration', () => {
    const merged = applyOverrides(
      { api: { rocrate: { endpoint: 'https://base.example.test' } } },
      {
        ONI_OIDC_CLIENT_ID: 'client-123',
        ONI_SENTRY_ENVIRONMENT: 'staging',
      },
    );

    expect(merged).toEqual({
      api: { rocrate: { endpoint: 'https://base.example.test' }, oidc: { clientId: 'client-123' } },
      ui: { sentry: { environment: 'staging' } },
    });
  });

  it('does not modify the original configuration', () => {
    const original = structuredClone(base);
    applyOverrides(base, { ONI_API_ENDPOINT: 'https://api.example.test' });

    expect(base).toEqual(original);
  });
});
