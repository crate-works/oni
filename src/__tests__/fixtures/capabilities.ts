// A conformant GET /capabilities payload, shared by the schema and store specs.
export const validPayload = {
  apiVersion: '0.1.0',
  extensions: {
    segments: { maxSegments: 5 },
  },
  facets: {
    inLanguage: { label: 'Language' },
    mediaType: {},
  },
};
