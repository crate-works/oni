import { describe, expect, it } from 'vitest';

import { findUnsupportedFacets, parseCapabilities, stripUnsupportedFilters } from '@/capabilities';
import { validPayload } from './fixtures/capabilities';

describe('parseCapabilities', () => {
  it('parses a valid payload', () => {
    const capabilities = parseCapabilities(validPayload);

    expect(capabilities).toEqual(validPayload);
  });

  it('tolerates unknown extension identifiers', () => {
    const payload = { ...validPayload, extensions: { segments: {}, announcements: {} } };

    const capabilities = parseCapabilities(payload);

    expect(capabilities?.extensions).toHaveProperty('announcements');
  });

  it('tolerates unknown extension config properties', () => {
    const payload = { ...validPayload, extensions: { segments: { futureOption: true } } };

    expect(parseCapabilities(payload)?.extensions.segments).toEqual({ futureOption: true });
  });

  it('tolerates unknown top-level fields', () => {
    const payload = { ...validPayload, futureField: 'anything' };

    expect(parseCapabilities(payload)).toEqual(payload);
  });

  it('tolerates unknown facet config properties', () => {
    const payload = {
      ...validPayload,
      search: { ...validPayload.search, facets: { inLanguage: { label: 'Language', futureOption: 7 } } },
    };

    expect(parseCapabilities(payload)).toEqual(payload);
  });

  it('tolerates unrecognised filter types', () => {
    const payload = {
      ...validPayload,
      search: { ...validPayload.search, filters: { ...validPayload.search.filters, shape: { type: 'geo' } } },
    };

    expect(parseCapabilities(payload)).toEqual(payload);
  });

  it('tolerates a payload from an archive predating spec 0.3.0', () => {
    const { deposit: _deposit, tombstonePolicy: _policy, ...payload } = validPayload;

    expect(parseCapabilities(payload)).toEqual(payload);
  });

  it('tolerates an unrecognised tombstone policy rather than failing the document', () => {
    const capabilities = parseCapabilities({ ...validPayload, tombstonePolicy: '418' });

    expect(capabilities?.tombstonePolicy).toBeUndefined();
    expect(capabilities?.search).toEqual(validPayload.search);
  });

  it('rejects a payload missing apiVersion', () => {
    const { apiVersion: _, ...payload } = validPayload;

    expect(parseCapabilities(payload)).toBe(null);
  });

  it('rejects a payload missing search', () => {
    const { search: _, ...payload } = validPayload;

    expect(parseCapabilities(payload)).toBe(null);
  });

  it('rejects a filter declaration without a type', () => {
    const payload = { ...validPayload, search: { ...validPayload.search, filters: { inLanguage: {} } } };

    expect(parseCapabilities(payload)).toBe(null);
  });

  it('rejects wrongly typed fields', () => {
    expect(parseCapabilities({ ...validPayload, search: 'not-an-object' })).toBe(null);
    expect(parseCapabilities({ ...validPayload, search: { ...validPayload.search, facets: 'not-an-object' } })).toBe(
      null,
    );
    expect(parseCapabilities({ ...validPayload, extensions: ['segments'] })).toBe(null);
    expect(parseCapabilities({ ...validPayload, apiVersion: 1 })).toBe(null);
  });

  it('rejects structural garbage', () => {
    expect(parseCapabilities(null)).toBe(null);
    expect(parseCapabilities('capabilities')).toBe(null);
    expect(parseCapabilities({ error: 'Not found' })).toBe(null);
  });
});

describe('findUnsupportedFacets', () => {
  it('returns configured facet names the API does not declare', () => {
    const aggregations = [{ name: 'inLanguage' }, { name: 'bogusFacet' }, { name: 'anotherBogus' }];

    expect(findUnsupportedFacets(aggregations, validPayload.search.facets)).toEqual(['bogusFacet', 'anotherBogus']);
  });

  it('returns nothing when declared facets are merely omitted from the configuration', () => {
    expect(findUnsupportedFacets([{ name: 'mediaType' }], validPayload.search.facets)).toEqual([]);
  });

  it('matches by name only, ignoring capability labels and aggregation types', () => {
    const aggregations = [
      { name: 'inLanguage', display: 'Renamed By Config', type: 'standard' },
      { name: 'mediaType', display: 'Media', type: 'date_histogram' },
    ];

    expect(findUnsupportedFacets(aggregations, validPayload.search.facets)).toEqual([]);
  });

  it('returns nothing for an empty configuration', () => {
    expect(findUnsupportedFacets([], validPayload.search.facets)).toEqual([]);
  });
});

describe('stripUnsupportedFilters', () => {
  it('drops filter keys the API does not declare and reports them', () => {
    const filters = { inLanguage: ['English'], bogusFacet: ['a'], anotherBogus: ['b'] };

    expect(stripUnsupportedFilters(filters, new Set(['inLanguage']))).toEqual({
      filters: { inLanguage: ['English'] },
      dropped: ['bogusFacet', 'anotherBogus'],
    });
  });

  it('passes filters through untouched when the supported set is unknown', () => {
    const filters = { bogusFacet: ['whatever'] };

    expect(stripUnsupportedFilters(filters, null)).toEqual({ filters, dropped: [] });
  });

  it('returns the input object itself when every key is supported', () => {
    const filters = { inLanguage: ['English', 'Tok Pisin'], mediaType: ['audio/wav'] };

    const result = stripUnsupportedFilters(filters, new Set(['inLanguage', 'mediaType']));

    expect(result.filters).toBe(filters);
    expect(result.dropped).toEqual([]);
  });

  it('is a no-op for empty filters', () => {
    expect(stripUnsupportedFilters({}, new Set(['inLanguage']))).toEqual({ filters: {}, dropped: [] });
  });
});
