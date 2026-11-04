import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/configuration', async () => {
  const { loadSampleConfiguration } = await import('./sample-configuration');
  return loadSampleConfiguration(() => vi.importActual('@/configuration'));
});

import CollectionView from '@/views/CollectionView.vue';
import FileView from '@/views/FileView.vue';
import ObjectView from '@/views/ObjectView.vue';
import PersonView from '@/views/PersonView.vue';
import { mountView } from './view-harness';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

it.each([
  ['collection', CollectionView],
  ['object', ObjectView],
  ['file', FileView],
  ['person', PersonView],
] as const)(
  'handles the structured unauthorized error in the %s view while auth owns recovery',
  async (route, view) => {
    globalThis.fetch = vi.fn(async (input) => {
      if (String(input).includes('/i18n/')) {
        return new Response('{}');
      }
      return new Response(JSON.stringify({ error: { code: 'EXPIRED', message: 'Session expired' } }), { status: 401 });
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { wrapper } = await mountView(view, `/${route}?id=expired`);
      expect(error).not.toHaveBeenCalled();
      expect(wrapper.text()).not.toContain('Session expired');
      wrapper.unmount();
    } finally {
      error.mockRestore();
    }
  },
);
