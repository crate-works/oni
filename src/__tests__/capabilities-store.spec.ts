import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The configuration module fetches /configuration.json at import time, which
// isn't available under vitest — stub the one field the store reads. Tests
// mutate ui.aggregations to simulate different configurations.
vi.mock('@/configuration', () => ({ ui: { aggregations: [] } }));
vi.mock('@sentry/vue', () => ({ captureMessage: vi.fn() }));

import { captureMessage } from '@sentry/vue';
import { ui } from '@/configuration';
import type { ApiService } from '@/services/api';
import { useCapabilitiesStore } from '@/stores/capabilities';
import { validPayload } from './fixtures/capabilities';

const stubApi = (getCapabilities: () => Promise<object>) => ({ getCapabilities }) as unknown as ApiService;

const aggregation = (name: string) => ({ display: name, name, type: 'standard' as const, active: false });

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

describe('capabilities store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('starts pending', () => {
    const store = useCapabilitiesStore();

    expect(store.status).toBe('pending');
  });

  it('transitions to loaded with the parsed payload on a valid response', async () => {
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => validPayload));

    expect(store.status).toBe('loaded');
    expect(store.capabilities).toEqual(validPayload);
  });

  it('transitions to failed with a console warning when the fetch throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = useCapabilitiesStore();

    await store.init(
      stubApi(async () => {
        throw new Error('network error');
      }),
    );

    expect(store.status).toBe('failed');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('transitions to failed on a 404 error response', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => ({ error: 'Not found' })));

    expect(store.status).toBe('failed');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('transitions to failed on a malformed payload', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = useCapabilitiesStore();

    await store.init(stubApi(async () => ({ apiVersion: '0.1.0' })));

    expect(store.status).toBe('failed');
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('capabilities store getters', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

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

  describe('supportedFacets', () => {
    it('is null while pending', () => {
      expect(useCapabilitiesStore().supportedFacets).toBe(null);
    });

    it('is null when failed', async () => {
      const store = useCapabilitiesStore();
      await fail(store);

      expect(store.supportedFacets).toBe(null);
    });

    it('is the set of declared facet names when loaded', async () => {
      const store = useCapabilitiesStore();
      await load(store);

      expect(store.supportedFacets).toEqual(new Set(['inLanguage', 'mediaType']));
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
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    ui.aggregations = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

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
});
