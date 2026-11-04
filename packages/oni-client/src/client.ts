import { aborted, isAbort, OniClientError, withSignal } from './error.js';
import { parseContentSize } from './tools.js';
import type {
  AcceptTermsResponse,
  EntityType,
  GetAnnouncementsResponse,
  GetEntitiesParams,
  GetEntitiesResponse,
  GetFilesParams,
  GetFilesResponse,
  GetSearchResponse,
  GetTermsResponse,
  GetZipMetaResponse,
  RoCrate,
  SearchParams,
} from './types.js';

type Token = string | null | undefined;
type MaybePromise<T> = T | Promise<T>;

export type RequestOptions = { signal?: AbortSignal };

export type OniAuth = {
  getAccessToken: () => MaybePromise<Token>;
  renewAccessToken: () => MaybePromise<Token>;
  onUnauthorized?: (error: OniClientError) => MaybePromise<void>;
};

export type OniClientOptions = {
  endpoint: string;
  /** Required for relative endpoints. No window/location dependency. */
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  auth?: OniAuth;
  fileDelivery?: {
    usesRedirects?: boolean;
    /** Override the base for relative redirect endpoints. */
    baseUrl?: string;
  };
};

export type EntityWithMetadata = {
  entity: EntityType;
  metadata?: RoCrate;
  /** Summary remains usable if metadata GET was forbidden. */
  metadataError?: OniClientError;
};

const checkSignal = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw aborted(signal.reason);
  }
};

const normaliseError = (error: unknown, signal?: AbortSignal): OniClientError => {
  if (isAbort(error, signal)) {
    return aborted(error);
  }
  if (error instanceof OniClientError) {
    return error;
  }
  return new OniClientError('Request failed', { kind: 'transport', cause: error });
};

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

export function createOniClient(options: OniClientOptions) {
  let endpoint: string;
  let redirectBase: string;
  try {
    const url = options.baseUrl ? new URL(options.endpoint || '/', options.baseUrl) : new URL(options.endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
      throw new Error('Expected an HTTP(S) endpoint without a query or fragment');
    }
    endpoint = url.href.replace(/\/+$/, '');
    redirectBase = new URL(
      `${options.endpoint.replace(/\/$/, '')}/`,
      options.fileDelivery?.baseUrl ?? options.baseUrl ?? `${endpoint}/`,
    ).href;
  } catch (cause) {
    throw new OniClientError('Invalid endpoint; relative endpoints require an absolute baseUrl', {
      kind: 'configuration',
      cause,
    });
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) {
    throw new OniClientError('Supply a fetch implementation', { kind: 'configuration' });
  }
  // Copy adapters/configuration so mutating the options object cannot retarget a client.
  const auth = options.auth ? { ...options.auth } : undefined;
  const usesRedirects = options.fileDelivery?.usesRedirects ?? false;
  // Direct URLs retain the configured spelling, including relative endpoints.
  const directEndpoint = options.endpoint;
  let generation = 0;
  let inFlightRenewal: Promise<Token> | undefined;
  let latestRenewal: Promise<Token> | undefined;

  const renew = (requestGeneration: number): Promise<Token> => {
    if (inFlightRenewal) {
      return inFlightRenewal;
    }
    // A delayed 401 for an old token reuses the completed renewal too.
    if (requestGeneration < generation && latestRenewal) {
      return latestRenewal;
    }
    const promise = Promise.resolve()
      .then(() => auth?.renewAccessToken())
      .catch(() => undefined);
    inFlightRenewal = promise;
    latestRenewal = promise;
    void promise.then(() => {
      // Requests started during renewal also belong to the old generation.
      generation += 1;
      if (inFlightRenewal === promise) {
        inFlightRenewal = undefined;
      }
    });
    return promise;
  };

  const httpError = async (response: Response, signal?: AbortSignal, metadata = false) => {
    let data: unknown;
    try {
      data = await withSignal(response.json(), signal);
    } catch (error) {
      if (isAbort(error, signal) || (error instanceof OniClientError && error.kind === 'aborted')) {
        throw aborted(error);
      }
      // HEAD and error responses may have no JSON body; status still identifies them.
    }
    const body = record(record(data)?.error);
    const status = response.status;
    const kind =
      status === 401
        ? 'unauthorized'
        : status === 403
          ? metadata
            ? 'metadata-denied'
            : 'forbidden'
          : status === 404
            ? 'not-found'
            : 'http';
    const fallback =
      status === 401
        ? 'Not authorised'
        : status === 403
          ? 'Forbidden'
          : status === 404
            ? 'Not found'
            : `Unexpected error response (${status})`;
    return new OniClientError(typeof body?.message === 'string' ? body.message : fallback, {
      kind,
      status,
      code: typeof body?.code === 'string' ? body.code : undefined,
      details: body?.details,
      requestId: typeof body?.requestId === 'string' ? body.requestId : undefined,
    });
  };

  const unauthorized = async (error: OniClientError, signal?: AbortSignal): Promise<never> => {
    checkSignal(signal);
    try {
      await withSignal(
        Promise.resolve().then(() => {
          checkSignal(signal);
          return auth?.onUnauthorized?.(error);
        }),
        signal,
      );
    } catch (cause) {
      if (isAbort(cause, signal) || (cause instanceof OniClientError && cause.kind === 'aborted')) {
        throw aborted(cause);
      }
      // A failed app callback must not replace the structured authentication error.
    }
    throw error;
  };

  const request = async (
    path: string,
    method: 'GET' | 'POST' | 'HEAD',
    requestOptions: RequestOptions = {},
    body?: object,
    metadata = false,
  ): Promise<Response> => {
    const { signal } = requestOptions;
    try {
      checkSignal(signal);
      const requestGeneration = generation;
      let token: Token;
      try {
        token = await withSignal(
          Promise.resolve().then(() => auth?.getAccessToken()),
          signal,
        );
      } catch (cause) {
        if (isAbort(cause, signal) || (cause instanceof OniClientError && cause.kind === 'aborted')) {
          throw cause;
        }
        return await unauthorized(
          new OniClientError('Unable to obtain access token', {
            kind: 'unauthorized',
            cause,
          }),
          signal,
        );
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.authorization = `Bearer ${token}`;
      }
      const init: RequestInit = { method, headers, signal, ...(body ? { body: JSON.stringify(body) } : {}) };
      checkSignal(signal);
      let response = await withSignal(fetcher(`${endpoint}${path}`, init), signal);
      if (response.status === 401 && auth) {
        const newToken = await withSignal(renew(requestGeneration), signal);
        checkSignal(signal);
        if (newToken) {
          void response.body?.cancel().catch(() => {});
          response = await withSignal(
            fetcher(`${endpoint}${path}`, {
              ...init,
              headers: { ...headers, authorization: `Bearer ${newToken}` },
            }),
            signal,
          );
        }
      }
      if (response.status !== 200) {
        const error = await httpError(response, signal, metadata);
        if (error.kind === 'unauthorized') {
          return await unauthorized(error, signal);
        }
        throw error;
      }
      return response;
    } catch (error) {
      throw normaliseError(error, signal);
    }
  };

  const json = async <T>(
    path: string,
    method: 'GET' | 'POST',
    opts?: RequestOptions,
    body?: object,
    metadata = false,
  ): Promise<T> => {
    const response = await request(path, method, opts, body, metadata);
    try {
      return (await withSignal(response.json(), opts?.signal)) as T;
    } catch (cause) {
      if (isAbort(cause, opts?.signal) || (cause instanceof OniClientError && cause.kind === 'aborted')) {
        throw aborted(cause);
      }
      throw new OniClientError('Invalid JSON response', { kind: 'invalid-response', status: response.status, cause });
    }
  };

  const query = (params: object) => new URLSearchParams(params as Record<string, string>).toString();
  const getEntity = (id: string, opts?: RequestOptions) =>
    json<EntityType>(`/entity/${encodeURIComponent(id)}`, 'GET', opts);
  const getEntityMetadata = (id: string, opts?: RequestOptions) =>
    json<object>(`/entity/${encodeURIComponent(id)}/metadata`, 'GET', opts, undefined, true);

  const getRoCrate = async (id: string, opts?: RequestOptions): Promise<RoCrate> => {
    const payload = await getEntityMetadata(id, opts);
    try {
      const { parseRoCrate } = await withSignal(import('./rocrate.js'), opts?.signal);
      checkSignal(opts?.signal);
      return parseRoCrate(payload);
    } catch (cause) {
      if (isAbort(cause, opts?.signal) || (cause instanceof OniClientError && cause.kind === 'aborted')) {
        throw aborted(cause);
      }
      throw new OniClientError('Invalid RO-Crate response', { kind: 'invalid-response', status: 200, cause });
    }
  };

  const listPath = (path: string, params: object) => {
    const encoded = query(params);
    return encoded ? `${path}?${encoded}` : path;
  };

  return {
    getEntities: (params: GetEntitiesParams = {}, opts?: RequestOptions) =>
      json<GetEntitiesResponse>(listPath('/entities', params), 'GET', opts),
    getFiles: (params: GetFilesParams = {}, opts?: RequestOptions) =>
      json<GetFilesResponse>(listPath('/files', params), 'GET', opts),
    search: (params: SearchParams, opts?: RequestOptions) => json<GetSearchResponse>('/search', 'POST', opts, params),
    getEntity,
    getEntityMetadata,
    getRoCrateJSON: async (id: string, opts?: RequestOptions) => JSON.stringify(await getEntityMetadata(id, opts)),
    getRoCrate,
    async getEntityWithMetadata(id: string, opts?: RequestOptions): Promise<EntityWithMetadata> {
      const entity = await getEntity(id, opts);
      if (record(record(entity)?.access)?.metadata !== true) {
        return { entity };
      }
      try {
        return { entity, metadata: await getRoCrate(id, opts) };
      } catch (error) {
        if (error instanceof OniClientError && error.kind === 'metadata-denied') {
          return { entity, metadataError: error };
        }
        throw error;
      }
    },
    async getFileUrl(id: string, filename?: string, downloadable = false, opts?: RequestOptions): Promise<string> {
      checkSignal(opts?.signal);
      const params = { disposition: downloadable ? 'attachment' : 'inline', ...(filename ? { filename } : {}) };
      const path = `/file/${encodeURIComponent(id)}`;
      if (!usesRedirects) {
        return `${directEndpoint}${path}?${query(params)}`;
      }
      const result = await json<{ location: string }>(
        `${path}?${query({ ...params, noRedirect: 'true' })}`,
        'GET',
        opts,
      );
      try {
        if (typeof result.location !== 'string' || !result.location) {
          throw new Error('Missing location');
        }
        return new URL(result.location, redirectBase).href;
      } catch (cause) {
        throw new OniClientError('Invalid file location', { kind: 'invalid-response', status: 200, cause });
      }
    },
    getTerms: (opts?: RequestOptions) => json<GetTermsResponse>('/user/terms', 'GET', opts),
    acceptTerms: (id: number, opts?: RequestOptions) =>
      json<AcceptTermsResponse>('/user/terms/accept', 'POST', opts, { id: String(id) }),
    getAnnouncements: (opts?: RequestOptions) => json<GetAnnouncementsResponse>('/announcements', 'GET', opts),
    getCapabilities: (opts?: RequestOptions) => json<object>('/capabilities', 'GET', opts),
    async getZipMeta(id: string, opts?: RequestOptions): Promise<Extract<GetZipMetaResponse, { status: 'ok' }>> {
      const response = await request(`/zip/${encodeURIComponent(id)}`, 'HEAD', opts);
      const size = Number.parseInt(response.headers.get('Content-Length-Estimate') || '0', 10);
      return {
        status: 'ok',
        expandedSize: parseContentSize(size),
        numberOfFiles: Number.parseInt(response.headers.get('Archive-File-Count') || '0', 10),
        url: response.url,
      };
    },
  };
}

export type OniClient = ReturnType<typeof createOniClient>;
