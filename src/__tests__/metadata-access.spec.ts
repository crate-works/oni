import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/configuration', async () => {
  const { loadSampleConfiguration } = await import('./sample-configuration');

  return loadSampleConfiguration(() => vi.importActual('@/configuration'));
});

import CollectionView from '@/views/CollectionView.vue';
import FileView from '@/views/FileView.vue';
import ObjectView from '@/views/ObjectView.vue';
import PersonView from '@/views/PersonView.vue';
import { fakeApi, mountView, requestedPaths } from './view-harness';

const record = (id: string, entityType: string, access: object) => ({
  id,
  name: 'Record name',
  entityType,
  memberOf: { id: 'arcp://name,corpus/collection', name: 'Parent collection' },
  rootCollection: null,
  metadataLicenseId: 'https://example.test/licence/metadata',
  contentLicenseId: 'https://example.test/licence/content',
  access,
  counts: { collections: 0, objects: 0, subCollections: 0, files: 0 },
  language: ['English'],
  communicationMode: 'Spoken',
  mediaType: [],
  accessControl: 'Restricted',
});

const crate = (id: string, type: string) => ({
  '@context': 'https://w3id.org/ro/crate/1.1/context',
  '@graph': [
    { '@id': 'ro-crate-metadata.json', '@type': 'CreativeWork', about: { '@id': id } },
    { '@id': id, '@type': type, name: 'Crate name', description: 'Crate-only description' },
  ],
});

const denied = {
  metadata: false,
  content: false,
  metadataAuthorizationUrl: 'https://example.test/apply/metadata',
};
const granted = { metadata: true, content: true };

const views = [
  { name: 'object', view: ObjectView, entityType: 'http://pcdm.org/models#Object', crateType: 'RepositoryObject' },
  {
    name: 'collection',
    view: CollectionView,
    entityType: 'http://pcdm.org/models#Collection',
    crateType: 'RepositoryCollection',
  },
  { name: 'person', view: PersonView, entityType: 'http://schema.org/Person', crateType: 'Person' },
  { name: 'file', view: FileView, entityType: 'http://schema.org/MediaObject', crateType: 'File' },
];

const realFetch = globalThis.fetch;

beforeEach(() => {
  document.title = '';
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe.each(views)('$name view', ({ name, view, entityType, crateType }) => {
  const id = `arcp://name,corpus/${name}`;
  const url = `/${name}?id=${encodeURIComponent(id)}`;

  describe('when Metadata access is denied', () => {
    beforeEach(() => {
      globalThis.fetch = fakeApi({ records: { [id]: record(id, entityType, denied) } });
    });

    it('renders the Record name and the metadata prompt without requesting Metadata', async () => {
      const { wrapper } = await mountView(view, url);

      expect(wrapper.text()).toContain('Record name');
      expect(wrapper.text()).toContain('The metadata for this item is restricted.');
      expect(wrapper.text()).not.toContain('Crate-only description');
      expect(requestedPaths(vi.mocked(globalThis.fetch))).not.toContain(`/entity/${id}/metadata`);
    });

    it('offers login to anonymous users', async () => {
      const { wrapper } = await mountView(view, url);

      expect(wrapper.text()).toContain('Sign Up or Log In');
    });

    it('links logged-in users to the metadata authorisation URL', async () => {
      const { wrapper } = await mountView(view, url, { loggedIn: true });

      const link = wrapper.find('a[href="https://example.test/apply/metadata"]');
      expect(link.exists()).toBe(true);
    });

    it('tells logged-in users when there is no authorisation URL', async () => {
      globalThis.fetch = fakeApi({
        records: { [id]: record(id, entityType, { metadata: false, content: false }) },
      });
      const { wrapper } = await mountView(view, url, { loggedIn: true });

      expect(wrapper.text()).toContain('No access control URL has been configured');
    });
  });

  it('falls back to the restricted page when the Metadata request is Denied', async () => {
    globalThis.fetch = fakeApi({ records: { [id]: record(id, entityType, granted) }, crates: { [id]: 403 } });
    const { wrapper } = await mountView(view, url);

    expect(wrapper.text()).toContain('Record name');
    expect(wrapper.text()).toContain('The metadata for this item is restricted.');
  });

  it('renders Metadata as before when access is granted', async () => {
    globalThis.fetch = fakeApi({
      records: { [id]: record(id, entityType, granted) },
      crates: { [id]: crate(id, crateType) },
    });
    const { wrapper } = await mountView(view, url);

    expect(wrapper.text()).toContain('Crate name');
    expect(wrapper.text()).toContain('Crate-only description');
    expect(wrapper.text()).not.toContain('The metadata for this item is restricted.');
  });
});

describe('page title', () => {
  it('uses the Record name on a restricted page', async () => {
    const id = 'arcp://name,corpus/object';
    globalThis.fetch = fakeApi({ records: { [id]: record(id, 'http://pcdm.org/models#Object', denied) } });
    await mountView(ObjectView, `/object?id=${encodeURIComponent(id)}`);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.title).toBe('Record name');
  });
});
