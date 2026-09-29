# Oni UI

Oni UI is a discovery portal for browsing research
metadata served in [RO-Crate](https://www.researchobject.org/ro-crate/) format.
It is configuration-driven — search fields, facets, metadata display,
branding, and navigation are all controlled by a single
`configuration.json`, validated at runtime with Zod. The portal is
backed by an [`arocapi`](https://github.com/Language-Research-Technology/arocapi)
RO-Crate API.

## Tech stack

- **App:** Vue 3 (Composition API, `<script setup>`) + TypeScript, Vite, Tailwind CSS 4
- **UI:** Element Plus, FontAwesome, Leaflet (maps)
- **State + routing:** Pinia (with `pinia-plugin-persistedstate`), Vue Router 5
- **API + auth:** native `fetch` (`src/services/api.ts`), `oidc-client-ts`
- **Testing + quality:** Vitest + jsdom, Biome, Knip, vue-tsc
- **Tooling:** pnpm 10, Node ≥22.18, lefthook, commitlint (Conventional Commits)

## Quickstart

Prerequisites: **Node ≥22.18** and **pnpm 10**. The easiest way to get pnpm
is via corepack:

```sh
corepack enable
```

### 1. Install dependencies

```sh
pnpm install
```

This also fetches the LDaC and Schema.org vocabs into `vocab.json` via the
`postinstall` hook (`scripts/fetch-vocabs.mts`) — no separate vocab step is
required.

### 2. Run the dev server against a target

```sh
pnpm dev                     # PARADISEC staging (same as dev:paradisec-stage)
pnpm dev:paradisec-stage     # PARADISEC staging
pnpm dev:paradisec           # PARADISEC production
pnpm dev:ldaca-dev           # LDaCA dev
pnpm dev:local               # A local configuration file
```

Open <http://localhost:5173>. Login works against every remote target.

Each target is a Vite mode with a committed `.env.<mode>` file. The dev
server reads the target's live `configuration.json` (`ONI_CONFIG_PATH`),
applies any `ONI_*` overrides (see
[Environment overrides](docs/configuration.md#environment-overrides)), and
serves the site's logo and translations from `ONI_ASSETS_PATH`.

### Working on a configuration

`pnpm dev:local` serves a local configuration file and reloads the browser
when it changes. By default that's a gitignored `configuration.local.json` at
the repo root:

```sh
cp configuration.sample.json configuration.local.json
pnpm dev:local
```

To edit a config that lives elsewhere, point `ONI_CONFIG_PATH` at it in a
gitignored `.env.local-config.local`. For example, for Nabu's config in a
sibling checkout, against PARADISEC staging:

```sh
# .env.local-config.local
ONI_CONFIG_PATH=../nabu/docker/oni.json
ONI_ASSETS_PATH=../nabu/docker
ONI_API_ENDPOINT=https://admin-catalog.nabu-stage.paradisec.org.au/api/v1/oni
ONI_OIDC_ENDPOINT=https://admin-catalog.nabu-stage.paradisec.org.au
ONI_OIDC_CLIENT_ID=8XJwJIeei7hyeikp5tT-qvhYmFbrGdqGJ0zzS4GqwIQ
```

Any target can be tweaked the same way with `.env.<mode>.local`, `.env.local`
(all targets), or `ONI_*` variables in your shell.

## Project layout

```
public/                  Static assets served at the web root
plugins/                 Dev-server plugin serving the target's config and assets
configuration.local.json Config for `pnpm dev:local` (gitignored)
src/
  views/                 Page-level components, one per route
  components/            Reusable components (cards/, widgets/)
  composables/           Shared composition functions (useEntityView, useEafParser, search, head/meta)
  services/              api.ts (ApiService), auth.ts (OIDC)
  stores/                Pinia stores (auth, i18n, splash) with localStorage persistence
  router/                Vue Router 5, history mode, auth guards
  configuration.ts       Zod schema for /configuration.json
  tools.ts               Formatting helpers (first(), file sizes, durations, getEntityUrl)
scripts/                 Build-time scripts (vocab fetching)
docker/                  Production image (nginx + built dist)
docs/
  configuration.md       Full configuration reference
  deployment.md          Docker image, environment variables, and deployment
```

A few patterns worth knowing before reading the code:

- `ApiService` is provided via Vue's `provide`/`inject` from `main.ts` — inject it where needed rather than constructing your own.
- API responses are RO-Crate and parsed with the [`ro-crate`](https://www.npmjs.com/package/ro-crate) library.
- Many entity fields are `string | string[]`. Use `first()` from `src/tools.ts` for safe single-value access.

## Development workflow

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Vite dev server on port 5173 (PARADISEC staging) |
| `pnpm dev:<target>` | Start the dev server against `paradisec-stage`, `paradisec`, `ldaca-dev`, or `local` |
| `pnpm build` | Type-check + production build, run in parallel |
| `pnpm preview` | Serve the production build locally |
| `pnpm test:unit` | Vitest unit tests (jsdom) |
| `pnpm lint:biome` | Biome lint + format check |
| `pnpm lint:types` | `vue-tsc --noEmit` type check |
| `pnpm lint:knip` | Detect unused files, exports, and dependencies |
| `pnpm setup:vocabs vocab.json` | Refresh vocabs manually (also runs after `pnpm install`) |

Pre-commit hooks (lefthook) run `lint:biome`, `lint:types`, and `lint:knip`
in parallel on every commit. Don't bypass them with `--no-verify` — fix the
underlying issue.

## Configuration

The portal is fully configuration-driven via `/configuration.json`, with
per-environment values overridable through `ONI_*` environment variables.
The full field-by-field reference, with examples and validation rules,
lives in **[docs/configuration.md](docs/configuration.md)**.

A working starting point is in
[`configuration.sample.json`](configuration.sample.json) at the repo root.

## API

Oni UI consumes the standard RO-Crate API
([OpenAPI spec](https://github.com/Language-Research-Technology/ro-crate-api/blob/main/openapi.yaml),
[hosted docs](https://language-research-technology.github.io/ro-crate-api/)),
but also relies on a handful of endpoints, query parameters, response fields,
and behaviours not in that spec. They are documented in
**[docs/api-extensions.md](docs/api-extensions.md)** — required reading if you
are implementing or maintaining a compatible backend.

## Deployment

A production Docker image is published to GHCR
(`ghcr.io/crate-works/oni`). See **[docs/deployment.md](docs/deployment.md)** for
image tags, the configuration mount point, `ONI_*` environment variables,
nginx customisation, and health-check details.

## Contributing

- Follow [**Conventional Commits**](https://www.conventionalcommits.org) — enforced on every commit by commitlint.
- Pre-commit hooks must pass. If they fail, fix the cause rather than
  skipping them.
- Prefer **Australian English** in user-facing strings (colour, organise,
  licence, etc.).
- Keep PRs small and focused. When you change configuration options,
  update [`docs/configuration.md`](docs/configuration.md) and the Zod
  schema in [`src/configuration.ts`](src/configuration.ts) in the same PR.

## License

[GPL-3.0](LICENSE).
