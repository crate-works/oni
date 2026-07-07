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
