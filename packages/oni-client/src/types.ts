export type FilterRange = { gte?: string | number; lte?: string | number };

// Search request filters: field name to selected terms, or for date/number
// fields a range — single, or an array matched as an OR of its ranges. The
// spec forbids mixing terms and ranges in one array.
export type Filters = Record<string, string[] | FilterRange | FilterRange[]>;

export type SearchSegment = {
  type: string;
  page?: number;
  tier?: string;
  startMs?: number;
  endMs?: number;
  highlight?: string[];
};

export type CommonParams = {
  limit?: number;
  offset?: number;
  sort?: string;
  order?: string;
};

export type GetEntitiesParams = CommonParams & {
  entityType?: string;
  memberOf?: string;
};

export type GetFilesParams = CommonParams & {
  memberOf?: string;
};

export type SearchParams = CommonParams & {
  searchType?: 'basic' | 'advanced';
  query: string;
  filters?: Filters;
  boundingBox?: {
    topRight: { lat: number; lng: number };
    bottomLeft: { lat: number; lng: number };
  };
  geohashPrecision?: number;
};

// TODO: Can we get the types from the API?
export type EntityType = {
  [extension: string]: unknown;
  id: string;
  name: string;
  description?: string;
  identifiers?: {
    collectionIdentifier: string;
    itemIdentifier: string;
    shortIdentifier: string;
  };
  entityType: string;
  memberOf?: {
    id: string;
    name?: string;
  } | null;
  rootCollection?: {
    id: string;
    name?: string;
  } | null;
  metadataLicenseId: string;
  contentLicenseId: string;
  access: {
    metadata: boolean;
    content: boolean;
    metadataAuthorizationUrl?: string;
    contentAuthorizationUrl?: string;
  };
  counts: {
    collections: number;
    objects: number;
    subCollections: number;
    files: number;
  };
  language: Array<string>;
  communicationMode: string;
  mediaType: Array<string>;
  accessControl: string;
  searchExtra?: { score: number; highlight: Record<string, string[]>; segments?: SearchSegment[] };
};

export type GetEntitiesResponse = {
  total: number;
  entities: Array<EntityType>;
};

export type GetEntityResponse = EntityType;

export type GetSearchResponse = {
  total: number;
  searchTime: number;
  entities: Array<EntityType>;
  facets: Record<string, { name: string; count: number }[]>;
  geohashGrid: Record<string, number>;
};

export type FileType = {
  [extension: string]: unknown;
  id: string;
  filename: string;
  mediaType: string;
  size: number;
  access: {
    content: boolean;
    contentAuthorizationUrl?: string;
  };
};

export type GetFilesResponse = {
  total: number;
  files: Array<FileType>;
};

export type GetTermsResponse = {
  id: number;
  body: string;
  url: string;
  description: string;
  agreement: boolean;
};

export type Announcement = {
  id: number;
  message: string;
};

export type GetAnnouncementsResponse = {
  announcements: Announcement[];
};

export type AcceptTermsResponse = {
  accept: boolean;
};

export type GetZipMetaResponse =
  | {
      status: 'ok';
      expandedSize: number | null;
      numberOfFiles: number;
      url: string;
    }
  | {
      status: 'noAccess';
    }
  | {
      status: 'notFound';
    };

export type ROCratePerson = {
  '@type': string[];
  description?: string[];
  name: string[];
};

export type RoCrateLicense = {
  '@id': string;
  '@type': string[];
  name: string[];
  description?: string[];
  'ldac:access': string[];
  metadataIsPublic?: boolean[];
  allowTextIndex?: boolean[];
};

export type AnnotationRef = { '@id': string; filename?: string[] };

export type RoCrate = {
  /** Repository-specific properties survive parsing; narrow them before use. */
  [extension: string]: unknown;
  '@id': string;
  '@type': string[];
  name: string[];
  creditText: string[];
  identifier: { name: string[]; value: string[] }[];
  datePublished: string[];
  doi?: string[];
  'pcdm:memberOf'?: { '@id': string; name?: string[] }[];
  license?: RoCrateLicense[];
  metadataLicense?: { '@id': string; name: string[] }[];
  author?: ROCratePerson[];
  creator?: ROCratePerson[];
  hasPart: {
    '@id': string;
    filename: string[];
    encodingFormat: string[];
    contentSize: number[];
    hasAnnotation?: AnnotationRef[];
    annotationOf?: AnnotationRef[];
  }[];
};
