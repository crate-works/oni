import { captureMessage } from '@sentry/vue';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  type Capabilities,
  dateFilterNames,
  type Filters,
  facetTypeFor,
  findUnsupportedFacets,
  parseCapabilities,
  stripUnsupportedFilters,
} from '@/capabilities';
import { type AggregationInput, ui } from '@/configuration';
import { startCase } from '@/lib/metadata';
import type { ApiService } from '@/services/api';

// Session-scoped feature detection against the archive's GET /capabilities
// endpoint. Fetched once at startup, never persisted — stale capabilities must
// not survive an API redeploy. A missing, unreachable, or malformed endpoint
// is non-conformance: status becomes 'failed', features degrade gracefully and
// the operator is told via the console and Sentry. Nothing is surfaced to end
// users — degradation is silent by design and there is nothing they can act on.
export const useCapabilitiesStore = defineStore('capabilities', () => {
  const failed = ref(false);
  const capabilities = ref<Capabilities>();
  const status = computed(() => (failed.value ? 'failed' : capabilities.value ? 'loaded' : 'pending'));

  // Empty while pending or failed — the mismatch check only judges a loaded
  // response; the failed state is reported on its own.
  const unsupportedFacets = computed(() =>
    capabilities.value ? findUnsupportedFacets(ui.aggregations ?? [], capabilities.value.search.facets) : [],
  );

  // Configured facets this portal can't render: the archive types the filter
  // with something a later spec revision added, or declares the facet without
  // the matching filter. The spec's rule is to hide them, so they're reported
  // to the operator rather than left to vanish from a curated panel with no
  // explanation. Names unsupportedFacets already covers are left to it — same
  // offender, more specific cause. Empty while pending or failed: nothing to
  // judge against.
  const hiddenFacets = computed(() => {
    const search = capabilities.value?.search;
    if (!search || !ui.aggregations) {
      return [];
    }

    return ui.aggregations
      .map(({ name }) => name)
      .filter((name) => !unsupportedFacets.value.includes(name) && facetTypeFor(name, search) === null);
  });

  // The facet definitions driving the search UI. Configured aggregations win —
  // curation, renaming, reordering and date_histogram facets stay possible —
  // otherwise every facet the archive declares is shown under its capability
  // label (falling back to the start-cased field name), in declaration order,
  // typed from the filter declaration that backs it. Empty until capabilities
  // loads (and stays empty on failure) when nothing is configured.
  //
  // Either way, a facet this portal can't render is dropped. A configured one
  // keeps the presentation it was authored with — the hide rule governs whether
  // it appears, not how it looks — and is only judged once capabilities loads,
  // so the panel doesn't flicker while the request is in flight.
  const facetConfig = computed<AggregationInput[]>(() => {
    const search = capabilities.value?.search;

    if (ui.aggregations) {
      return search ? ui.aggregations.filter(({ name }) => facetTypeFor(name, search) !== null) : ui.aggregations;
    }

    if (!search) {
      return [];
    }

    return Object.entries(search.facets).flatMap(([name, { label }]) => {
      const type = facetTypeFor(name, search);

      return type ? [{ name, display: label ?? startCase(name), type }] : [];
    });
  });

  // The fields whose filter values go out as ranges rather than exact terms.
  // The archive's own declaration is authoritative — the wire format follows
  // the filter's type, not how the panel chose to present it — and configured
  // date_histogram facets are unioned in so the encoding still holds when
  // capabilities is pending or failed.
  const dateFilters = computed(
    () =>
      new Set([
        ...(capabilities.value ? dateFilterNames(capabilities.value.search) : []),
        ...(ui.aggregations ?? []).flatMap((a) => (a.type === 'date_histogram' ? [a.name] : [])),
      ]),
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
      const message =
        "This archive's API does not conform to the RO-Crate API spec: GET /capabilities is missing or invalid";
      console.warn(message);
      captureMessage(message, 'error');

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

    if (hiddenFacets.value.length > 0) {
      const offenders = hiddenFacets.value.join(', ');
      console.warn(
        `This site's configuration declares search facets this portal cannot render, so they are hidden: ${offenders}`,
      );
      captureMessage(`Configured facets hidden as unrenderable: ${offenders}`, 'error');
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

  return {
    status,
    capabilities,
    unsupportedFacets,
    hiddenFacets,
    facetConfig,
    dateFilters,
    init,
    hasExtension,
    supportedFilters,
    sanitiseFilters,
  };
});
