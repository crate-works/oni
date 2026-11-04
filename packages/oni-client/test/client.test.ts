import { describe, expect, it, vi } from 'vitest';
import { createOniClient, type OniAuth, type OniClient, OniClientError } from '../src/index.js';

const endpoint = 'https://api.example.test/api';
const id = 'arcp://name,corpus/object/a %20?#é';
const encoded = encodeURIComponent(id);
const json = (data: unknown = {}, status = 200) => new Response(JSON.stringify(data), { status });
const denied = (status = 401) =>
  json(
    { error: { code: 'DENIED', message: 'Backend denial', details: { reason: 'test' }, requestId: 'req-1' } },
    status,
  );
const entity = (metadata = true) => ({
  id,
  name: 'Summary',
  access: { metadata, content: false },
  extraField: 'preserved',
});
const crate = {
  '@context': 'https://w3id.org/ro/crate/1.1/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': './' } },
    {
      '@id': './',
      '@type': 'Dataset',
      name: 'Root',
      author: { '@id': '#person' },
      hasPart: { '@id': '#file' },
      custom: { '@id': '#person' },
    },
    { '@id': '#person', '@type': 'Person', name: 'Author', affiliation: { '@id': './' } },
    { '@id': '#file', '@type': 'File', filename: 'clip.wav', hasAnnotation: { '@id': '#annotation' } },
    { '@id': '#annotation', '@type': 'File', filename: 'clip.eaf', annotationOf: { '@id': '#file' } },
  ],
};
const authAdapter = (): OniAuth => ({
  getAccessToken: vi.fn(() => 'old'),
  renewAccessToken: vi.fn(() => 'new'),
  onUnauthorized: vi.fn(),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('sends anonymous requests, preserves extensions, and constructs nothing globally', async () => {
  const fetch = vi.fn(async () => json(entity()));
  const client = createOniClient({ endpoint, fetch });
  expect(fetch).not.toHaveBeenCalled();
  expect(await client.getEntity(id)).toMatchObject({ extraField: 'preserved' });
  expect(fetch).toHaveBeenCalledWith(
    `${endpoint}/entity/${encoded}`,
    expect.objectContaining({ method: 'GET', headers: { 'Content-Type': 'application/json' } }),
  );
});

it('gets a token for each authenticated request', async () => {
  const auth = authAdapter();
  const fetch = vi.fn(async () => json());
  const client = createOniClient({ endpoint, fetch, auth });
  await client.getEntities();
  await client.getFiles();
  expect(auth.getAccessToken).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls).toHaveLength(2);
  expect(fetch).toHaveBeenCalledWith(
    `${endpoint}/files`,
    expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer old' }) }),
  );
});

it('renews once and retries with the returned token', async () => {
  const auth = authAdapter();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(json({ total: 0 }));
  expect(await createOniClient({ endpoint, fetch, auth }).getEntities()).toEqual({ total: 0 });
  expect(auth.renewAccessToken).toHaveBeenCalledTimes(1);
  expect(auth.onUnauthorized).not.toHaveBeenCalled();
  expect(fetch.mock.calls[1]?.[1]?.headers).toMatchObject({ authorization: 'Bearer new' });
});

it('bounds a repeatedly rejected request and preserves the final backend error', async () => {
  const auth = authAdapter();
  const fetch = vi.fn(async () => denied());
  await expect(createOniClient({ endpoint, fetch, auth }).search({ query: 'test' })).rejects.toMatchObject({
    name: 'OniClientError',
    kind: 'unauthorized',
    status: 401,
    code: 'DENIED',
    message: 'Backend denial',
    requestId: 'req-1',
    details: { reason: 'test' },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(auth.renewAccessToken).toHaveBeenCalledTimes(1);
  expect(auth.onUnauthorized).toHaveBeenCalledTimes(1);
});

it.each(['missing', 'throw'] as const)('reports unsuccessful renewal (%s) without a retry', async (mode) => {
  const auth = authAdapter();
  auth.renewAccessToken = vi.fn(() => {
    if (mode === 'throw') {
      throw new Error('OIDC failure');
    }
    return undefined;
  });
  const fetch = vi.fn(async () => denied());
  await expect(createOniClient({ endpoint, fetch, auth }).getEntities()).rejects.toMatchObject({
    kind: 'unauthorized',
    status: 401,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(auth.renewAccessToken).toHaveBeenCalledTimes(1);
  expect(auth.onUnauthorized).toHaveBeenCalledTimes(1);
});

it('coalesces concurrent expiry, including a delayed old-token 401 after renewal completes', async () => {
  const renewal = deferred<string>();
  const late401 = deferred<Response>();
  const auth = authAdapter();
  auth.renewAccessToken = vi.fn(() => renewal.promise);
  let initial = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    if ((init?.headers as Record<string, string> | undefined)?.authorization === 'Bearer new') {
      return json({ total: 0 });
    }
    initial += 1;
    return initial >= 3 ? late401.promise : denied();
  });
  const client = createOniClient({ endpoint, fetch, auth });
  const requests = [client.getEntities(), client.getFiles(), client.getCapabilities()];
  await vi.waitFor(() => expect(auth.renewAccessToken).toHaveBeenCalledTimes(1));
  requests.push(client.getAnnouncements());
  await vi.waitFor(() => expect(initial).toBe(4));
  renewal.resolve('new');
  await Promise.all(requests.slice(0, 2));
  late401.resolve(denied());
  await Promise.all(requests);
  expect(auth.renewAccessToken).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(8);
});

it('allows a later independent request to renew a newly rejected token', async () => {
  let token = 'old';
  let renewals = 0;
  const auth: OniAuth = {
    getAccessToken: () => token,
    renewAccessToken: () => {
      token = `new-${++renewals}`;
      return token;
    },
  };
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(json())
    .mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(json());
  const client = createOniClient({ endpoint, fetch, auth });
  await client.getEntities();
  await client.getFiles();
  expect(renewals).toBe(2);
});

it('reports anonymous 401 without attempting authentication', async () => {
  const fetch = vi.fn(async () => denied());
  await expect(createOniClient({ endpoint, fetch }).getEntities()).rejects.toMatchObject({
    kind: 'unauthorized',
    status: 401,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('never treats 403 as expired auth', async () => {
  const auth = authAdapter();
  const client = createOniClient({ endpoint, fetch: async () => denied(403), auth });
  await expect(client.getEntities()).rejects.toMatchObject({ kind: 'forbidden', status: 403, code: 'DENIED' });
  expect(auth.renewAccessToken).not.toHaveBeenCalled();
  expect(auth.onUnauthorized).not.toHaveBeenCalled();
});

it.each([
  [404, 'not-found'],
  [500, 'http'],
  [429, 'http'],
] as const)('returns structured errors for %s', async (status, kind) => {
  const client = createOniClient({ endpoint, fetch: async () => denied(status) });
  const error = await client.getEntity(id).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(OniClientError);
  expect(error).toMatchObject({ kind, status, code: 'DENIED', message: 'Backend denial' });
});

it('keeps HTTP status when an error body is HTML or empty', async () => {
  const client = createOniClient({ endpoint, fetch: async () => new Response('gateway', { status: 502 }) });
  await expect(client.getEntities()).rejects.toMatchObject({ kind: 'http', status: 502 });
});

it('distinguishes malformed successful JSON from transport failure', async () => {
  const cause = new TypeError('offline');
  await expect(
    createOniClient({
      endpoint,
      fetch: async () => {
        throw cause;
      },
    }).getEntities(),
  ).rejects.toMatchObject({ kind: 'transport', cause });
  await expect(
    createOniClient({ endpoint, fetch: async () => new Response('broken') }).getEntities(),
  ).rejects.toMatchObject({ kind: 'invalid-response', status: 200 });
});

it('does not let application auth callback errors replace the structured error', async () => {
  const auth = authAdapter();
  auth.getAccessToken = () => {
    throw new Error('session unavailable');
  };
  auth.onUnauthorized = () => {
    throw new Error('callback unavailable');
  };
  await expect(createOniClient({ endpoint, auth, fetch: vi.fn() }).getEntities()).rejects.toMatchObject({
    kind: 'unauthorized',
  });
});

it('skips denied metadata without requesting or renewing it', async () => {
  const fetch = vi.fn(async () => json(entity(false)));
  const result = await createOniClient({ endpoint, fetch }).getEntityWithMetadata(id);
  expect(result).toEqual({ entity: entity(false) });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('keeps the summary and a structured metadata error on metadata 403', async () => {
  const auth = authAdapter();
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(entity()))
    .mockResolvedValueOnce(denied(403));
  const result = await createOniClient({ endpoint, fetch, auth }).getEntityWithMetadata(id);
  expect(result).toMatchObject({
    entity: entity(),
    metadataError: { kind: 'metadata-denied', status: 403, code: 'DENIED' },
  });
  expect(result.metadata).toBeUndefined();
  expect(auth.renewAccessToken).not.toHaveBeenCalled();
});

it('does not hide missing metadata as permission denial', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(entity()))
    .mockResolvedValueOnce(denied(404));
  await expect(createOniClient({ endpoint, fetch }).getEntityWithMetadata(id)).rejects.toMatchObject({
    kind: 'not-found',
  });
});

it('preserves RO-Crate linked arrays, cycles, extension fields, annotations and raw JSON', async () => {
  const client = createOniClient({ endpoint, fetch: async () => json(crate) });
  expect(JSON.parse(await client.getRoCrateJSON(id))).toEqual(crate);
  const root = await client.getRoCrate(id);
  expect(root.name).toEqual(['Root']);
  expect(root.author?.[0]?.name).toEqual(['Author']);
  expect(root.hasPart[0]?.hasAnnotation?.[0]?.filename).toEqual(['clip.eaf']);
  const dynamic = root as unknown as { custom: { affiliation: { name: string[] }[] }[] };
  expect(dynamic.custom[0]?.affiliation[0]?.name).toEqual(['Root']);
});

it('returns summary and parsed metadata on success', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(json(entity()))
    .mockResolvedValueOnce(json(crate));
  expect(await createOniClient({ endpoint, fetch }).getEntityWithMetadata(id)).toMatchObject({
    entity: entity(),
    metadata: { name: ['Root'] },
  });
});

it('preserves list, search, optional endpoint and terms wire contracts', async () => {
  const fetch = vi.fn(async () => json({ custom: 'extension' }));
  const client = createOniClient({ endpoint, fetch });
  await client.getEntities({ memberOf: id, limit: 10, offset: 20, sort: 'name', order: 'asc', entityType: 'Person' });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    `${endpoint}/entities?memberOf=${encodeURIComponent(id).replaceAll('%20', '+')}&limit=10&offset=20&sort=name&order=asc&entityType=Person`,
  );
  await client.getFiles({ memberOf: id });
  const search = {
    query: 'author:"First Last"',
    searchType: 'advanced' as const,
    filters: { date: [{ gte: '2000-01-01' }], custom: ['value'] },
    boundingBox: { topRight: { lat: 1, lng: 2 }, bottomLeft: { lat: 0, lng: 1 } },
    geohashPrecision: 4,
  };
  await client.search(search);
  expect(fetch).toHaveBeenLastCalledWith(
    `${endpoint}/search`,
    expect.objectContaining({ method: 'POST', body: JSON.stringify(search) }),
  );
  await client.acceptTerms(7);
  expect(fetch).toHaveBeenLastCalledWith(
    `${endpoint}/user/terms/accept`,
    expect.objectContaining({ method: 'POST', body: '{"id":"7"}' }),
  );
  await client.getTerms();
  expect(fetch).toHaveBeenLastCalledWith(`${endpoint}/user/terms`, expect.anything());
  expect(await client.getCapabilities()).toEqual({ custom: 'extension' });
  await client.getAnnouncements();
  expect(fetch).toHaveBeenLastCalledWith(`${endpoint}/announcements`, expect.anything());
});

it.each(['getAnnouncements', 'getCapabilities', 'getTerms'] as const)(
  'reports optional %s absence without inventing data',
  async (operation) => {
    const client = createOniClient({ endpoint, fetch: async () => new Response(null, { status: 404 }) });
    await expect(client[operation]()).rejects.toMatchObject({ kind: 'not-found', status: 404 });
  },
);

it('encodes opaque IDs on every path', async () => {
  const fetch = vi.fn(async () => json(crate));
  const client = createOniClient({ endpoint, fetch });
  await client.getEntity(id);
  await client.getRoCrateJSON(id);
  await client.getZipMeta(id);
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    `${endpoint}/entity/${encoded}`,
    `${endpoint}/entity/${encoded}/metadata`,
    `${endpoint}/zip/${encoded}`,
  ]);
  expect(await client.getFileUrl(id)).toBe(`${endpoint}/file/${encoded}?disposition=inline`);
});

it.each([
  ['https://api.example.test/api/', undefined, 'https://api.example.test/api'],
  ['/api', 'https://host.test/portal/', 'https://host.test/api'],
  ['api', 'https://host.test/portal/', 'https://host.test/portal/api'],
] as const)('resolves endpoint %s with base %s', async (api, baseUrl, expected) => {
  const fetch = vi.fn(async () => json());
  await createOniClient({ endpoint: api, baseUrl, fetch }).getEntities();
  expect(fetch).toHaveBeenCalledWith(`${expected}/entities`, expect.anything());
});

it.each(['/api', 'ftp://host/api', 'https://host/api?query=x', 'https://host/api#hash'])(
  'rejects ambiguous/invalid endpoint %s with a structured error',
  (api) => {
    expect(() => createOniClient({ endpoint: api })).toThrow(OniClientError);
  },
);

it('resolves direct files without a request or token lookup', async () => {
  const fetch = vi.fn();
  const auth = authAdapter();
  const client = createOniClient({ endpoint, fetch, auth });
  expect(await client.getFileUrl(id, 'a & b.wav', true)).toBe(
    `${endpoint}/file/${encoded}?disposition=attachment&filename=a+%26+b.wav`,
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(auth.getAccessToken).not.toHaveBeenCalled();
});

it.each([
  ['_content/token?sig=opaque%2Fvalue', `${endpoint}/_content/token?sig=opaque%2Fvalue`],
  ['/content/token', 'https://api.example.test/content/token'],
  ['https://storage.test/signed?X-Amz-Signature=abc%2Fdef', 'https://storage.test/signed?X-Amz-Signature=abc%2Fdef'],
])('resolves redirected location %s and requests fresh URLs', async (location, expected) => {
  const fetch = vi.fn(async () => json({ location }));
  const client = createOniClient({ endpoint, fetch, fileDelivery: { usesRedirects: true } });
  expect(await client.getFileUrl(id, undefined, true)).toBe(expected);
  await client.getFileUrl(id, undefined, true);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledWith(
    `${endpoint}/file/${encoded}?disposition=attachment&noRedirect=true`,
    expect.anything(),
  );
});

it('reports malformed redirected locations', async () => {
  await expect(
    createOniClient({ endpoint, fetch: async () => json({}), fileDelivery: { usesRedirects: true } }).getFileUrl(id),
  ).rejects.toMatchObject({ kind: 'invalid-response', status: 200 });
});

it.each([
  ['1234', '12', 1234, 12],
  [undefined, undefined, 0, 0],
  ['invalid', '2', null, 2],
] as const)('reads ZIP headers (%s, %s)', async (size, count, expandedSize, numberOfFiles) => {
  const response = new Response(null, {
    headers: {
      ...(size ? { 'Content-Length-Estimate': size } : {}),
      ...(count ? { 'Archive-File-Count': count } : {}),
    },
  });
  Object.defineProperty(response, 'url', { value: 'https://storage.test/final.zip' });
  const fetch = vi.fn(async () => response);
  expect(await createOniClient({ endpoint, fetch }).getZipMeta(id)).toEqual({
    status: 'ok',
    expandedSize,
    numberOfFiles,
    url: 'https://storage.test/final.zip',
  });
  expect(fetch).toHaveBeenCalledWith(`${endpoint}/zip/${encoded}`, expect.objectContaining({ method: 'HEAD' }));
});

it.each([
  [403, 'forbidden'],
  [404, 'not-found'],
] as const)('reports ZIP %s without JSON headers/body', async (status, kind) => {
  await expect(
    createOniClient({ endpoint, fetch: async () => new Response(null, { status }) }).getZipMeta(id),
  ).rejects.toMatchObject({ kind, status });
});

it('isolates configuration, auth and renewal between clients', async () => {
  const authA = authAdapter();
  const authB = authAdapter();
  authB.renewAccessToken = vi.fn(() => 'b-new');
  const fetchA = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(denied()).mockResolvedValueOnce(json());
  const fetchB = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(denied()).mockResolvedValueOnce(json());
  const options = { endpoint, fetch: fetchA, auth: authA, fileDelivery: { usesRedirects: false } };
  const a = createOniClient(options);
  const b = createOniClient({
    endpoint: 'https://b.test',
    fetch: fetchB,
    auth: authB,
    fileDelivery: { usesRedirects: true },
  });
  options.endpoint = 'https://mutated.test';
  options.fileDelivery.usesRedirects = true;
  await Promise.all([a.getEntities(), b.getEntities()]);
  expect(authA.renewAccessToken).toHaveBeenCalledTimes(1);
  expect(authB.renewAccessToken).toHaveBeenCalledTimes(1);
  expect(fetchA).toHaveBeenLastCalledWith(
    `${endpoint}/entities`,
    expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer new' }) }),
  );
  expect(fetchB).toHaveBeenLastCalledWith(
    'https://b.test/entities',
    expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer b-new' }) }),
  );
  expect(await a.getFileUrl(id)).toBe(`${endpoint}/file/${encoded}?disposition=inline`);
});

const operations: [string, (client: OniClient, signal: AbortSignal) => Promise<unknown>][] = [
  ['getEntities', (c, signal) => c.getEntities({}, { signal })],
  ['getFiles', (c, signal) => c.getFiles({}, { signal })],
  ['search', (c, signal) => c.search({ query: '' }, { signal })],
  ['getEntity', (c, signal) => c.getEntity(id, { signal })],
  ['getEntityMetadata', (c, signal) => c.getEntityMetadata(id, { signal })],
  ['getEntityWithMetadata', (c, signal) => c.getEntityWithMetadata(id, { signal })],
  ['getRoCrate', (c, signal) => c.getRoCrate(id, { signal })],
  ['getRoCrateJSON', (c, signal) => c.getRoCrateJSON(id, { signal })],
  ['getFileUrl', (c, signal) => c.getFileUrl(id, undefined, false, { signal })],
  ['getTerms', (c, signal) => c.getTerms({ signal })],
  ['acceptTerms', (c, signal) => c.acceptTerms(1, { signal })],
  ['getAnnouncements', (c, signal) => c.getAnnouncements({ signal })],
  ['getCapabilities', (c, signal) => c.getCapabilities({ signal })],
  ['getZipMeta', (c, signal) => c.getZipMeta(id, { signal })],
];

describe('cancellation', () => {
  it.each(operations)('rejects pre-aborted %s without fetch or auth', async (_name, operation) => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    const auth = authAdapter();
    await expect(operation(createOniClient({ endpoint, fetch, auth }), controller.signal)).rejects.toMatchObject({
      kind: 'aborted',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(auth.getAccessToken).not.toHaveBeenCalled();
  });

  it('passes the signal through and distinguishes transport aborts', async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      started.resolve();
      return new Promise<Response>(() => {});
    });
    const pending = createOniClient({ endpoint, fetch }).getEntities({}, { signal: controller.signal });
    await started.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('cancels a caller waiting for renewal without cancelling other callers', async () => {
    const renewal = deferred<string>();
    const controller = new AbortController();
    const auth = authAdapter();
    auth.renewAccessToken = vi.fn(() => renewal.promise);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
      (init?.headers as Record<string, string> | undefined)?.authorization === 'Bearer new' ? json() : denied(),
    );
    const client = createOniClient({ endpoint, fetch, auth });
    const cancelled = client.getEntities({}, { signal: controller.signal });
    const kept = client.getFiles();
    await vi.waitFor(() => expect(auth.renewAccessToken).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ kind: 'aborted' });
    renewal.resolve('new');
    await expect(kept).resolves.toEqual({});
    expect(auth.onUnauthorized).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('cancels while waiting for token lookup', async () => {
    const controller = new AbortController();
    const lookup = deferred<string>();
    const auth = authAdapter();
    auth.getAccessToken = () => lookup.promise;
    const fetch = vi.fn();
    const pending = createOniClient({ endpoint, fetch, auth }).getEntities({}, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    lookup.resolve('late');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels while reading the response body', async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    const response = json();
    response.json = () => {
      started.resolve();
      return new Promise(() => {});
    };
    const pending = createOniClient({ endpoint, fetch: async () => response }).getEntities(
      {},
      { signal: controller.signal },
    );
    await started.promise;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });
});

it.each([undefined, null, {}, { metadata: 'false' }, { metadata: 0 }, { metadata: null }])(
  'keeps the summary when access is missing or invalid (%j)',
  async (access) => {
    const summary = { id, name: 'Summary', access };
    const fetch = vi.fn(async () => json(summary));
    expect(await createOniClient({ endpoint, fetch }).getEntityWithMetadata(id)).toEqual({
      entity: JSON.parse(JSON.stringify(summary)),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it('does not treat a forbidden retry as another expired session', async () => {
  const auth = authAdapter();
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(denied()).mockResolvedValueOnce(denied(403));
  await expect(createOniClient({ endpoint, fetch, auth }).getEntities()).rejects.toMatchObject({
    kind: 'forbidden',
    status: 403,
  });
  expect(auth.renewAccessToken).toHaveBeenCalledTimes(1);
  expect(auth.onUnauthorized).not.toHaveBeenCalled();
});

it.each(['https://host.test/', 'https://host.test/portal/'])(
  'preserves direct endpoint strings with base %s',
  async (baseUrl) => {
    for (const api of ['', '/api', 'api', 'https://api.test/api', 'https://api.test/api/']) {
      const fetch = vi.fn();
      const client = createOniClient({ endpoint: api, baseUrl, fetch });
      expect(await client.getFileUrl('x')).toBe(`${api}/file/x?disposition=inline`);
      expect(fetch).not.toHaveBeenCalled();
    }
  },
);

it('reports an invalid redirect resolution base as a configuration error', () => {
  expect(() => createOniClient({ endpoint, fileDelivery: { baseUrl: 'invalid' } })).toThrow(OniClientError);
});
