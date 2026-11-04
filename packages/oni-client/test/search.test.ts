import { expect, it } from 'vitest';
import {
  type AdvancedSearchLine,
  aggregateIntoDecades,
  type BuildSearchParamsOptions,
  buildSearchParams,
  calculatePrecision,
  generateQueryString,
  normaliseBookmarkFilters,
  stripUnsupportedFilters,
} from '../src/index.js';

const line = (options: Partial<AdvancedSearchLine> = {}): AdvancedSearchLine => ({
  field: 'all_fields',
  operation: 'AND',
  operator: 'AND',
  type: 'phrase',
  searchInput: 'hello',
  ...options,
});
const options = (overrides: Partial<BuildSearchParamsOptions> = {}): BuildSearchParamsOptions => ({
  query: 'text',
  searchFields: ['name', 'description'],
  filters: {},
  dateFields: new Set(),
  pageSize: 20,
  currentPage: 1,
  ...overrides,
});

it('preserves advanced query field order, operators and exact wire spacing', () => {
  expect(
    generateQueryString(
      [
        line(),
        line({ field: 'author', searchInput: 'First Last', operation: 'OR' }),
        line({ field: 'description', searchInput: 'x:y' }),
      ],
      ['name', 'description'],
    ),
  ).toBe('( name : hello OR description : hello   ) AND  ( author: (First Last) ) OR ( description: (x:y) ) ');
  expect(generateQueryString([], ['name'])).toBe('');
});

it('uses a wildcard for empty advanced lines without mutating UI/bookmark state', () => {
  const lines = [Object.freeze(line({ searchInput: '' })), Object.freeze(line({ field: 'name' }))];
  const result = buildSearchParams(options({ advancedSearchEnabled: true, advancedSearchLines: lines }));
  expect(result.searchType).toBe('advanced');
  expect(result.query).toContain('name : * OR description : *');
  expect(lines[0]?.searchInput).toBe('');
});

it('keeps basic query, pagination and ordering values', () => {
  expect(buildSearchParams(options({ currentPage: 3, pageSize: 10, sort: 'name', order: 'desc' }))).toEqual({
    query: 'text',
    searchType: 'basic',
    filters: {},
    limit: 10,
    offset: 20,
    sort: 'name',
    order: 'desc',
  });
});

it.each([1, 2, 5])('keeps site entity scope through page %s and contradictory bookmarks', (currentPage) => {
  const filters = { entityType: ['File'], inLanguage: ['en'] };
  const result = buildSearchParams(options({ currentPage, filters, entityType: 'Object' }));
  expect(result.filters).toEqual({ entityType: ['Object'], inLanguage: ['en'] });
  expect(filters.entityType).toEqual(['File']);
  expect(buildSearchParams(options({ entityType: 'Object' })).filters).toEqual({ entityType: ['Object'] });
});

it('preserves legacy dates before and after capabilities arrive, plus filter-only fields', () => {
  const legacy = '1965-01-01T00:00:00.000Z TO 1965-12-31T23:59:59.999Z';
  const filters = { date: [legacy], filterOnly: ['yes'], stale: ['x'], empty: [] };
  expect(normaliseBookmarkFilters(filters, new Set())).toEqual({ date: [legacy], filterOnly: ['yes'], stale: ['x'] });
  const normalised = normaliseBookmarkFilters(filters, new Set(['date']));
  expect(normalised.date).toEqual(['1965']);
  const result = buildSearchParams(options({ filters: normalised, dateFields: new Set(['date']) }));
  const sanitised = stripUnsupportedFilters(result.filters ?? {}, new Set(['date', 'filterOnly']));
  expect(sanitised).toEqual({
    filters: { date: [{ gte: '1965-01-01', lte: '1965-12-31' }], filterOnly: ['yes'] },
    dropped: ['stale'],
  });
  expect(stripUnsupportedFilters(result.filters ?? {}, null).filters).toBe(result.filters);
  expect(normaliseBookmarkFilters({ date: ['bad'] }, new Set(['date']))).toEqual({});
});

it.each([
  [-3, 1],
  [0, 1],
  [3, 1],
  [8, 4],
  [14, 7],
  [22, 7],
])('maps zoom %s to precision %s', (zoom, precision) => {
  expect(calculatePrecision(zoom)).toBe(precision);
});

it('includes isolated map bounds only for map searches', () => {
  const boundingBox = { topRight: { lat: 0, lng: 180 }, bottomLeft: { lat: -50, lng: 110 } };
  const result = buildSearchParams(options({ map: { zoomLevel: 8, boundingBox } }));
  expect(result).toMatchObject({ boundingBox, geohashPrecision: 4 });
  if (!result.boundingBox) {
    throw new Error('Missing map bounds');
  }
  result.boundingBox.topRight.lat = 10;
  expect(boundingBox.topRight.lat).toBe(0);
  expect(buildSearchParams(options())).not.toHaveProperty('boundingBox');
  expect(buildSearchParams(options())).not.toHaveProperty('geohashPrecision');
});

it('groups valid epoch millisecond buckets into decades and sorts years, retaining decade order', () => {
  const timestamp = (year: number) => String(new Date(year, 6, 1).getTime());
  expect(
    aggregateIntoDecades([
      { name: timestamp(1972), count: 2 },
      { name: timestamp(1968), count: 1 },
      { name: timestamp(1965), count: 3 },
      { name: 'bad', count: 9 },
      { name: '99999999999999999', count: 9 },
    ]),
  ).toEqual([
    { name: '1970s', count: 2, children: [{ name: '1972', count: 2 }] },
    {
      name: '1960s',
      count: 4,
      children: [
        { name: '1965', count: 3 },
        { name: '1968', count: 1 },
      ],
    },
  ]);
});
