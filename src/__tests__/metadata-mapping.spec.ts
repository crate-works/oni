import { afterEach, expect, it, vi } from 'vitest';

const payload = {
  '@context': 'https://w3id.org/ro/crate/1.1/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    { '@id': './', '@type': 'Dataset', name: 'Mapping' },
    { '@id': 'https://vocab.test/date', 'rdfs:label': 'datePublished', name: 'Published Date' },
  ],
};

const load = async (metadataMapping: object) => {
  vi.resetModules();
  vi.doMock('@/configuration', () => ({ ui: { metadataMapping } }));
  return import('@/lib/metadata');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock('@/configuration');
});

it.each([
  ['/', 'mapping.json', '/mapping.json'],
  ['/portal/', '/mapping.json', '/portal/mapping.json'],
  ['/portal/', 'https://vocab.test/mapping.json', 'https://vocab.test/mapping.json'],
])('keeps mapping loading at base %s for %s', async (base, mappingFile, expectedUrl) => {
  vi.stubEnv('BASE_URL', base);
  const fetch = vi.fn(async () => new Response(JSON.stringify(payload)));
  vi.stubGlobal('fetch', fetch);
  const { startCase } = await load({ mappingFile });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(expectedUrl);
  expect(startCase('datePublished')).toBe('Published Date');
  expect(startCase('unknownField')).toBe('unknownField');
});

it.each(['http', 'json', 'network', 'crate'])('keeps raw labels when mapping loading fails (%s)', async (mode) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (mode === 'network') {
        throw new Error('offline');
      }
      if (mode === 'http') {
        return new Response(null, { status: 404 });
      }
      return new Response(mode === 'json' ? 'invalid' : JSON.stringify(null));
    }),
  );
  const { startCase } = await load({ mappingFile: 'mapping.json', textReplacements: { date: 'Changed' } });
  expect(startCase('datePublished')).toBe('datePublished');
});

it('loads nothing when no mapping file is configured and keeps text replacements', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { startCase } = await load({ textReplacements: { '^iso': 'ISO' } });
  expect(startCase('iso_code')).toBe('ISO Code');
  expect(fetch).not.toHaveBeenCalled();
});
