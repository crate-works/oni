# Oni UI

Oni UI is a discovery portal for browsing research
metadata served in [RO-Crate](https://www.researchobject.org/ro-crate/) format.
It is configuration-driven — search fields, facets, metadata display,
branding, and navigation are all controlled by a single
`public/configuration.json`, validated at runtime with Zod. The portal is
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

### 2. Create your local configuration

```sh
cp configuration.sample.json public/configuration.json
```

`public/configuration.json` is **gitignored** — it is per-developer. The
running app fetches it at the URL path `/configuration.json`, which Vite
serves from `public/`. Override the fetch path with the `VITE_ONI_CONFIG_PATH`
env var if you need to point at a different file.

Edit the file as needed. The most important field is
`api.rocrate.endpoint`, which must point at a running `arocapi` serving
RO-Crate API spec 0.4.0 or later.

### 3. Start an `arocapi` RO-Crate API

You will need an `arocapi` instance running somewhere reachable from the
dev server. A `docker compose` recipe is planned but currently disabled —
see the FIXME in [`docker/docker-compose.yml`](docker/docker-compose.yml).

### 4. Run the dev server

```sh
pnpm dev
```

Open <http://localhost:5173>.

## Project layout

```
public/                  Static assets served at the web root
  configuration.json     Per-developer config (gitignored)
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
docker/                  Production image (nginx + built dist) — see docker/README.md
docs/
  configuration.md       Full configuration reference
```

A few patterns worth knowing before reading the code:

- `ApiService` is provided via Vue's `provide`/`inject` from `main.ts` — inject it where needed rather than constructing your own.
- API responses are RO-Crate and parsed with the [`ro-crate`](https://www.npmjs.com/package/ro-crate) library.
- Many entity fields are `string | string[]`. Use `first()` from `src/tools.ts` for safe single-value access.

## Development workflow

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Vite dev server on port 5173 |
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

The portal is fully configuration-driven via `public/configuration.json`.
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

A production Docker image is published to Docker Hub
(`nabu/oni-ui:latest`) and to GHCR (`ghcr.io/nabu/oni-ui:latest`). See
**[docker/README.md](docker/README.md)** for image tags, the expected
configuration mount point, nginx customisation, and health-check details.

### Deploying Under a Base Path

See the [base-path deployment instructions](docs/configuration.md#base-path-deployment)
for configuring `VITE_BASE_PATH` and serving Oni from a subdirectory such as
`/oni/`.

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
