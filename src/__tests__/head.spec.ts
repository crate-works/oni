import { createHead, renderDOMHead } from '@unhead/vue/client';
import { flushPromises, mount } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import { h } from 'vue';

vi.mock('@/configuration', () => ({
  ui: {
    head: {
      title: 'name',
      meta: [{ name: 'DC.description', content: 'creditText' }],
    },
  },
}));

import { useHead } from '@/composables/head';
import type { RoCrate } from '@/services/api';

it('renders null metadata values alongside linked names without throwing', async () => {
  const head = createHead({ document });
  const metadata = {
    name: ['Crate name'],
    creditText: [null, { name: ['Author'] }, 'Catalogue'],
  } as unknown as RoCrate;
  const wrapper = mount(
    {
      setup() {
        useHead(head, metadata);
        return () => h('div');
      },
    },
    { global: { plugins: [head] } },
  );
  try {
    await flushPromises();
    renderDOMHead(head);
    expect(document.title).toBe('Crate name');
    expect(document.head.querySelector('meta[name="DC.description"]')?.getAttribute('content')).toBe(
      'null, Author, Catalogue',
    );
  } finally {
    wrapper.unmount();
    renderDOMHead(head);
  }
});
