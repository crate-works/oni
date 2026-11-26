import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { api } from '@/__mocks__/configuration';

export const API_ENDPOINT = api.rocrate.endpoint;

// Loads the real @/configuration against configuration.sample.json, with the
// shared stub's endpoint and (absent) oidc, then any override applied.
export const loadSampleConfiguration = async <T>(
  importActual: () => Promise<T>,
  override: (sample: { api: { rocrate: Record<string, unknown> } }) => void = () => {},
): Promise<T> => {
  const path = resolve(process.cwd(), 'configuration.sample.json');
  const sample = JSON.parse(readFileSync(path, 'utf8'));
  delete sample.api.oidc;
  sample.api.rocrate.endpoint = API_ENDPOINT;
  override(sample);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(sample));
  try {
    return await importActual();
  } finally {
    globalThis.fetch = realFetch;
  }
};
