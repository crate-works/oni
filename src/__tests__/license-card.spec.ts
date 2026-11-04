import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';

import LicenseCard from '@/components/cards/LicenseCard.vue';

const mountCard = (license: unknown) =>
  mount(LicenseCard, { props: { license: license as never }, global: { stubs: { TruncateText: true } } });

it('shows the Creative Commons name for legacy references whose name repeats the URL', () => {
  const url = 'http://creativecommons.org/licenses/by-nc-sa/4.0';
  const link = mountCard([{ '@id': `_:license/${url}`, name: [url] }]).get('a');
  expect(link.text()).toBe('Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International');
  expect(link.attributes('href')).toBe(url);
});

it('keeps custom licence names and never links unsafe identifiers', () => {
  const wrapper = mountCard([{ '@id': 'javascript:alert(1)', name: ['Research agreement'] }]);
  expect(wrapper.find('a').exists()).toBe(false);
  expect(wrapper.text()).toContain('Research agreement');
});
