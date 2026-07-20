// Shared stub for @/configuration, picked up by a bare vi.mock('@/configuration'):
// the real module fetches /configuration.json at import time, which isn't
// available under vitest. Specs mutate ui fields to simulate configurations.
export const ui = { aggregations: [], textReplacements: {} };
