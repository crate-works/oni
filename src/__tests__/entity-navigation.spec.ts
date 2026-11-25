import { createHead } from '@unhead/vue/client';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { expect, it, vi } from 'vitest';
import { h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

vi.mock('@/configuration', async () => {
  const { loadSampleConfiguration } = await import('./sample-configuration');
  return loadSampleConfiguration(() => vi.importActual('@/configuration'));
});

import { setupI18n } from '@/i18n';
import { ApiService } from '@/services/api';
import CollectionView from '@/views/CollectionView.vue';
import { fakeApi } from './view-harness';

it('does not refetch or redirect when leaving a collection for another page', async () => {
  const id = 'arcp://name,corpus/collection';
  globalThis.fetch = fakeApi({
    records: {
      [id]: {
        id,
        name: 'C',
        entityType: 'http://pcdm.org/models#Collection',
        access: { metadata: false, content: false },
        counts: {},
      },
    },
  });
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/collection', component: CollectionView },
      { path: '/elsewhere', component: { render: () => h('div', 'elsewhere') } },
      { path: '/:pathMatch(.*)*', name: 'NotFound', component: { render: () => h('div', 'notfound') } },
    ],
  });
  await router.push(`/collection?id=${encodeURIComponent(id)}`);
  const wrapper = mount(
    { render: () => h(RouterView) },
    {
      global: {
        plugins: [createPinia(), router, createHead(), await setupI18n('en'), ElementPlus],
        provide: { api: new ApiService() },
        stubs: { 'font-awesome-icon': true },
      },
    },
  );
  await flushPromises();
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
  await router.push('/elsewhere');
  await flushPromises();
  expect(router.currentRoute.value.path).toBe('/elsewhere');
  expect(wrapper.text()).toContain('elsewhere');
  expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
});
