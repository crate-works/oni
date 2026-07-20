// A conformant GET /capabilities payload, shared by the schema and store specs.
// createdAt is a filter-only field: filterable but not declared as a facet.
export const validPayload = {
  apiVersion: '0.3.0',
  extensions: {
    segments: {},
  },
  deposit: { supported: false },
  tombstonePolicy: '410',
  search: {
    filters: {
      inLanguage: { type: 'string', label: 'Language' },
      mediaType: { type: 'string' },
      createdAt: { type: 'date', label: 'Date created' },
    },
    facets: {
      inLanguage: { label: 'Language' },
      mediaType: {},
    },
  },
};
