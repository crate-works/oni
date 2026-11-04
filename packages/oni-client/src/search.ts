import { toRequestFilters, yearFromFilterValue } from './capabilities.js';
import type { SearchParams } from './types.js';

export type Bucket = { name: string; count: number };
export type HierarchicalBucket = Bucket & { children: Bucket[] };
export type BoundingBox = NonNullable<SearchParams['boundingBox']>;

export type AdvancedSearchLine = {
  field: string;
  operation: string;
  operator: string;
  type: string;
  searchInput: string;
};

export const generateQueryString = (lines: readonly AdvancedSearchLine[], searchFields: readonly string[]) => {
  let qS = '';

  lines.forEach((sg, i) => {
    let lastOneSG = false;
    if (i + 1 === lines.length) {
      lastOneSG = true;
    }

    if (sg.field === 'all_fields') {
      let qqq = '( ';
      searchFields.forEach((f, index, keys) => {
        let lastOne = false;
        if (index + 1 === keys.length) {
          lastOne = true;
        }
        let qq = '';
        qq = `${f} : ${sg.searchInput} ${!lastOne ? 'OR' : ''} `;
        qqq += qq;
      });
      qS += `${qqq} ) ${!lastOneSG ? sg.operation : ''} `;
    } else {
      qS += ` ( ${sg.field}: (${sg.searchInput}) ) ${!lastOneSG ? sg.operation : ''}`;
    }
  });

  return qS;
};

/** Leaflet zoom to the backend's supported geohash precision. */
export const calculatePrecision = (zoomLevel: number): number => Math.min(7, Math.max(1, Math.floor(zoomLevel / 2)));

export type BuildSearchParamsOptions = {
  query: string;
  searchFields: readonly string[];
  advancedSearchEnabled?: boolean;
  advancedSearchLines?: readonly AdvancedSearchLine[];
  filters: Record<string, string[]>;
  dateFields: ReadonlySet<string>;
  pageSize: number;
  currentPage: number;
  sort?: string;
  order?: string;
  entityType?: string;
  map?: { zoomLevel: number; boundingBox: BoundingBox };
};

/** Build a request without mutating bookmark/advanced-search state. */
export const buildSearchParams = (options: BuildSearchParamsOptions): SearchParams => {
  const params: SearchParams = {
    query: options.advancedSearchEnabled
      ? generateQueryString(
          (options.advancedSearchLines ?? []).map((line) => ({
            ...line,
            searchInput: line.searchInput || '*',
          })),
          options.searchFields,
        )
      : options.query,
    searchType: options.advancedSearchEnabled ? 'advanced' : 'basic',
    filters: toRequestFilters(options.filters, options.dateFields),
    limit: options.pageSize,
    offset: (options.currentPage - 1) * options.pageSize,
    sort: options.sort,
    order: options.order,
  };
  // Site scope wins over bookmark filters, sorting, pagination and Reset.
  if (options.entityType) {
    params.filters = { ...params.filters, entityType: [options.entityType] };
  }
  if (options.map) {
    params.geohashPrecision = calculatePrecision(options.map.zoomLevel);
    params.boundingBox = {
      topRight: { ...options.map.boundingBox.topRight },
      bottomLeft: { ...options.map.boundingBox.bottomLeft },
    };
  }
  return params;
};

/** Normalise dates only once their capability/configured names are known. */
export const normaliseBookmarkFilters = (
  filters: Record<string, string[]>,
  dateFields: ReadonlySet<string>,
): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(filters).flatMap(([key, values]) => {
      const normalised = dateFields.has(key) ? values.flatMap((value) => yearFromFilterValue(value) ?? []) : values;
      return normalised.length ? [[key, normalised]] : [];
    }),
  );

export const aggregateIntoDecades = (yearBuckets: Array<{ name: string; count: number }>): HierarchicalBucket[] => {
  const decadeMap = new Map<string, { count: number; years: Array<{ name: string; count: number }> }>();

  for (const bucket of yearBuckets) {
    // The API returns epoch milliseconds as strings.
    const timestamp = Number.parseInt(bucket.name, 10);

    // Skip invalid timestamps
    if (Number.isNaN(timestamp)) {
      continue;
    }

    // Preserve the portal's local-calendar grouping.
    const date = new Date(timestamp);
    const year = date.getFullYear();

    // Skip invalid years
    if (Number.isNaN(year)) {
      continue;
    }

    const decadeStart = Math.floor(year / 10) * 10;
    const decadeName = `${decadeStart}s`;

    const decade = decadeMap.get(decadeName);
    const yearBucket = { name: String(year), count: bucket.count };

    if (decade) {
      decade.count += bucket.count;
      decade.years.push(yearBucket);
    } else {
      decadeMap.set(decadeName, { count: bucket.count, years: [yearBucket] });
    }
  }

  const hierarchicalBuckets: HierarchicalBucket[] = [];

  for (const [decadeName, data] of decadeMap.entries()) {
    hierarchicalBuckets.push({
      name: decadeName,
      count: data.count,
      children: data.years.sort((a, b) => Number.parseInt(a.name, 10) - Number.parseInt(b.name, 10)),
    });
  }

  return hierarchicalBuckets;
};
