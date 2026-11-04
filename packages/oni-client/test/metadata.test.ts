import { expect, it, vi } from 'vitest';
import {
  buildMetadataNameMap,
  createOniClient,
  extractPropertyFromIdentifier,
  metadataLabel,
  metadataName,
  type RoCrate,
  selectMetadata,
} from '../src/index.js';

const crate = {
  '@context': 'https://w3id.org/ro/crate/1.1/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    {
      '@id': './',
      '@type': 'Dataset',
      name: 'Record',
      author: { '@id': '#person' },
      identifier: [{ '@id': '#identifier' }],
      zebra: 'Z',
      empty: [],
      blank: '',
      none: null,
    },
    { '@id': '#person', '@type': 'Person', name: 'Author', affiliation: { '@id': './' } },
    { '@id': '#identifier', '@type': 'PropertyValue', name: 'identifier', value: 'ID-1' },
  ],
};
const parsed = () =>
  createOniClient({ endpoint: 'https://api.test', fetch: async () => new Response(JSON.stringify(crate)) }).getRoCrate(
    'id',
  );

it('retains arbitrary repository metadata alongside the known portal fields', async () => {
  const md = await parsed();
  const extension: unknown = md.zebra;
  expect(extension).toEqual(['Z']);
  expect(selectMetadata(md, { mode: 'explicit', show: ['zebra', 'name'] })).toEqual([
    { name: 'zebra', data: ['Z'] },
    { name: 'name', data: ['Record'] },
  ]);
});

it('interprets the documented minimal mapping crate with descriptor and root dataset', async () => {
  const names = await buildMetadataNameMap({
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': [
      { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
      { '@id': './', '@type': 'Dataset' },
      { '@id': 'https://schema.org/description', 'rdfs:label': 'description', name: 'Description' },
    ],
  });
  expect(names.get('description')).toBe('Description');
  expect(names.get('https://schema.org/description')).toBe('Description');
});

it('selects top fields first, then alphabetical remaining fields, skipping empty values and hiding fields', async () => {
  const md = await parsed();
  const fields = selectMetadata(md, {
    top: [{ name: 'zebra' }, { name: 'name' }, { name: 'missing' }],
    hide: ['@id', '@type', 'identifier'],
  });
  expect(fields.map(({ name }) => name)).toEqual(['zebra', 'name', 'author', 'blank']);
  expect(fields[2]?.data).toEqual(md.author);
  const authors = fields[2]?.data as unknown as { affiliation: RoCrate[] }[];
  md.name = ['Updated'];
  expect(authors[0]?.affiliation[0]?.name).toEqual(['Updated']);
  expect(md.author?.[0]).toMatchObject({ affiliation: [{ name: ['Updated'] }] });
});

it('preserves explicit order, identifier paths and linked values without exposing unrequested fields', async () => {
  const md = await parsed();
  const fields = selectMetadata(md, {
    mode: 'explicit',
    show: ['identifier.identifier', 'missing', 'author', 'name', 'blank', 'identifier.absent'],
  });
  expect(fields.map(({ name }) => name)).toEqual(['identifier', 'author', 'name', 'blank']);
  expect(fields[0]?.data).toBe('ID-1');
  expect(fields[1]?.data).toEqual(md.author);
  // RO-Crate wraps scalar empty strings in arrays; the original retained [''].
  expect(fields[3]?.data).toEqual(['']);
  expect(extractPropertyFromIdentifier(md.identifier, 'absent')).toBeUndefined();
});

it('keeps top fields even if also hidden, and preserves zero and false extension values', () => {
  const md = { name: ['Record'], hidden: ['value'], zero: 0, false: false, empty: {} } as unknown as RoCrate;
  expect(selectMetadata(md, { top: [{ name: 'hidden' }], hide: ['hidden', 'name'] })).toEqual([
    { name: 'hidden', data: ['value'] },
    { name: 'false', data: false },
    { name: 'zero', data: 0 },
  ]);
});

it('uses metadata names, then scalar/array fallbacks, then an empty string', () => {
  expect(metadataName({ name: ['Record'] }, 'Fallback')).toBe('Record');
  expect(metadataName({ name: [] }, ['Fallback'])).toBe('Fallback');
  expect(metadataName({ name: [] }, 'Fallback')).toBe('Fallback');
  expect(metadataName({ name: [] })).toBe('');
});

it('interprets loaded mapping data by first nonblank label and ID, without any fetch', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not load anything'));
  try {
    const names = await buildMetadataNameMap({
      '@context': 'https://w3id.org/ro/crate/1.1/context',
      '@graph': [
        { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
        { '@id': './', '@type': 'Dataset', name: 'Mapping' },
        { '@id': 'https://vocab.test/term', 'rdfs:label': [' ', ' shortCode '], name: [' ', 'Readable Name'] },
        { '@id': '#unnamed', 'rdfs:label': 'noName' },
        { '@id': '#last', 'rdfs:label': 'shortCode', name: 'Last Wins' },
      ],
    });
    expect(names.get('https://vocab.test/term')).toBe('Readable Name');
    expect(names.get('shortCode')).toBe('Last Wins');
    expect(names.get('#last')).toBe('Last Wins');
    expect(names.has('noName')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it('uses configured mapping labels and preserves unknown names even when loading failed', () => {
  const names = new Map([['shortCode', 'Readable Name']]);
  expect(metadataLabel('shortCode', { names, mappingConfigured: true })).toBe('Readable Name');
  expect(metadataLabel('unknownCode', { names, mappingConfigured: true })).toBe('unknownCode');
  expect(metadataLabel('shortCode', { mappingConfigured: true })).toBe('shortCode');
});

it('start-cases Unicode and camel case with ordered regex replacements when no mapping is configured', () => {
  expect(metadataLabel('datePublished')).toBe('Date Published');
  expect(metadataLabel('café_研究-data')).toBe('Café 研究 Data');
  expect(metadataLabel('iso_code', { textReplacements: { '^iso': 'ISO' } })).toBe('ISO Code');
  expect(metadataLabel('')).toBe('');
});
