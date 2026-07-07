import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiService } from '@/services/api';
import { useCapabilitiesStore } from '@/stores/capabilities';
import { validPayload } from './fixtures/capabilities';

const stubApi = (getCapabilities: () => Promise<object>) => ({ getCapabilities }) as unknown as ApiService;

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
