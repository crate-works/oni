import { fileURLToPath, URL } from 'node:url';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { Unhead } from '@unhead/vue/vite';
import vue from '@vitejs/plugin-vue';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import { oniDevConfig } from './plugins/oni-dev-config.ts';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE_PATH || '/',

    plugins: [
      vue(),
      vueDevTools(),
      tailwindcss(),
      Unhead(),
      oniDevConfig(env),
      mode === 'production' ? sentryVitePlugin() : undefined,
    ],

    resolve: {
      conditions: ['@researchdatabox/source', ...defaultClientConditions],
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    build: {
      sourcemap: true,
    },
  };
});
