import { captureMessage } from '@sentry/vue';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  type Capabilities,
  type Filters,
  findUnsupportedFacets,
  parseCapabilities,
  stripUnsupportedFilters,
} from '@/capabilities';
import { ui } from '@/configuration';
import type { ApiService } from '@/services/api';

// Session-scoped feature detection against the archive's GET /capabilities
// endpoint. Fetched once at startup, never persisted — stale capabilities must
// not survive an API redeploy. A missing, unreachable, or malformed endpoint
// is non-conformance: status becomes 'failed' and features degrade gracefully.
export const useCapabilitiesStore = defineStore('capabilities', () => {
  const failed = ref(false);
  const capabilities = ref<Capabilities>();
  const status = computed(() => (failed.value ? 'failed' : capabilities.value ? 'loaded' : 'pending'));

  // Empty while pending or failed — the mismatch check only judges a loaded
  // response; in the failed state the banner already covers non-conformance.
  const unsupportedFacets = computed(() =>
    capabilities.value ? findUnsupportedFacets(ui.aggregations, capabilities.value.search.facets) : [],
  );

  const init = async (api: ApiService) => {
    let response: unknown;
    try {
      response = await api.getCapabilities();
    } catch {
      response = null;
    }

    const parsed = parseCapabilities(response);
    if (!parsed) {
      failed.value = true;
      console.warn(
        "This archive's API does not conform to the RO-Crate API spec: GET /capabilities is missing or invalid",
      );

      return;
    }

    capabilities.value = parsed;

    if (unsupportedFacets.value.length > 0) {
      const offenders = unsupportedFacets.value.join(', ');
      console.warn(
        `This site's configuration declares search facets the archive's API does not support, which can break search: ${offenders}`,
      );
      captureMessage(`Configured facets not supported by the archive's API: ${offenders}`, 'error');
    }
  };

  const hasExtension = (name: string) => name in (capabilities.value?.extensions ?? {});

  // The keys allowed in a search request's filters object — the spec's
  // search.filters, a superset of facets that also holds filter-only fields
  // like dates. Null while pending or failed — the "can't judge" signal, as
  // opposed to an empty set which would mean "the archive declares no filters".
  const supportedFilters = computed(() =>
    capabilities.value ? new Set(Object.keys(capabilities.value.search.filters)) : null,
  );

  // Dropped keys come from stale bookmarks and shared URLs — expected client
  // drift, not a deployment error, so they warn once per key per session and
  // don't go to Sentry.
  const warnedFilters = new Set<string>();
  const sanitiseFilters = (filters: Filters) => {
    const { filters: sanitised, dropped } = stripUnsupportedFilters(filters, supportedFilters.value);

    const fresh = dropped.filter((name) => !warnedFilters.has(name));
    if (fresh.length > 0) {
      for (const name of fresh) {
        warnedFilters.add(name);
      }
      console.warn(`Dropping search filters not supported by the archive's API: ${fresh.join(', ')}`);
    }

    return sanitised;
  };

  const showBanner = computed(() => failed.value || unsupportedFacets.value.length > 0);

  return { status, capabilities, unsupportedFacets, init, hasExtension, supportedFilters, sanitiseFilters, showBanner };
});
