import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default defineConfig((configEnv) =>
  mergeConfig(
    // Inherit the workspace source condition from Vite.
    viteConfig(configEnv),
    defineConfig({
      test: {
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'e2e/**', 'packages/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
      },
    }),
  ),
);
