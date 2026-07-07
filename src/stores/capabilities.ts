import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { type Capabilities, parseCapabilities } from '@/capabilities';
import type { ApiService } from '@/services/api';

// Session-scoped feature detection against the archive's GET /capabilities
// endpoint. Fetched once at startup, never persisted — stale capabilities must
// not survive an API redeploy. A missing, unreachable, or malformed endpoint
// is non-conformance: status becomes 'failed' and features degrade gracefully.
export const useCapabilitiesStore = defineStore('capabilities', () => {
  const status = ref<'pending' | 'loaded' | 'failed'>('pending');
  const capabilities = ref<Capabilities>();

  const init = async (api: ApiService) => {
    let response: unknown;
    try {
      response = await api.getCapabilities();
    } catch {
      response = null;
    }

    const parsed = parseCapabilities(response);
    if (!parsed) {
      status.value = 'failed';
      console.warn(
        "This archive's API does not conform to the RO-Crate API spec: GET /capabilities is missing or invalid",
      );

      return;
    }

    capabilities.value = parsed;
    status.value = 'loaded';
  };

  // capabilities is only ever set on a successful load, so these fail closed
  // while pending or failed.
  const hasExtension = (name: string) => name in (capabilities.value?.extensions ?? {});

  // Null while pending or failed — the "can't judge" signal, as opposed to an
  // empty set which would mean "the archive declares no facets".
  const supportedFacets = computed(() => (capabilities.value ? new Set(Object.keys(capabilities.value.facets)) : null));

  const showBanner = computed(() => status.value === 'failed');

  return { status, capabilities, init, hasExtension, supportedFacets, showBanner };
});
