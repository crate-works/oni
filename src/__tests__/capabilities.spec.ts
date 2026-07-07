import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { findUnsupportedFacets, parseCapabilities, stripUnsupportedFilters } from '@/capabilities';
import { validPayload } from './fixtures/capabilities';

describe('parseCapabilities', () => {
  it('parses a valid payload', () => {
    const capabilities = parseCapabilities(validPayload);

    expect(capabilities).toEqual(validPayload);
  });

  it('tolerates unknown extension identifiers', () => {
    const payload = { ...validPayload, extensions: { segments: { maxSegments: 5 }, announcements: {} } };

    const capabilities = parseCapabilities(payload);

    expect(capabilities?.extensions).toHaveProperty('announcements');
  });

  it('tolerates unknown extension config properties', () => {
    const payload = { ...validPayload, extensions: { segments: { maxSegments: 5, futureOption: true } } };

    expect(parseCapabilities(payload)?.extensions.segments).toEqual({ maxSegments: 5, futureOption: true });
  });

  it('tolerates unknown top-level fields', () => {
    const payload = { ...validPayload, futureField: 'anything' };

    expect(parseCapabilities(payload)).toEqual(payload);
  });

  it('tolerates unknown facet config properties', () => {
    const payload = { ...validPayload, facets: { inLanguage: { label: 'Language', futureOption: 7 } } };

    expect(parseCapabilities(payload)).toEqual(payload);
  });

  it('rejects a payload missing apiVersion', () => {
    const { apiVersion: _, ...payload } = validPayload;

    expect(parseCapabilities(payload)).toBe(null);
  });

  it('rejects wrongly typed fields', () => {
    expect(parseCapabilities({ ...validPayload, facets: 'not-an-object' })).toBe(null);
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

    expect(findUnsupportedFacets(aggregations, validPayload.facets)).toEqual(['bogusFacet', 'anotherBogus']);
  });

  it('returns nothing when declared facets are merely omitted from the configuration', () => {
    expect(findUnsupportedFacets([{ name: 'mediaType' }], validPayload.facets)).toEqual([]);
  });

  it('matches by name only, ignoring capability labels and aggregation types', () => {
    const aggregations = [
      { name: 'inLanguage', display: 'Renamed By Config', type: 'standard' },
      { name: 'mediaType', display: 'Media', type: 'date_histogram' },
    ];

    expect(findUnsupportedFacets(aggregations, validPayload.facets)).toEqual([]);
  });

  it('returns nothing for an empty configuration', () => {
    expect(findUnsupportedFacets([], validPayload.facets)).toEqual([]);
  });
});

describe('stripUnsupportedFilters', () => {
  let warn: MockInstance;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops filter keys the API does not declare', () => {
    const filters = { inLanguage: ['English'], bogusFacet: ['whatever'] };

    expect(stripUnsupportedFilters(filters, new Set(['inLanguage']))).toEqual({ inLanguage: ['English'] });
  });

  it('passes filters through untouched when the supported set is unknown', () => {
    const filters = { bogusFacet: ['whatever'] };

    expect(stripUnsupportedFilters(filters, null)).toBe(filters);
  });

  it('logs each dropped filter key to the console', () => {
    stripUnsupportedFilters({ bogusFacet: ['a'], anotherBogus: ['b'] }, new Set(['inLanguage']));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bogusFacet'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('anotherBogus'));
  });

  it('preserves supported keys and their values exactly', () => {
    const filters = { inLanguage: ['English', 'Tok Pisin'], mediaType: ['audio/wav'] };

    expect(stripUnsupportedFilters(filters, new Set(['inLanguage', 'mediaType']))).toEqual(filters);
  });

  it('is a no-op for empty filters', () => {
    expect(stripUnsupportedFilters({}, new Set(['inLanguage']))).toEqual({});
  });
});
