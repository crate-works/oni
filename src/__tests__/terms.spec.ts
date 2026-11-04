import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/configuration', async () => {
  const { loadSampleConfiguration } = await import('./sample-configuration');
  return loadSampleConfiguration(() => vi.importActual('@/configuration'));
});
vi.mock('@/components/AppNav.vue', () => ({ default: { template: '<nav />' } }));
vi.mock('@/components/AppFooter.vue', () => ({ default: { template: '<footer />' } }));

import { ui } from '@/configuration';
import { ApiService } from '@/services/api';
import { useAuthStore } from '@/stores/auth';
import ShellView from '@/views/ShellView.vue';

const originalFetch = globalThis.fetch;
const originalManageTerms = ui.login.manageTermsAndConditions;
afterEach(() => {
  globalThis.fetch = originalFetch;
  ui.login.manageTermsAndConditions = originalManageTerms;
});

it.each([false, true])('requests and accepts managed terms only when enabled (%s)', async (enabled) => {
  ui.login.manageTermsAndConditions = enabled;
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = new URL(String(input), 'https://api.example.test');
    if (url.pathname === '/user/terms/accept' && init?.method === 'POST') {
      return new Response(JSON.stringify({ accept: true }));
    }
    return new Response(
      JSON.stringify({
        id: 7,
        agreement: false,
        body: 'Fixture agreement body',
        description: 'Fixture terms',
        url: 'https://fixture.test/terms',
      }),
    );
  });
  const calls = () =>
    vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([input]) =>
        new URL(String(input), 'https://api.example.test').pathname.startsWith('/user/terms'),
      );
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ShellView, {
    global: { plugins: [pinia, ElementPlus], provide: { api: new ApiService() }, stubs: { RouterView: true } },
  });
  await flushPromises();
  try {
    expect(calls()).toHaveLength(0);
    useAuthStore().isLoggedIn = true;
    await flushPromises();
    if (!enabled) {
      expect(calls()).toHaveLength(0);
      return;
    }
    expect(useAuthStore().loginTermsUrl).toBe('https://fixture.test/terms');
    const button = wrapper.findAll('button').find((b) => b.text().includes('Accept Terms'));
    expect(button).toBeDefined();
    await button?.trigger('click');
    await flushPromises();
    expect(calls()).toHaveLength(2);
    const [, init] = calls()[1] ?? [];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ id: '7' });
  } finally {
    wrapper.unmount();
  }
});
