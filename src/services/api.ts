import {
  createOniClient,
  type GetEntitiesParams,
  type GetFilesParams,
  type GetZipMetaResponse,
  OniClientError,
  type RequestOptions,
  type SearchParams,
} from '@researchdatabox/oni-client';

import { api } from '@/configuration';
import { forceRenewToken, getValidAccessToken } from '@/services/auth';
import { useAuthStore } from '@/stores/auth';
import { useCapabilitiesStore } from '@/stores/capabilities';

export type {
  AnnotationRef,
  Announcement,
  EntityType,
  FileType,
  GetEntitiesParams,
  GetEntitiesResponse,
  GetFilesParams,
  GetSearchResponse,
  GetTermsResponse,
  GetZipMetaResponse,
  RoCrate,
  SearchParams,
} from '@researchdatabox/oni-client';

type ErrorResponse = { error: string; status?: number };

/** Portal configuration/session adapter. All transport belongs to oni-client. */
export class ApiService {
  #client;
  #capabilities: ReturnType<typeof useCapabilitiesStore>;

  constructor() {
    const store = useAuthStore();
    this.#capabilities = useCapabilitiesStore();
    this.#client = createOniClient({
      endpoint: api.rocrate.endpoint,
      baseUrl: document.baseURI,
      fileDelivery: { usesRedirects: api.rocrate.usesRedirects, baseUrl: window.location.origin },
      auth: api.oidc?.clientId
        ? {
            getAccessToken: getValidAccessToken,
            renewAccessToken: forceRenewToken,
            onUnauthorized: () => store.reset(),
          }
        : undefined,
    });
  }

  async #legacy<T>(operation: () => Promise<T>, metadata = false): Promise<T | ErrorResponse> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OniClientError) {
        if (error.kind === 'not-found') {
          return { error: 'Not found' };
        }
        if (metadata && error.kind === 'metadata-denied') {
          return { error: 'Forbidden', status: 403 };
        }
      }
      throw error;
    }
  }

  getEntities(params: GetEntitiesParams, opts?: RequestOptions) {
    return this.#legacy(() => this.#client.getEntities(params, opts));
  }

  getFiles(params: GetFilesParams, opts?: RequestOptions) {
    return this.#legacy(() => this.#client.getFiles(params, opts));
  }

  search(params: SearchParams, opts?: RequestOptions) {
    if (params.filters) {
      params = { ...params, filters: this.#capabilities.sanitiseFilters(params.filters) };
    }
    return this.#legacy(() => this.#client.search(params, opts));
  }

  async getRoCrateJSON(id: string, opts?: RequestOptions) {
    return JSON.stringify(await this.#legacy(() => this.#client.getEntityMetadata(id, opts), true));
  }

  getRoCrate(id: string, opts?: RequestOptions) {
    return this.#legacy(async () => ({ metadata: await this.#client.getRoCrate(id, opts) }), true);
  }

  getEntity(id: string, opts?: RequestOptions) {
    return this.#legacy(async () => ({ entity: await this.#client.getEntity(id, opts) }));
  }

  getEntityWithMetadata(id: string, opts?: RequestOptions) {
    return this.#legacy(async () => {
      const { entity, metadata } = await this.#client.getEntityWithMetadata(id, opts);
      return metadata ? { entity, metadata } : { entity };
    });
  }

  async getFileUrl(id: string, path?: string, downloadable = false, opts?: RequestOptions) {
    const result = await this.#legacy(() => this.#client.getFileUrl(id, path, downloadable, opts));
    return typeof result === 'string' ? result : undefined;
  }

  getTerms(opts?: RequestOptions) {
    return this.#legacy(() => this.#client.getTerms(opts));
  }

  acceptTerms(id: number, opts?: RequestOptions) {
    return this.#legacy(() => this.#client.acceptTerms(id, opts));
  }

  getAnnouncements(opts?: RequestOptions) {
    return this.#legacy(() => this.#client.getAnnouncements(opts));
  }

  getCapabilities(opts?: RequestOptions) {
    return this.#legacy(() => this.#client.getCapabilities(opts));
  }

  async getZipMeta(id: string, opts?: RequestOptions): Promise<GetZipMetaResponse> {
    try {
      return await this.#client.getZipMeta(id, opts);
    } catch (error) {
      if (error instanceof OniClientError) {
        if (error.kind === 'forbidden') {
          return { status: 'noAccess' };
        }
        if (error.kind === 'not-found') {
          return { status: 'notFound' };
        }
      }
      throw error;
    }
  }
}
