// The RO-Crate API's GET /capabilities response. Validation is deliberately
// lenient — unknown extensions, extension config properties, filter types, and
// top-level fields are all tolerated so an API upgraded ahead of this portal
// keeps working.

import { z } from 'zod/v4';

// An inclusive range constraint for a date or number filter (spec 0.2.0). At
// least one bound; ISO 8601 strings for dates, numbers for numeric fields.
type FilterRange = { gte?: string | number; lte?: string | number };

// Search request filters: field name to selected terms, or for date/number
// fields a range — single, or an array matched as an OR of its ranges. The
// spec forbids mixing terms and ranges in one array.
export type Filters = Record<string, string[] | FilterRange | FilterRange[]>;

const capabilitiesSchema = z.looseObject({
  apiVersion: z.string(),
  extensions: z.looseObject({
    segments: z.looseObject({}).optional(),
  }),
  // Required of a conformant 0.3.0 implementation, but parsed leniently: this
  // portal is read-only and reads neither, so an archive still serving 0.2.0 —
  // or sending a value we don't recognise — shouldn't sink the whole document
  // and degrade every feature that does depend on it.
  deposit: z.looseObject({ supported: z.boolean() }).optional().catch(undefined),
  tombstonePolicy: z.enum(['410', '404']).optional().catch(undefined),
  search: z.looseObject({
    // type is an open string, not an enum: the spec adds filter types by
    // revision and requires clients to tolerate ones they don't recognise.
    filters: z.record(z.string(), z.looseObject({ type: z.string(), label: z.string().optional() })),
    facets: z.record(z.string(), z.looseObject({ label: z.string().optional() })),
  }),
});

export type Capabilities = z.infer<typeof capabilitiesSchema>;

// A null return is non-conformance, treated identically to a fetch failure.
export const parseCapabilities = (data: unknown): Capabilities | null => {
  const result = capabilitiesSchema.safeParse(data);

  return result.success ? result.data : null;
};

// Values are normalised on the way in rather than assumed to be bare years:
// the set of date fields is resolved from capabilities, so a legacy bookmark
// value can reach here before syncStateFromUrl had the set to normalise it.
const toYearRange = (value: string) => {
  const year = yearFromFilterValue(value);

  return year ? [{ gte: `${year}-01-01`, lte: `${year}-12-31` }] : [];
};

// The date facet selects whole years, held in UI state and URLs as plain year
// strings; the wire format for a date filter is an array of inclusive ranges
// OR-ed together. Returns the input object itself when no date field is
// present, as this runs on every search request.
export const toRequestFilters = (filters: Record<string, string[]>, dateFields: ReadonlySet<string>): Filters => {
  if (!Object.keys(filters).some((name) => dateFields.has(name))) {
    return filters;
  }

  return Object.fromEntries(
    Object.entries(filters).map(([name, values]) => [
      name,
      dateFields.has(name) ? values.flatMap(toYearRange) : values,
    ]),
  );
};

// Date facet values in URLs: currently plain years, but pre-0.2.0 bookmarks
// carried "YYYY-01-01T00:00:00.000Z TO YYYY-12-31T23:59:59.999Z" strings. Both
// lead with the year, which is all the facet keeps.
export const yearFromFilterValue = (value: string): string | undefined => value.match(/^(\d{4})(?:-|$)/)?.[1];

// The spec's filter types mapped onto the facet UI this portal can render:
// dates get the year-range facet, the other known types are term facets.
const facetTypeByFilterType: Record<string, 'standard' | 'date_histogram'> = {
  string: 'standard',
  number: 'standard',
  boolean: 'standard',
  date: 'date_histogram',
};

// How a declared facet should be rendered, or null for one to hide. Both cases
// the spec calls out land here: a filter typed with something added by a later
// revision, which clients must hide rather than guess at, and a facet the
// archive never declared as a filter — unusable, since clicking it would send
// a key the API rejects with a 400.
export const facetTypeFor = (name: string, search: Capabilities['search']): 'standard' | 'date_histogram' | null =>
  facetTypeByFilterType[search.filters[name]?.type ?? ''] ?? null;

// The fields the archive declares as dates, whose values go out as ranges
// rather than exact terms.
export const dateFilterNames = (search: Capabilities['search']): string[] =>
  Object.entries(search.filters).flatMap(([name, { type }]) => (type === 'date' ? [name] : []));

// Configured aggregations the API doesn't declare can break search with 500s,
// so they're a deployment error. Comparison is by facet name only: capability
// labels are ignored (renaming facets in configuration is the point), and the
// reverse direction — declared facets the configuration omits — is deliberate
// curation, not a mismatch.
export const findUnsupportedFacets = (
  aggregations: { name: string }[],
  capabilityFacets: Capabilities['search']['facets'],
): string[] => aggregations.map(({ name }) => name).filter((name) => !(name in capabilityFacets));

// Stale bookmarks and shared search URLs can carry filter keys the archive no
// longer indexes, and the spec requires the API to reject undeclared keys with
// a 400. A null supported set means capabilities is pending or failed — pass
// filters through untouched rather than falsely strip what we couldn't verify.
// Returns the input object itself when nothing is dropped: this runs on every
// search request, so the common all-supported case allocates nothing.
export const stripUnsupportedFilters = (
  filters: Filters,
  supportedFilters: ReadonlySet<string> | null,
): { filters: Filters; dropped: string[] } => {
  if (!supportedFilters) {
    return { filters, dropped: [] };
  }

  const dropped = Object.keys(filters).filter((name) => !supportedFilters.has(name));
  if (dropped.length === 0) {
    return { filters, dropped };
  }

  return {
    filters: Object.fromEntries(Object.entries(filters).filter(([name]) => supportedFilters.has(name))),
    dropped,
  };
};
