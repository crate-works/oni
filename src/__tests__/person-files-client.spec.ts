import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/configuration');

import { api } from '@/configuration';
import { ApiService, type FileType } from '@/services/api';
import { resolvePersonFilePresentationData } from '@/services/personFiles';

const originalFetch = globalThis.fetch;
const originalRedirects = api.rocrate.usesRedirects;
const id = 'arcp://name,corpus/photo %20#1';
const file: FileType = {
  id,
  filename: 'portrait.jpg',
  mediaType: 'image/jpeg',
  size: 10,
  access: { content: true },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  setActivePinia(createPinia());
  api.rocrate.usesRedirects = true;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  api.rocrate.usesRedirects = originalRedirects;
});

it.each([false, true])('resolves person files through the client when metadata access is %s', async (metadata) => {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname.endsWith('/metadata')) {
      return json({ error: { message: 'Denied' } }, 403);
    }
    if (url.pathname.startsWith('/file/')) {
      expect(url.searchParams.get('filename')).toBe('portrait.jpg');
      expect(url.searchParams.get('noRedirect')).toBe('true');
      return json({ location: 'https://storage.test/portrait?signature=a%2Fb' });
    }
    return json({ id, name: 'Summary', access: { metadata, content: true } });
  });

  const result = await resolvePersonFilePresentationData({
    api: new ApiService(),
    files: [file],
    fileVisibility: { enabled: true, fields: ['display'] },
  });

  expect(result).toEqual({
    fileVisibilityById: { [id]: true },
    photoUrls: { [id]: 'https://storage.test/portrait?signature=a%2Fb' },
    browserImageById: { [id]: true },
  });
  const entityPath = `/entity/${encodeURIComponent(id)}`;
  expect(calls).toEqual([
    entityPath,
    ...(metadata ? [`${entityPath}/metadata`] : []),
    `/file/${encodeURIComponent(id)}`,
  ]);
});
