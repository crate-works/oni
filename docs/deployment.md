# Deployment

An nginx image serving the built Oni UI. Published to GHCR as
`ghcr.io/crate-works/oni`.

## Quick Start

```bash
docker run -p 8080:80 \
  -v /path/to/configuration.json:/configuration.json:ro \
  -e ONI_API_ENDPOINT=https://api.example.com \
  ghcr.io/crate-works/oni:2
```

Then open <http://localhost:8080>.

## Configuration

The container requires a configuration file at `/configuration.json`; it
exits with an error if one isn't there. Start from
[`configuration.sample.json`](../configuration.sample.json) and see
[configuration.md](configuration.md) for every field.

The file can be mounted read-only. On start-up the entrypoint writes the
served copy, with any environment overrides applied, to
`/run/oni/configuration.json`, so changes to the file or variables need a
container restart.

The container also runs with a read-only root filesystem, given the tmpfs
mounts nginx itself needs:

```bash
docker run --read-only --tmpfs /run --tmpfs /var/cache/nginx ...
```

## Environment Variables

Per-environment values such as the API endpoint, OIDC client, and Sentry
settings can be set with `ONI_*` environment variables instead of in the
file. See [Environment Overrides](configuration.md#environment-overrides) for
the full list.

## Extending the Image

Deployments usually build a thin image on top that adds their configuration,
logo, and translations:

```dockerfile
FROM ghcr.io/crate-works/oni:2

COPY configuration.json /configuration.json
COPY logo.jpg /usr/share/nginx/html/logo.jpg
COPY i18n /usr/share/nginx/html/i18n
```

### Custom nginx Configuration

Files in `/etc/nginx/oni.d/*.conf` are included in the server block, e.g. for
redirects:

```dockerfile
COPY redirects.conf /etc/nginx/oni.d/01-redirects.conf
```

## Available Tags

- `X.Y.Z`: a specific release
- `X.Y`, `X`: the latest release in that minor or major line
- `latest`: the latest release

## Building and Testing Locally

```bash
docker build -t oni-ui -f docker/Dockerfile .

pnpm docker:test path/to/configuration.json   # build and run on port 8080
```

CI builds the image on every pull request and checks the `ONI_*` overrides
against a read-only container.

## Health Checks

The image defines a `HEALTHCHECK` that requests `/` from nginx every 30
seconds.
