import { createHead } from '@unhead/vue/client';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { vi } from 'vitest';
import type { Component } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { setupI18n } from '@/i18n';
import { ApiService } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import { API_ENDPOINT } from './sample-configuration';

type FakeApi = {
  records?: Record<string, object>;
  crates?: Record<string, object | 403>;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Serves the arocapi routes the entity views touch; anything unknown is a 404.
export const fakeApi = ({ records = {}, crates = {} }: FakeApi) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    if (!url.href.startsWith(API_ENDPOINT)) {
      return json({}, 404);
    }

    const path = url.pathname;
    const metadataMatch = path.match(/^\/entity\/(.+)\/metadata$/);
    if (metadataMatch) {
      const crate = crates[decodeURIComponent(metadataMatch[1] as string)];
      if (crate === 403) {
        return json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403);
      }

      return crate ? json(crate) : json({}, 404);
    }

    const entityMatch = path.match(/^\/entity\/(.+)$/);
    if (entityMatch) {
      const record = records[decodeURIComponent(entityMatch[1] as string)];

      return record ? json(record) : json({}, 404);
    }

    if (path === '/entities') {
      return json({ total: 0, entities: [] });
    }

    if (path === '/files') {
      return json({ total: 0, files: [] });
    }

    if (path === '/search') {
      return json({ total: 0, searchTime: 0, entities: [], facets: {}, geohashGrid: {} });
    }

    return json({}, 404);
  });

export const requestedPaths = (fetchMock: ReturnType<typeof fakeApi>) =>
  fetchMock.mock.calls.map(([input]) => decodeURIComponent(new URL(String(input), 'http://localhost').pathname));

export const mountView = async (view: Component, url: string, { loggedIn = false } = {}) => {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (loggedIn) {
    const auth = useAuthStore();
    auth.isLoggedIn = true;
    auth.user = { email: 'user@example.test', name: 'Test User', accessToken: 'token' };
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/:pathMatch(.*)*', name: 'NotFound', component: { template: '<div />' } },
      { path: '/object', component: view },
      { path: '/collection', component: view },
      { path: '/person', component: view },
      { path: '/file', component: view },
    ],
  });
  await router.push(url);

  const head = createHead();
  const i18n = await setupI18n('en');

  const wrapper = mount(view, {
    global: {
      plugins: [pinia, router, head, i18n, ElementPlus],
      provide: { api: new ApiService() },
      stubs: { 'font-awesome-icon': true },
    },
  });
  await flushPromises();
  await vi.dynamicImportSettled();
  await flushPromises();

  return { wrapper, head, router };
};
