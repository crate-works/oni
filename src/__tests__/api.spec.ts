import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/configuration');

import { ApiService } from '@/services/api';

const id = 'arcp://name,corpus/object/1';
const metadataUrl = 'https://api.example.test/entity/arcp%3A%2F%2Fname%2Ccorpus%2Fobject%2F1/metadata';

const crate = {
  '@context': 'https://w3id.org/ro/crate/1.1/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Example object' },
  ],
};

const requestedUrl = () => vi.mocked(globalThis.fetch).mock.calls[0]?.[0];

beforeEach(() => {
  setActivePinia(createPinia());
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(crate)));
});

describe('getRoCrateJSON / getRoCrate', () => {
  it('fetches the crate JSON from the entity metadata path', async () => {
    await new ApiService().getRoCrateJSON(id);

    expect(requestedUrl()).toBe(metadataUrl);
  });

  it('parses the crate fetched from the entity metadata path', async () => {
    const result = await new ApiService().getRoCrate(id);

    expect(requestedUrl()).toBe(metadataUrl);
    expect(result).toMatchObject({ metadata: { name: ['Example object'] } });
  });
});
