import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import overrides from '../docker/overrides.json' with { type: 'json' };

const contentTypes: Record<string, string> = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

type Env = Record<string, string | undefined>;
type File = { body: Buffer | string; type: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const applyOverrides = (configuration: Record<string, unknown>, env: Env) => {
  const merged = structuredClone(configuration);

  for (const [name, keyPath] of Object.entries(overrides)) {
    const value = env[name];
    if (!value) {
      continue;
    }

    let node = merged;
    for (const key of keyPath.slice(0, -1)) {
      if (!isPlainObject(node[key])) {
        node[key] = {};
      }
      node = node[key] as Record<string, unknown>;
    }
    node[keyPath[keyPath.length - 1] as string] = value;
  }

  return merged;
};

const isUrl = (source: string) => /^https?:\/\//.test(source);

const load = async (source: string): Promise<File | null> => {
  if (isUrl(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      return null;
    }

    return {
      body: Buffer.from(await response.arrayBuffer()),
      type: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  if (!existsSync(source)) {
    return null;
  }

  return {
    body: await readFile(source),
    type: contentTypes[path.extname(source)] ?? 'application/octet-stream',
  };
};

const missingConfig = (source: string) =>
  isUrl(source)
    ? `Configuration not found at ${source}`
    : `Configuration not found at ${source}; copy configuration.sample.json there to get started`;

const send = (res: ServerResponse, file: File) => {
  res.setHeader('Content-Type', file.type);
  res.end(file.body);
};

export const oniDevConfig = (env: Env): Plugin => ({
  name: 'oni-dev-config',
  apply: 'serve',
  configureServer(server) {
    const { ONI_CONFIG_PATH, ONI_ASSETS_PATH } = env;
    const { root, publicDir } = server.config;

    const configSource = ONI_CONFIG_PATH && !isUrl(ONI_CONFIG_PATH) ? path.resolve(ONI_CONFIG_PATH) : ONI_CONFIG_PATH;
    const assetsSource = ONI_ASSETS_PATH && !isUrl(ONI_ASSETS_PATH) ? path.resolve(ONI_ASSETS_PATH) : ONI_ASSETS_PATH;

    if (configSource && !isUrl(configSource)) {
      if (!existsSync(configSource)) {
        server.config.logger.warn(`${missingConfig(configSource)}\n`);
      }

      server.watcher.add(configSource);
      server.watcher.on('all', (_event, file) => {
        if (file === configSource) {
          server.ws.send({ type: 'full-reload' });
        }
      });
    }

    // Queryless requests only, so Vite module requests like /vocab.json?import are left alone
    const isRemoteAsset = (url: string) =>
      !url.includes('?') &&
      path.extname(url) in contentTypes &&
      !existsSync(path.join(publicDir, url)) &&
      !existsSync(path.join(root, url));

    server.middlewares.use(async (req, res, next) => {
      const url = req.url ?? '';

      try {
        if (url === '/configuration.json' && configSource) {
          const file = await load(configSource);
          if (!file) {
            throw new Error(missingConfig(configSource));
          }

          const configuration = JSON.parse(file.body.toString()) as Record<string, unknown>;

          return send(res, { body: JSON.stringify(applyOverrides(configuration, env)), type: 'application/json' });
        }

        if (assetsSource && isRemoteAsset(url)) {
          const file = await load(isUrl(assetsSource) ? new URL(url, assetsSource).href : path.join(assetsSource, url));
          if (file) {
            return send(res, file);
          }
        }
      } catch (error) {
        return next(error);
      }

      next();
    });
  },
});
