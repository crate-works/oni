# API Extensions

Oni UI talks to an [`arocapi`](https://github.com/Language-Research-Technology/arocapi)
RO-Crate API, but it uses a handful of endpoints, query parameters, response
fields, and behaviours that are **not** in the upstream
[OpenAPI spec](https://github.com/Language-Research-Technology/ro-crate-api/blob/main/openapi.yaml).
This document is the single reference for those extensions, so anyone standing
up a compatible backend can implement them.

The canonical source of truth is
[`src/services/api.ts`](../src/services/api.ts) — every HTTP call the app
makes goes through the `ApiService` class.

## What is already covered upstream

The hosted docs at
<https://language-research-technology.github.io/ro-crate-api/> go beyond the
OpenAPI spec for the standard parts of the API:

- [Authentication](https://language-research-technology.github.io/ro-crate-api/docs/getting-started/authentication) —
  API key (`X-API-Key`), OIDC discovery via `/.well-known/openid-configuration`,
  OAuth2 authorization code flow.
- [Authorization](https://language-research-technology.github.io/ro-crate-api/docs/getting-started/authorization) —
  `access.metadata`, `access.content`, `metadataAuthorizationUrl`,
  `contentAuthorizationUrl` fields and the implementor-defined enrolment flow.

The upstream
[Extensions page](https://language-research-technology.github.io/ro-crate-api/docs/getting-started/extensions)
is a meta-explanation of *how* an implementation may add fields to entity
responses, and uses Oni UI as the worked example. The fields it lists are
this project's extensions — they are documented in full in
[Response shape additions](#response-shape-additions) below.

## Contents

- [Which extensions you need](#which-extensions-you-need)
- [Endpoint reference](#endpoint-reference)
  - [`HEAD /zip/{id}`](#head-zipid)
  - [`GET /user/terms`](#get-userterms)
  - [`POST /user/terms/accept`](#post-usertermsaccept)
  - [`GET /announcements`](#get-announcements)
- [Response shape additions](#response-shape-additions)
  - [`counts`](#counts--on-every-entity)
  - [`language`](#language--on-every-entity)
  - [`communicationMode`](#communicationmode--on-every-entity)
  - [`mediaType`](#mediatype--on-every-entity)
  - [`accessControl`](#accesscontrol--on-every-entity)
  - [`identifiers`](#identifiers--optional-on-every-entity)
  - [`searchExtra`](#searchextra--optional-on-entities-returned-from-post-search-only)

## Which extensions you need

Which extensions a backend must implement depends on the frontend's
`public/configuration.json`. Use this table to scope the work.

| If `configuration.json` has…                                          | You must implement                                                              |
|-----------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `ui.features.hasZipDownload: true`                                    | [`HEAD /zip/{id}`](#head-zipid)                                                 |
| `ui.features.hasAnnouncements: true`                                  | [`GET /announcements`](#get-announcements)                                      |
| `ui.login.enabled: true` **and** `ui.login.manageTermsAndConditions: true` | [`GET /user/terms`](#get-userterms), [`POST /user/terms/accept`](#post-usertermsaccept) |
| `api.rocrate.clientId` set                                            | OIDC discovery on `api.rocrate.endpoint` — covered upstream                     |
| *always*                                                              | The [response shape additions](#response-shape-additions) |

## Endpoint reference

### `HEAD /zip/{id}`

Returns metadata for a downloadable ZIP archive of an object's files. The
archive itself is fetched separately by following the response URL.

**Gated by:** `ui.features.hasZipDownload`
**Called from:** [`src/components/ZipLink.vue`](../src/components/ZipLink.vue)
via `ApiService.getZipMeta()`
([`src/services/api.ts:293`](../src/services/api.ts)).

**Request**

| Item              | Value                                              |
|-------------------|----------------------------------------------------|
| Method            | `HEAD`                                             |
| Path              | `/zip/{id}` (`{id}` is URL-encoded)                |
| `Authorization`   | `Bearer <token>` if the user is signed in (optional) |

**Responses**

| Status | Required headers / body                                                                                  | Mapped client status |
|--------|----------------------------------------------------------------------------------------------------------|----------------------|
| `200`  | `Content-Length-Estimate: <bytes>` (integer, estimated unzipped size); `Archive-File-Count: <count>` (integer); the response `url` (after any redirects) is treated as the download URL | `ok`                 |
| `403`  | empty                                                                                                    | `noAccess`           |
| `404`  | empty                                                                                                    | `notFound`           |

**Example**

```http
HEAD /zip/arcp%3A%2F%2Fname%2Ccorpus%2Fobject%2F123 HTTP/1.1
Authorization: Bearer eyJhbGciOi...

HTTP/1.1 200 OK
Content-Length-Estimate: 482910733
Archive-File-Count: 47
Access-Control-Expose-Headers: Content-Length-Estimate, Archive-File-Count
```

### `GET /user/terms`

Returns the terms-and-conditions document the signed-in user must agree to
before browsing protected content. Whether the user has already agreed is
carried in the `agreement` field.

**Gated by:** `ui.login.enabled` **and** `ui.login.manageTermsAndConditions`
**Called from:** [`src/views/ShellView.vue`](../src/views/ShellView.vue)
and [`src/components/UserDetails.vue`](../src/components/UserDetails.vue)
via `ApiService.getTerms()`
([`src/services/api.ts:281`](../src/services/api.ts)).

**Request**

| Item              | Value                                            |
|-------------------|--------------------------------------------------|
| Method            | `GET`                                            |
| Path              | `/user/terms`                                    |
| `Authorization`   | `Bearer <token>` — **required**                  |

**Response** (`200 OK`)

| Field          | Type      | Description                                            |
|----------------|-----------|--------------------------------------------------------|
| `id`           | integer   | Stable identifier for this terms revision; echoed back to [`/user/terms/accept`](#post-usertermsaccept) |
| `body`         | string    | HTML or plain-text body shown to the user              |
| `url`          | string    | Canonical URL of the terms page                        |
| `description`  | string    | Short summary shown alongside the body                 |
| `agreement`    | boolean   | `true` if the user has already accepted this revision  |

**Example**

```http
GET /user/terms HTTP/1.1
Authorization: Bearer eyJhbGciOi...

HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 7,
  "body": "<p>By using this portal you agree…</p>",
  "url": "https://example.org/terms",
  "description": "Terms of use, revision 7",
  "agreement": false
}
```

### `POST /user/terms/accept`

Records that the signed-in user has accepted a particular terms revision.

**Gated by:** `ui.login.enabled` **and** `ui.login.manageTermsAndConditions`
**Called from:** [`src/views/ShellView.vue`](../src/views/ShellView.vue)
via `ApiService.acceptTerms()`
([`src/services/api.ts:287`](../src/services/api.ts)).

**Request**

| Item              | Value                                                  |
|-------------------|--------------------------------------------------------|
| Method            | `POST`                                                  |
| Path              | `/user/terms/accept`                                   |
| Body              | `{ id: "<terms id>" }` — the `id` returned by `/user/terms`   |
| `Authorization`   | `Bearer <token>` — **required**                        |

**Response** (`200 OK`)

| Field      | Type    | Description                            |
|------------|---------|----------------------------------------|
| `accept`   | boolean | `true` if the acceptance was recorded  |

**Example**

```http
POST /user/terms/accept HTTP/1.1
Authorization: Bearer eyJhbGciOi...
{ id: 7 }

HTTP/1.1 200 OK
Content-Type: application/json

{ "accept": true }
```

### `GET /announcements`

Returns the site-wide announcements (e.g. scheduled-downtime notices)
that should currently be visible to every visitor. The backend is
expected to filter to only currently-active rows; Oni renders whatever
it gets back as warning banners across the top of the shell.

**Gated by:** `ui.features.hasAnnouncements`
**Called from:** [`src/views/ShellView.vue`](../src/views/ShellView.vue)
via `ApiService.getAnnouncements()`
([`src/services/api.ts`](../src/services/api.ts)). Fetched once on app
boot — there is no polling, and the call is skipped entirely when the
flag is off.

**Request**

| Item              | Value                                              |
|-------------------|----------------------------------------------------|
| Method            | `GET`                                              |
| Path              | `/announcements`                                   |
| `Authorization`   | `Bearer <token>` if the user is signed in (optional) |

**Response** (`200 OK`)

| Field                    | Type                | Description                                                             |
|--------------------------|---------------------|-------------------------------------------------------------------------|
| `announcements`          | `Announcement[]`    | Active announcements. May be empty. The order in which they're returned is the order in which they're rendered. |
| `announcements[].id`     | integer             | Stable identifier — used as the Vue `:key` so banners don't re-render unnecessarily |
| `announcements[].message`| string              | Plain-text message body. Rendered as a text node — **HTML is not interpreted** |

The endpoint always returns `200` with `{ "announcements": [] }` when no
announcement is active — there is no `204` special case. If the backend
returns `404` (e.g. an older deployment without this endpoint), Oni
silently treats it as "no announcements" and does not render a banner.

**Example**

```http
GET /announcements HTTP/1.1

HTTP/1.1 200 OK
Content-Type: application/json

{
  "announcements": [
    { "id": 42, "message": "Scheduled downtime: Sat 2026-05-16 14:00 UTC for ~30 minutes." }
  ]
}
```

## Response shape additions

Oni UI's `EntityType` carries seven extension fields on top of the
spec-mandated entity shape. All five of the always-present fields below
**must** be supplied by the backend on every entity returned from
`GET /entity/{id}`, `GET /entities`, and `POST /search` — otherwise the UI
breaks. The two optional fields (`identifiers`, `searchExtra`) may be
omitted. The TypeScript types live in
[`src/services/api.ts:38-75`](../src/services/api.ts).

### `counts` — on every entity

| Field                    | Type    | Description                                              |
|--------------------------|---------|----------------------------------------------------------|
| `counts.collections`     | integer | Number of collections under this entity                  |
| `counts.objects`         | integer | Number of objects under this entity                      |
| `counts.subCollections`  | integer | Number of sub-collections directly under this entity     |
| `counts.files`           | integer | Number of files under this entity                        |

### `language` — on every entity

| Field      | Type     | Description                                                          |
|------------|----------|----------------------------------------------------------------------|
| `language` | string[] | Languages represented by this entity (e.g. ISO codes or labels). May be empty. |

### `communicationMode` — on every entity

| Field               | Type                 | Description                                  |
|---------------------|----------------------|----------------------------------------------|
| `communicationMode` | `"Song" \| "Spoken"` | Communication mode of the entity's content   |

### `mediaType` — on every entity

| Field       | Type     | Description                                                              |
|-------------|----------|--------------------------------------------------------------------------|
| `mediaType` | string[] | MIME types of content under this entity (e.g. `"audio/wav"`). May be empty. |

### `accessControl` — on every entity

| Field           | Type                          | Description                                                 |
|-----------------|-------------------------------|-------------------------------------------------------------|
| `accessControl` | `"Public" \| "Restricted"`    | Whether the entity's content is openly accessible           |

### `identifiers` — optional, on every entity

| Field                              | Type   | Description                                              |
|------------------------------------|--------|----------------------------------------------------------|
| `identifiers.collectionIdentifier` | string | Collection-level identifier (the parent collection's ID) |
| `identifiers.itemIdentifier`       | string | The item's identifier within its collection              |
| `identifiers.shortIdentifier`      | string | Short, human-readable identifier used in the UI          |

### `searchExtra` — optional, on entities returned from `POST /search` only

| Field                  | Type                          | Description                                                                 |
|------------------------|-------------------------------|-----------------------------------------------------------------------------|
| `searchExtra.score`    | number                        | Relevance score for the search hit                                          |
| `searchExtra.highlight`| `Record<string, string[]>`    | Per-field highlighted snippets (field name → list of HTML-marked fragments) |
