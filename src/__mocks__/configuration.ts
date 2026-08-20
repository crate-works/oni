// Shared stub for @/configuration, picked up by a bare vi.mock('@/configuration'):
// the real module fetches /configuration.json at import time, which isn't
// available under vitest. Specs mutate the exported fields to simulate
// configurations.
type RealUi = typeof import('@/configuration')['ui'];
type RealApi = typeof import('@/configuration')['api'];

export const ui: Pick<RealUi, 'aggregations'> = {
  aggregations: [],
};

// oidc is deliberately absent: it leaves ApiService's token and 401-retry
// branches dormant, so specs of the API seam need no auth stubbing.
export const api: Pick<RealApi, 'rocrate'> = {
  rocrate: { endpoint: 'https://api.example.test' },
};
