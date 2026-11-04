# @researchdatabox/oni-client

Framework-independent TypeScript client for the Oni RO-Crate API. ESM JavaScript
and declarations are built into `dist/`. Runtime dependencies are `ro-crate`
and `zod`; importing the package performs no network requests and requires no
DOM globals. The optional `/oidc` entry adds browser sign-in sessions. GPL-3.0, matching [Oni](https://github.com/crate-works/oni).

## Usage

The root Vue portal consumes this package through `workspace:*`. Other
frontends can use the same API without Vue, Pinia or router dependencies:

```ts
import { createOniClient, OniClientError } from '@researchdatabox/oni-client';

const client = createOniClient({
  endpoint: 'https://example.org/api',
  // baseUrl: document.baseURI, // required for relative endpoints
  // fetch: customFetch,       // defaults to globalThis.fetch
  fileDelivery: { usesRedirects: true },
});
const controller = new AbortController();
try {
  const results = await client.search({ query: 'language', limit: 10, offset: 0 }, { signal: controller.signal });
  const record = await client.getEntityWithMetadata(results.entities[0].id);
  console.log(record.entity, record.metadata, record.metadataError);
} catch (error) {
  if (error instanceof OniClientError && error.kind !== 'aborted') {
    console.error(error.kind, error.status, error.message);
  }
}
```

## API

All request methods accept a final `{ signal?: AbortSignal }` argument:

- `getEntities(params?)`, `getFiles(params?)`, `search(params)` — listing,
  pagination, filters, sorting and map queries using the existing wire format.
- `getEntity(id)` — the accessible summary; `getEntityMetadata(id)` and
  `getRoCrateJSON(id)` — raw metadata object and JSON string respectively.
- `getRoCrate(id)` — linked RO-Crate root dataset with array-valued properties.
- `getEntityWithMetadata(id)` — `{ entity, metadata?, metadataError? }`.
  Fetches metadata only when `entity.access.metadata === true`. A metadata 403
  retains the summary and sets `metadataError.kind` to `metadata-denied`.
  Other failures reject. Unknown backend extension fields are preserved.
- `getFileUrl(id, filename?, downloadable?)` — inline or attachment delivery.
- `getZipMeta(id)` — HEAD request returning final URL, expanded size and count.
- `getCapabilities()`, `getAnnouncements()`, `getTerms()`, `acceptTerms(id)` —
  optional backend contracts. Missing endpoints reject with `not-found`;
  applications decide which features to enable.

Opaque IDs are encoded once at the path boundary. Direct file delivery returns
the configured endpoint spelling plus the file path and query, without a fetch.
Unknown filenames are omitted. Redirect delivery requests `noRedirect=true` and
resolves relative locations below the endpoint. `fileDelivery.baseUrl` can
override the base for redirect endpoints: the Vue adapter uses
`document.baseURI` for requests and `window.location.origin` for redirects.
Signed URLs are never cached. Direct media/download elements cannot attach
Bearer headers; use redirect delivery or another server-supported access method
when files require Bearer authentication.

## Authentication and errors

Anonymous clients need no auth adapter. Authenticated applications supply:

```ts
const client = createOniClient({
  endpoint: 'https://example.org/api',
  auth: {
    getAccessToken: () => session.getAccessToken(),
    renewAccessToken: () => session.renewAccessToken(),
    onUnauthorized: (error) => session.reset(),
  },
});
```

Token callbacks return a string, null or undefined, synchronously or through a
promise. Each request asks for the current token. A 401 triggers at most one
renewal and retry; simultaneous requests share renewal, including late failures
from an old token. A 403 never renews or resets authentication. After a failed
renewal/retry the client calls `onUnauthorized` and rejects. Aborting a
request waiting for shared renewal does not cancel other callers.

### OIDC sessions

`@researchdatabox/oni-client/oidc` provides a ready-made session for OpenID
Connect providers. It needs the optional peer dependency `oidc-client-ts`
(^3.5); the main entry never imports it.

```ts
import { createOniClient } from '@researchdatabox/oni-client';
import { createOidcSession } from '@researchdatabox/oni-client/oidc';

const session = createOidcSession({
  authority: 'https://idp.example.org',
  clientId: 'portal',
  redirectUri: `${location.origin}/auth/callback`,
});
const client = createOniClient({ endpoint: '/api', baseUrl: document.baseURI, auth: session.auth });
await session.init();

// Callback route:
const result = await session.handleCallback();
if (result) navigate(result.returnPath);
```

The session uses the authorisation code flow with PKCE. It restores stored
sessions, renews expired tokens silently and shares one renewal between callers.
`login(returnPath?)` coalesces concurrent redirects. `handleCallback()` completes
redirect and silent-renewal callbacks, returning `undefined` for the latter.
Return paths must be root-relative and never point at the callback route; unsafe
values fall back to `defaultReturnPath`. `logout()` ends the portal session
without signing out of the provider.

`getState()` returns a stable `{ status: 'loading' | 'anonymous' |
'authenticated', user? }` snapshot and `subscribe(listener)` reports changes, so
framework stores can mirror it (Pinia, React `useSyncExternalStore`, signals).
`ready` resolves once `init()` settles.

Defaults: scope `openid profile email`, `sessionStorage` (one session per tab),
automatic silent renewal, and an anonymous portal after renewal fails. Options
`storage`, `scope`, `basePath` (deployment base for stored return paths),
`loginOnRenewalFailure` (redirect to sign in instead) and `settings` (raw
`oidc-client-ts` overrides) cover other deployments. Applications using another
token source can still pass their own `auth` adapter.

Client operations reject with `OniClientError`, carrying `kind`, optional HTTP
`status`, backend `code`, `details`, `requestId` and underlying `cause`.
Kinds are `not-found`, `forbidden`, `unauthorized`, `metadata-denied`,
`transport`, `aborted`, `http`, `invalid-response` and `configuration`.

## Pure helpers

The package exports wire types and helpers for:

- Capabilities: `parseCapabilities`, `dateFilterNames`, `facetTypeFor`,
  `findUnsupportedFacets`, `stripUnsupportedFilters`, `toRequestFilters`,
  `yearFromFilterValue`. Parsing tolerates unknown extensions; malformed input
  returns null. Applications retain pending/failed capability state and pass
  filters through until capabilities load.
- Search: `buildSearchParams`, `generateQueryString`, `normaliseBookmarkFilters`,
  `calculatePrecision`, `aggregateIntoDecades`. Supply configured search fields,
  date fields, pagination and optional map bounds/entity scope explicitly.
- Metadata: `selectMetadata`, `metadataName`, `extractPropertyFromIdentifier`,
  `buildMetadataNameMap`, `metadataLabel`. Mapping interpretation takes a complete
  loaded RO-Crate with `@context`, a metadata descriptor and root Dataset;
  loading and URL/failure handling belong to the application. Selection retains
  linked values and supports explicit field order or top/hidden field lists.
- Segments: `fileDeepLink`, `segmentUrl`, `segmentRows` take an explicit file
  route path; `segmentLabel`, `formatTimecode`, `parsePageParam`, `clampPage`,
  `parseStartParam`, `parseTierParam`, `startParamToMs`, `matchAnnotation` handle
  parsing and time positions without a router.
- Tools: `first`, `joinAll`, `parseContentSize`, `getBasePathUrl`, `getEntityUrl`.
- Display: helpers that turn real-world crate values into text researchers can
  read. `metadataValues`/`metadataText` read scalar, array and linked values
  without serialising the proxy graph; `safeHref` allows only http(s)/mailto.
  `licenseLabel` returns `{ short, full, url? }`, mapping Creative Commons URLs
  (including legacy `_:license/<url>` references) to standard names.
  `publicIdentifiers`/`canonicalDoi` list DOIs first and drop storage locators.
  `descriptionParagraphs`/`plainDescription` turn authored markup into plain
  paragraphs without a DOM; render the result as text, never as HTML.
  `formatLabel` gives `CSV`/`XLSX`/`PDF` labels from MIME types, PRONOM PUIDs
  or extensions. `hiddenFileMatcher`, `defaultHiddenFilePatterns` and
  `entityFilePath` hide crate scaffolding such as `ro-crate-preview.html`.

## Development and releases

From the repository root, use the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm --filter @researchdatabox/oni-client type-check
pnpm --filter @researchdatabox/oni-client test
pnpm --filter @researchdatabox/oni-client build
```

Root portal commands resolve `src/index.ts` through the
`@researchdatabox/source` export condition, shared by Vite, Vitest and the app
TypeScript configs. Client edits are picked up directly without a prebuild or
watch process. The tarball includes source so this opt-in condition remains
resolvable; ordinary consumers use the compiled ESM and declarations in `dist/`.
`pnpm pack` builds those artifacts through `prepack`.

This prerelease has not been published. The repository's semantic-release
configuration creates portal GitHub releases only, with no npm publisher.
An independent client release can later build/test/pack this directory and
publish its versioned tarball after registry scope ownership is confirmed;
no package publishing automation is included.
