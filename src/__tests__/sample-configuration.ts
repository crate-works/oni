import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const API_ENDPOINT = 'https://api.example.test';

// Loads the real @/configuration against configuration.sample.json; oidc is
// dropped so ApiService's token and 401-retry branches stay dormant.
export const loadSampleConfiguration = async <T>(importActual: () => Promise<T>): Promise<T> => {
  const path = resolve(process.cwd(), 'configuration.sample.json');
  const sample = JSON.parse(readFileSync(path, 'utf8'));
  delete sample.api.oidc;
  sample.api.rocrate.endpoint = API_ENDPOINT;

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(sample));
  try {
    return await importActual();
  } finally {
    globalThis.fetch = realFetch;
  }
};
