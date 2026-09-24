import { fileURLToPath, URL } from 'node:url';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { Unhead } from '@unhead/vue/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE_PATH || '/',

    plugins: [vue(), vueDevTools(), tailwindcss(), Unhead(), mode === 'production' ? sentryVitePlugin() : undefined],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    build: {
      sourcemap: true,
    },
  };
});
