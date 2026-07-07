// The RO-Crate API's GET /capabilities response: what spec version the archive
// targets, which extensions it implements, and which search facets it declares.
// Validation is deliberately lenient — unknown extensions, extension config
// properties, and top-level fields are all tolerated so an API upgraded ahead
// of this portal keeps working.

import { z } from 'zod/v4';

const capabilitiesSchema = z.looseObject({
  apiVersion: z.string(),
  extensions: z.looseObject({
    segments: z.looseObject({ maxSegments: z.int().min(1) }).optional(),
  }),
  facets: z.record(z.string(), z.looseObject({ label: z.string().optional() })),
});

export type Capabilities = z.infer<typeof capabilitiesSchema>;

// Returns null on a payload that doesn't match the schema — the caller treats
// that as non-conformance, identically to a fetch failure.
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
  capabilityFacets: Capabilities['facets'],
): string[] => aggregations.map(({ name }) => name).filter((name) => !(name in capabilityFacets));

// Stale bookmarks and shared search URLs can carry filter keys the archive no
// longer indexes, and sending them can 500 the search. A null supported set
// means capabilities is pending or failed — pass filters through untouched
// rather than falsely strip what we couldn't verify.
export const stripUnsupportedFilters = (
  filters: Record<string, string[]>,
  supportedFacets: ReadonlySet<string> | null,
): Record<string, string[]> => {
  if (!supportedFacets) {
    return filters;
  }

  return Object.fromEntries(
    Object.entries(filters).filter(([name]) => {
      const supported = supportedFacets.has(name);
      if (!supported) {
        console.warn(`Dropping search filter not supported by the archive's API: ${name}`);
      }

      return supported;
    }),
  );
};
