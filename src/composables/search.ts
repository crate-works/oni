import { useGtm } from '@gtm-support/vue-gtm';
import {
  type AdvancedSearchLine,
  aggregateIntoDecades,
  type Bucket,
  buildSearchParams,
  type HierarchicalBucket,
  normaliseBookmarkFilters,
  generateQueryString as sharedGenerateQueryString,
} from '@researchdatabox/oni-client';
import { inject, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { defaultPageSize, ui } from '@/configuration';
import type { ApiService, EntityType, GetSearchResponse } from '@/services/api';
import { useCapabilitiesStore } from '@/stores/capabilities';

const { mapConfig, searchFields } = ui;

export type { AdvancedSearchLine, Bucket, HierarchicalBucket } from '@researchdatabox/oni-client';

export type FacetType = {
  buckets: Bucket[] | HierarchicalBucket[];
  display: string;
  order: number;
  name: string;
  active: boolean;
  help?: string;
  type?: 'standard' | 'hierarchical';
};

export type SetSearchParamsOptions = {
  zoomLevel?: number;
  boundingBox?: { topRight: { lat: number; lng: number }; bottomLeft: { lat: number; lng: number } };
  advancedSearchLines?: AdvancedSearchLine[];
  advancedSearchEnabled?: boolean;
};

export const blankAdvancedSearchLine: AdvancedSearchLine = {
  field: 'all_fields',
  operation: 'AND',
  operator: 'AND',
  type: 'phrase',
  searchInput: '',
};

export const ordering = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
] as const;

export const generateQueryString = (lines: AdvancedSearchLine[]) =>
  sharedGenerateQueryString(lines, Object.keys(searchFields));

export const useSearch = (searchType: 'list' | 'map') => {
  const router = useRouter();
  const route = useRoute();
  const gtm = useGtm();

  const api = inject<ApiService>('api');
  if (!api) {
    throw new Error('API instance not provided');
  }

  const isMap = searchType === 'map';

  const capabilitiesStore = useCapabilitiesStore();

  // Search state
  const searchInput = ref('');
  const advancedSearchLines = ref<AdvancedSearchLine[]>([{ ...blankAdvancedSearchLine }]);
  const advancedSearchEnabled = ref(false);
  const filters = ref<Record<string, string[]>>({});

  // Pagination
  const pageSize = ref(defaultPageSize);
  const currentPage = ref(1);
  const totals = ref(0);

  // Other
  const facets = ref<FacetType[]>();
  const isLoading = ref(false);
  const filtersChanged = ref(false);
  const errorDialogText = ref<string | undefined>();
  const entities = ref<EntityType[]>([]);

  const more = ref(false);
  const filterButton = ref([]);
  const isBrowse = ref(false);

  const defaultOrder = ordering.find((o) => o.value === ui.search?.default.ordering) || ordering[0];
  const selectedOrder = ref(defaultOrder);

  const sorting = ui.search?.sorting || [{ value: 'relevance', label: 'Relevance' }];
  const defaultSorting = sorting.find((s) => s.value === ui.search?.default.sorting) || sorting[0];
  if (!defaultSorting) {
    throw new Error('No default sorting option found');
  }
  const selectedSorting = ref(defaultSorting);

  // Map Stuff
  const zoomLevel = ref(mapConfig.zoom);
  const boundingBox = ref(mapConfig.boundingBox);
  const geohashGrid = ref<Record<string, number>>({});

  const clearFilter = async (f: string, filterKey: string) => {
    if (filters.value[filterKey]) {
      filters.value[filterKey].splice(filters.value[filterKey].indexOf(f), 1);

      if (filters.value[filterKey].length === 0) {
        delete filters.value[filterKey];
      }

      await syncStateToUrlAndNavigate();
    }
  };

  const syncStateFromUrl = () => {
    searchInput.value = route.query.q?.toString() || '';

    filters.value = {};

    if (route.query.f) {
      const filterQuery = JSON.parse(decodeURIComponent(route.query.f.toString())) as Record<string, string[]>;
      filters.value = normaliseBookmarkFilters(filterQuery, capabilitiesStore.dateFilters);
    }

    if (route.query.a) {
      // TODO: We should really use zod to validate
      advancedSearchLines.value = JSON.parse(decodeURIComponent(route.query.a.toString())) as AdvancedSearchLine[];
      advancedSearchEnabled.value = true;
    }

    zoomLevel.value = route.query.z ? Number.parseInt(route.query.z.toString(), 10) : mapConfig.zoom;

    boundingBox.value = route.query.bb
      ? (JSON.parse(decodeURIComponent(route.query.bb.toString())) as typeof mapConfig.boundingBox)
      : mapConfig.boundingBox;
  };

  const syncStateToUrlAndNavigate = async () => {
    const query: { q?: string; f?: string; a?: string; z?: string; p?: string; bb?: string } = {};

    if (Object.keys(filters.value).length > 0) {
      query.f = encodeURIComponent(JSON.stringify(filters.value));
    }

    if (advancedSearchEnabled.value) {
      query.a = encodeURIComponent(JSON.stringify(advancedSearchLines.value));
      currentPage.value = 1;
    } else {
      query.q = searchInput.value ? searchInput.value.toString() : undefined;
    }

    if (isMap) {
      query.z = zoomLevel.value.toString();
      query.bb = encodeURIComponent(JSON.stringify(boundingBox.value));
    }

    await router.push({ path: isMap ? 'map' : 'search', query, replace: true });
  };

  const setSearchParams = (options: SetSearchParamsOptions) => {
    if (options.zoomLevel) {
      zoomLevel.value = options.zoomLevel;
    }

    if (options.boundingBox) {
      boundingBox.value = options.boundingBox;
    }

    if (options.advancedSearchLines) {
      advancedSearchLines.value = options.advancedSearchLines;
      syncStateToUrlAndNavigate();
    }

    if ('advancedSearchEnabled' in options) {
      advancedSearchEnabled.value = !!options.advancedSearchEnabled;
      if (advancedSearchEnabled.value) {
        searchInput.value = '';
      } else {
        advancedSearchLines.value = [blankAdvancedSearchLine];
      }
    }
  };

  const search = async () => {
    filtersChanged.value = false;

    isLoading.value = true;

    // Preserve the editor's visible wildcard default; the shared builder is pure.
    if (advancedSearchEnabled.value) {
      for (const line of advancedSearchLines.value) {
        if (line.searchInput === '') {
          line.searchInput = '*';
        }
      }
    }

    try {
      const params = buildSearchParams({
        query: searchInput.value.toString(),
        searchFields: Object.keys(searchFields),
        advancedSearchEnabled: advancedSearchEnabled.value,
        advancedSearchLines: advancedSearchLines.value,
        filters: filters.value,
        dateFields: capabilitiesStore.dateFilters,
        pageSize: pageSize.value,
        currentPage: currentPage.value,
        sort: selectedSorting.value?.value,
        order: selectedOrder.value?.value,
        map: isMap ? { zoomLevel: zoomLevel.value, boundingBox: boundingBox.value } : undefined,
      });

      const results = await api.search(params);
      if ('error' in results) {
        errorDialogText.value = results.error;
        isLoading.value = false;

        return;
      }

      entities.value = [];

      if (results.entities) {
        totals.value = results.total;

        for (const entity of results.entities) {
          entities.value.push(entity);
        }

        more.value = true;
      } else {
        more.value = false;
      }

      if (results.facets) {
        rawFacets.value = results.facets;
      }

      geohashGrid.value = results.geohashGrid;

      isLoading.value = false;

      gtm?.trackEvent({
        event: '/search',
        category: 'search',
        label: 'search',
      });
    } catch (e) {
      const err = e as Error;
      errorDialogText.value = err.message;
      isLoading.value = false;
    }
  };

  // The facet panel derives from the last search response plus the facet
  // definitions, which can change after the response lands: when
  // ui.aggregations is not configured they come from GET /capabilities, which
  // loads in parallel with the first search. This watch is the only writer of
  // facets; populateFacets isn't a pure derivation because it preserves each
  // facet's expanded state across searches.
  const rawFacets = ref<GetSearchResponse['facets']>();

  watch([rawFacets, () => capabilitiesStore.facetConfig], () => {
    if (rawFacets.value) {
      facets.value = populateFacets(rawFacets.value);
    }
  });

  const populateFacets = (newFacets: GetSearchResponse['facets']) => {
    const a: FacetType[] = [];
    const aggInfo = capabilitiesStore.facetConfig;

    for (const facet of Object.keys(newFacets)) {
      const order = aggInfo.findIndex((a) => a.name === facet);
      if (order < 0) {
        continue;
      }

      // biome-ignore lint/style/noNonNullAssertion: impossible for it to not exist
      const info = aggInfo[order]!;
      const display = info.display;
      const name = info.name;
      const help = info.help;
      const type = info.type;
      const hasSelectedValues = !!filters.value[facet] && filters.value[facet].length > 0;
      const existingFacet = facets.value?.find((f) => f.name === name);
      const active = Boolean(hasSelectedValues || existingFacet?.active || info.active);

      // biome-ignore lint/style/noNonNullAssertion: impossible for it to not exist
      const rawBuckets = newFacets[facet]!;

      // Process date histogram facets into hierarchical decade structure
      const buckets = type === 'date_histogram' ? aggregateIntoDecades(rawBuckets) : rawBuckets;

      a.push({
        buckets,
        display: display || facet,
        order,
        name,
        help,
        active,
        type: type === 'date_histogram' ? 'hierarchical' : 'standard',
      });
    }

    return a.sort((a, b) => a.order - b.order);
  };

  const onInputChange = (value: string) => {
    searchInput.value = value;
  };

  const resetSearch = async () => {
    scrollToTop();

    searchInput.value = '';
    filters.value = {};

    advancedSearchLines.value = [blankAdvancedSearchLine];

    selectedOrder.value = defaultOrder;
    filterButton.value = [];
    isBrowse.value = false;
    currentPage.value = 1;
    filters.value = {};

    zoomLevel.value = mapConfig.zoom;
    boundingBox.value = mapConfig.boundingBox;

    await router.push({ path: isMap ? 'map' : 'search' });
  };

  const scrollToTop = () => {
    setTimeout(() => {
      window.scrollTo(0, 0);
      const scrollable = document.querySelectorAll('[data-scroll-to-top]');

      for (const el of scrollable) {
        if (el.scrollTop > 0) {
          el.scrollTo({ top: 0 });
        }
      }
    }, 100);
  };

  const sortResults = (sort: string) => {
    currentPage.value = 1;
    selectedSorting.value = sorting.find(({ value }) => value === sort) || defaultSorting;
    search();
  };

  const orderResults = (order: string) => {
    currentPage.value = 1;
    selectedOrder.value = ordering.find(({ value }) => value === order) || defaultOrder;
    search();
  };

  const updatePages = async (page: number) => {
    currentPage.value = page;
    await search();
    scrollToTop();
  };

  const updatePageSize = async (size: number) => {
    pageSize.value = size;
    currentPage.value = 1;
    await search();
    scrollToTop();
  };

  const clearFilters = async () => {
    filters.value = {};
    await syncStateToUrlAndNavigate();
  };

  const updateFilter = (name: string, values: string[]) => {
    if (values.length === 0) {
      delete filters.value[name];
    } else {
      filters.value[name] = values;
    }

    filtersChanged.value = true;
  };

  const doWork = async () => {
    syncStateFromUrl();

    search();
  };

  watch(
    () => route.query,
    async () => {
      currentPage.value = 1;

      doWork();
    },
  );

  // The map drives its own first search from SearchMapView once the view has
  // been fitted (so the geohash precision matches the displayed zoom). Running
  // an extra search here would race that one and can clobber the results.
  if (!isMap) {
    onMounted(() => doWork());
  }

  syncStateFromUrl();

  return {
    advancedSearchEnabled,
    searchInput,
    advancedSearchLines,
    errorDialogText,
    sorting,
    facets,
    geohashGrid,
    searchFields,
    entities,
    filters,
    isLoading,
    totals,
    isMap,
    selectedOrder,
    selectedSorting,
    pageSize,
    currentPage,

    onInputChange,
    updateRoutes: syncStateToUrlAndNavigate,
    updateFilter,
    filtersChanged,
    clearFilter,
    clearFilters,
    resetSearch,
    sortResults,
    orderResults,
    updatePages,
    updatePageSize,
    setSearchParams,
  };
};
