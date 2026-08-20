import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/configuration');
vi.mock('@sentry/vue', () => ({ captureMessage: vi.fn() }));

import { captureMessage } from '@sentry/vue';
import { ui } from '@/configuration';
import type { ApiService } from '@/services/api';
import { useCapabilitiesStore } from '@/stores/capabilities';
import { validPayload } from './fixtures/capabilities';

const stubApi = (getCapabilities: () => Promise<object>) => ({ getCapabilities }) as unknown as ApiService;

const aggregation = (name: string) => ({ display: name, name, type: 'standard' as const, active: false });

// 'shape' is typed with something a later spec revision added; 'orphan' is
// declared as a facet the archive never backed with a filter.
const unrenderablePayload = {
  ...validPayload,
  search: {
    filters: { ...validPayload.search.filters, shape: { type: 'geo' } },
    facets: { ...validPayload.search.facets, shape: { label: 'Shape' }, orphan: { label: 'Orphan' } },
  },
};

const load = async (store: ReturnType<typeof useCapabilitiesStore>) => {
  await store.init(stubApi(async () => validPayload));
};

const fail = async (store: ReturnType<typeof useCapabilitiesStore>) => {
  await store.init(
    stubApi(async () => {
      throw new Error('network error');
    }),
  );
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.clearAllMocks();
  ui.aggregations = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('capabilities store', () => {
  it('starts pending', () => {
    const store = useCapabilitiesStore();

    expect(store.status).toBe('pending');
  });

  it('transitions to loaded with the parsed payload on a valid response', async () => {
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.status).toBe('loaded');
    expect(store.capabilities).toEqual(validPayload);
  });

  it('transitions to failed with a console warning when the fetch throws', async () => {
    const store = useCapabilitiesStore();

    await fail(store);

    expect(store.status).toBe('failed');
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('transitions to failed on a 404 error response', async () => {
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => ({ error: 'Not found' })));

    expect(store.status).toBe('failed');
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('transitions to failed on a malformed payload', async () => {
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => ({ apiVersion: '0.1.0' })));

    expect(store.status).toBe('failed');
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('capabilities store getters', () => {
  describe('hasExtension', () => {
    it('is false while pending', () => {
      expect(useCapabilitiesStore().hasExtension('segments')).toBe(false);
    });

    it('is false when failed', async () => {
      const store = useCapabilitiesStore();
      await fail(store);

      expect(store.hasExtension('segments')).toBe(false);
    });

    it('is true only for declared extensions when loaded', async () => {
      const store = useCapabilitiesStore();
      await load(store);

      expect(store.hasExtension('segments')).toBe(true);
      expect(store.hasExtension('announcements')).toBe(false);
    });
  });

  describe('supportedFilters', () => {
    it('is null while pending', () => {
      expect(useCapabilitiesStore().supportedFilters).toBe(null);
    });

    it('is null when failed', async () => {
      const store = useCapabilitiesStore();
      await fail(store);

      expect(store.supportedFilters).toBe(null);
    });

    it('is the set of declared filter names when loaded, including filter-only fields', async () => {
      const store = useCapabilitiesStore();
      await load(store);

      expect(store.supportedFilters).toEqual(new Set(['inLanguage', 'mediaType', 'createdAt']));
    });
  });

  describe('sanitiseFilters', () => {
    it('passes filters through untouched while pending', () => {
      const filters = { bogusFacet: ['whatever'] };

      expect(useCapabilitiesStore().sanitiseFilters(filters)).toBe(filters);
    });

    it('drops undeclared keys once loaded', async () => {
      const store = useCapabilitiesStore();
      await load(store);

      const sanitised = store.sanitiseFilters({ inLanguage: ['English'], bogusFacet: ['whatever'] });

      expect(sanitised).toEqual({ inLanguage: ['English'] });
    });

    it('keeps filter-only fields that are not facets', async () => {
      const store = useCapabilitiesStore();
      await load(store);

      const filters = { createdAt: ['2020'] };

      expect(store.sanitiseFilters(filters)).toBe(filters);
    });

    it('warns once per dropped key across repeated requests', async () => {
      const store = useCapabilitiesStore();
      await load(store);

      store.sanitiseFilters({ bogusFacet: ['a'] });
      store.sanitiseFilters({ bogusFacet: ['a'], anotherBogus: ['b'] });
      store.sanitiseFilters({ anotherBogus: ['b'] });

      expect(console.warn).toHaveBeenCalledTimes(2);
      expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain('bogusFacet');
      expect(vi.mocked(console.warn).mock.calls[1]?.[0]).toContain('anotherBogus');
    });
  });

  describe('showBanner', () => {
    it('is false while pending', () => {
      expect(useCapabilitiesStore().showBanner).toBe(false);
    });

    it('is true when failed', async () => {
      const store = useCapabilitiesStore();
      await fail(store);

      expect(store.showBanner).toBe(true);
    });

    it('is false when loaded', async () => {
      const store = useCapabilitiesStore();
      await load(store);

      expect(store.showBanner).toBe(false);
    });
  });
});

describe('capabilities store facet mismatch check', () => {
  it('records configured facets the API does not declare and shows the banner', async () => {
    ui.aggregations = [aggregation('inLanguage'), aggregation('bogusFacet')];
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.unsupportedFacets).toEqual(['bogusFacet']);
    expect(store.showBanner).toBe(true);
  });

  it('warns once on the console naming all offending facets', async () => {
    ui.aggregations = [aggregation('bogusFacet'), aggregation('anotherBogus')];
    const store = useCapabilitiesStore();

    await load(store);

    expect(console.warn).toHaveBeenCalledOnce();
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain('bogusFacet, anotherBogus');
  });

  it('raises one Sentry error naming the offending facets', async () => {
    ui.aggregations = [aggregation('bogusFacet')];
    const store = useCapabilitiesStore();

    await load(store);

    expect(captureMessage).toHaveBeenCalledOnce();
    expect(vi.mocked(captureMessage).mock.calls[0]?.[0]).toContain('bogusFacet');
    expect(vi.mocked(captureMessage).mock.calls[0]?.[1]).toBe('error');
  });

  it('produces nothing when the configuration only uses declared facets', async () => {
    ui.aggregations = [aggregation('inLanguage'), aggregation('mediaType')];
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.unsupportedFacets).toEqual([]);
    expect(store.showBanner).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('skips the check entirely when capabilities failed', async () => {
    ui.aggregations = [aggregation('bogusFacet')];
    const store = useCapabilitiesStore();

    await fail(store);

    expect(store.unsupportedFacets).toEqual([]);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('skips the check when aggregations are not configured', async () => {
    ui.aggregations = undefined;
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.unsupportedFacets).toEqual([]);
    expect(store.showBanner).toBe(false);
  });
});

describe('capabilities store facetConfig', () => {
  beforeEach(() => {
    ui.aggregations = undefined;
  });

  it('returns configured aggregations verbatim when the configuration declares them', async () => {
    ui.aggregations = [aggregation('inLanguage')];
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.facetConfig).toEqual([aggregation('inLanguage')]);
  });

  it('drops a configured facet whose filter type it does not recognise', async () => {
    ui.aggregations = [aggregation('inLanguage'), aggregation('shape')];
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => unrenderablePayload));

    expect(store.facetConfig).toEqual([aggregation('inLanguage')]);
  });

  it('drops a configured facet the archive never declared as a filter', async () => {
    ui.aggregations = [aggregation('inLanguage'), aggregation('orphan')];
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => unrenderablePayload));

    expect(store.facetConfig.map((f) => f.name)).toEqual(['inLanguage']);
  });

  it('keeps a renderable configured facet exactly as authored', async () => {
    const authored = { display: 'Year', name: 'createdAt', type: 'date_histogram' as const, active: true };
    ui.aggregations = [authored];
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.facetConfig).toEqual([authored]);
  });

  it('shows the configured panel in full while capabilities is still pending', () => {
    ui.aggregations = [aggregation('inLanguage'), aggregation('shape')];

    expect(useCapabilitiesStore().facetConfig).toEqual([aggregation('inLanguage'), aggregation('shape')]);
  });

  it('shows the configured panel in full when capabilities failed', async () => {
    ui.aggregations = [aggregation('inLanguage'), aggregation('shape')];
    const store = useCapabilitiesStore();

    await fail(store);

    expect(store.facetConfig).toEqual([aggregation('inLanguage'), aggregation('shape')]);
  });

  it('honours a deliberately empty configured list even once capabilities loads', async () => {
    ui.aggregations = [];
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.facetConfig).toEqual([]);
  });

  it('derives facets from capabilities when aggregations are not configured', async () => {
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.facetConfig).toEqual([
      { name: 'inLanguage', display: 'Language', type: 'standard' },
      { name: 'mediaType', display: 'Media Type', type: 'standard' },
    ]);
  });

  it('types a derived facet as a date histogram when its filter is a date', async () => {
    const store = useCapabilitiesStore();

    await store.init(
      stubApi(async () => ({
        ...validPayload,
        search: { ...validPayload.search, facets: { createdAt: { label: 'Date created' } } },
      })),
    );

    expect(store.facetConfig).toEqual([{ name: 'createdAt', display: 'Date created', type: 'date_histogram' }]);
  });

  it('hides a derived facet whose filter type it does not recognise', async () => {
    const store = useCapabilitiesStore();

    await store.init(
      stubApi(async () => ({
        ...validPayload,
        search: {
          filters: { ...validPayload.search.filters, shape: { type: 'geo' } },
          facets: { inLanguage: { label: 'Language' }, shape: { label: 'Shape' } },
        },
      })),
    );

    expect(store.facetConfig).toEqual([{ name: 'inLanguage', display: 'Language', type: 'standard' }]);
  });

  it('hides a derived facet the archive never declared as a filter', async () => {
    const store = useCapabilitiesStore();

    await store.init(
      stubApi(async () => ({
        ...validPayload,
        search: { ...validPayload.search, facets: { inLanguage: {}, orphan: {} } },
      })),
    );

    expect(store.facetConfig.map((f) => f.name)).toEqual(['inLanguage']);
  });

  it('is empty while pending when aggregations are not configured', () => {
    expect(useCapabilitiesStore().facetConfig).toEqual([]);
  });

  it('is empty when capabilities failed and aggregations are not configured', async () => {
    const store = useCapabilitiesStore();

    await fail(store);

    expect(store.facetConfig).toEqual([]);
  });
});

describe('capabilities store dateFilters', () => {
  it("takes the archive's date filter declarations", async () => {
    const store = useCapabilitiesStore();

    await load(store);

    expect([...store.dateFilters]).toEqual(['createdAt']);
  });

  it('unions in configured date_histogram facets so encoding survives a failure', async () => {
    ui.aggregations = [{ display: 'Year', name: 'dateCreated', type: 'date_histogram', active: false }];
    const store = useCapabilitiesStore();

    await fail(store);

    expect([...store.dateFilters]).toEqual(['dateCreated']);
  });

  it('is empty while pending with nothing configured', () => {
    expect([...useCapabilitiesStore().dateFilters]).toEqual([]);
  });
});

describe('capabilities store hiddenFacets', () => {
  it('records configured facets it cannot render and shows the banner', async () => {
    ui.aggregations = [aggregation('inLanguage'), aggregation('shape'), aggregation('orphan')];
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => unrenderablePayload));

    expect(store.hiddenFacets).toEqual(['shape', 'orphan']);
    expect(store.showBanner).toBe(true);
  });

  it('warns on the console and reports to Sentry naming the offenders', async () => {
    ui.aggregations = [aggregation('shape')];
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => unrenderablePayload));

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('shape'));
    expect(captureMessage).toHaveBeenCalledWith(expect.stringContaining('shape'), 'error');
  });

  it('leaves a facet the archive does not declare at all to unsupportedFacets', async () => {
    ui.aggregations = [aggregation('bogusFacet')];
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => unrenderablePayload));

    expect(store.unsupportedFacets).toEqual(['bogusFacet']);
    expect(store.hiddenFacets).toEqual([]);
  });

  it('is empty when every configured facet is renderable', async () => {
    ui.aggregations = [aggregation('inLanguage')];
    const store = useCapabilitiesStore();

    await load(store);

    expect(store.hiddenFacets).toEqual([]);
    expect(store.showBanner).toBe(false);
  });

  it('is empty while capabilities is pending', () => {
    ui.aggregations = [aggregation('shape')];

    expect(useCapabilitiesStore().hiddenFacets).toEqual([]);
  });
});
