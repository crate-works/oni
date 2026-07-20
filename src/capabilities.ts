// The RO-Crate API's GET /capabilities response. Validation is deliberately
// lenient — unknown extensions, extension config properties, filter types, and
// top-level fields are all tolerated so an API upgraded ahead of this portal
// keeps working.

import { z } from 'zod/v4';

// Search request filters: facet/filter field name to selected values.
export type Filters = Record<string, string[]>;

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
