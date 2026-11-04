import { describe, expect, it } from 'vitest';
import {
  canonicalDoi,
  defaultHiddenFilePatterns,
  descriptionParagraphs,
  entityFilePath,
  formatLabel,
  hiddenFileMatcher,
  licenseLabel,
  metadataText,
  metadataValues,
  plainDescription,
  publicIdentifiers,
  safeHref,
} from '../src/index.js';

// Shapes observed in published RO-Crates, including legacy UTS repository exports.
describe('metadata values', () => {
  it('reads scalars, arrays and linked nodes without following cycles', () => {
    const person: Record<string, unknown> = { '@id': '#p', name: ['Ada'] };
    person.self = person;
    expect(metadataValues(['a', 1, { name: [], '@id': '#x' }, person, null])).toEqual(['a', '1', '#x', 'Ada']);
    expect(metadataValues({ '@value': 'tagged', '@language': 'en' })).toEqual(['tagged']);
    expect(metadataText([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
  });
  it('allows only http, https and mailto links', () => {
    expect(safeHref('https://example.test/a')).toBe('https://example.test/a');
    expect(safeHref('mailto:data@example.test')).toBe('mailto:data@example.test');
    for (const value of ['javascript:alert(1)', 'data:text/html,x', '/relative', '_:license/x', undefined]) {
      expect(safeHref(value)).toBeUndefined();
    }
  });
});
describe('plain descriptions without a DOM', () => {
  it('decodes entities once and drops comments and executable blocks', () => {
    expect(plainDescription('Fish &amp;amp; chips &#169; &#x2014; &bogus; <!-- note > x -->ok')).toBe(
      'Fish &amp; chips © — &bogus; ok',
    );
    expect(plainDescription('<style>p{}</style><template><b>x</b></template>Text&nbsp;here')).toBe('Text here');
    expect(plainDescription('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>');
  });
  it('keeps table rows and list items apart', () => {
    expect(descriptionParagraphs({ description: '<ul><li>One</li><li>Two</li></ul>' })).toEqual(['One', 'Two']);
  });
});
describe('description extraction', () => {
  it('skips empty linked arrays and falls back to abstract, then the entity summary', () => {
    expect(descriptionParagraphs({ description: [], abstract: ['', 'A study.'] }, { description: 'Summary' })).toEqual([
      'A study.',
    ]);
    expect(descriptionParagraphs({ description: [' ', ''] }, { description: 'Summary' })).toEqual(['Summary']);
    expect(descriptionParagraphs({ description: [] })).toEqual([]);
  });
  it('keeps array paragraphs and CRLF or single line breaks', () => {
    expect(descriptionParagraphs({ description: ['First\r\nline\r\n\r\nSecond', 'Third'] })).toEqual([
      'First\nline',
      'Second',
      'Third',
    ]);
    expect(
      descriptionParagraphs({
        abstract: { '@value': 'Language tagged abstract', '@language': 'en' },
      }),
    ).toEqual(['Language tagged abstract']);
  });
  it('turns HTML into inert text with paragraphs and removes executable content', () => {
    expect(
      descriptionParagraphs({
        description: '<p>Water &amp; land<br>Second line</p><p><b>Next</b></p><script>alert(1)</script>',
      }),
    ).toEqual(['Water & land\nSecond line', 'Next']);
    expect(plainDescription('<img src=x onerror=alert(1)>A study')).toBe('A study');
    expect(plainDescription('EE < 55 meV; DE > 0 eV')).toBe('EE < 55 meV; DE > 0 eV');
  });
  it('keeps markdown and non-markup text readable without executing links', () => {
    expect(descriptionParagraphs({ description: 'A **study**\n\n[Source](https://example.test)' })).toEqual([
      'A **study**',
      '[Source](https://example.test)',
    ]);
    expect(descriptionParagraphs({ description: [{ '@id': './' }] })).toEqual([]);
  });
});
describe('friendly formats', () => {
  it.each([
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'data.bin', 'XLSX'],
    ['text/csv; charset=utf-8', 'data', 'CSV'],
    ['application/pdf', 'data.bin', 'PDF'],
    ['ZIP Format', 'archive', 'ZIP'],
    ['https://www.nationalarchives.gov.uk/PRONOM/fmt/214', 'data', 'XLSX'],
    ['http://www.nationalarchives.gov.uk/pronom/x-fmt/263', 'data', 'ZIP'],
    ['fmt/18', 'data', 'PDF'],
    ['x-fmt/18', 'data', 'CSV'],
    ['https://www.nationalarchives.gov.uk/PRONOM/fmt/99999', 'data.custom', 'CUSTOM'],
    ['application/octet-stream; charset=binary', 'data.csv', 'CSV'],
    ['application/octet-stream', 'FTIR_data.zip', 'ZIP'],
    [undefined, 'CATALOG_ftir.xlsx', 'XLSX'],
    ['', 'readme.txt', 'TXT'],
    ['application/x-special', 'data', 'application/x-special'],
    [undefined, 'no-extension', '—'],
  ])('resolves %s with filename %s', (format, filename, expected) => {
    expect(formatLabel(format, filename)).toBe(expected);
  });
  it('reads linked PRONOM names and ids, skipping generic MIME types', () => {
    expect(
      formatLabel([
        'application/octet-stream',
        { '@id': 'https://www.nationalarchives.gov.uk/PRONOM/fmt/214', name: [] },
      ]),
    ).toBe('XLSX');
    expect(formatLabel({ name: ['ZIP Format'], '@id': 'x-fmt/263' })).toBe('ZIP');
  });
});
describe('license labels', () => {
  it('uses short CC badges and the linked entity full name', () => {
    const name = 'Attribution-NonCommercial-ShareAlike 3.0 Australia (CC BY-NC-SA 3.0 AU)';
    expect(licenseLabel([{ '@id': 'https://creativecommons.org/licenses/by-nc-sa/3.0/au/', name: [name] }])).toEqual({
      short: 'CC BY-NC-SA 3.0 AU',
      full: name,
      url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/au/',
    });
  });
  it('maps legacy HTTP URLs, CC0 and short labels without a crate entity', () => {
    expect(licenseLabel('http://creativecommons.org/licenses/by-nc/4.0/')).toMatchObject({
      short: 'CC BY-NC 4.0',
      full: 'Creative Commons Attribution-NonCommercial 4.0 International',
    });
    expect(licenseLabel('https://creativecommons.org/publicdomain/zero/1.0/').short).toBe('CC0 1.0');
    expect(licenseLabel('CC BY-NC 4.0').short).toBe('CC BY-NC 4.0');
  });
  it('resolves legacy _:license references whose name repeats the URL', () => {
    const url = 'http://creativecommons.org/licenses/by-nc-sa/4.0';
    expect(licenseLabel([{ '@id': `_:license/${url}`, name: [url] }])).toEqual({
      short: 'CC BY-NC-SA 4.0',
      full: 'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International',
      url,
    });
    expect(licenseLabel([], `_:license/${url}`).short).toBe('CC BY-NC-SA 4.0');
    expect(licenseLabel({ '@id': '_:license/custom', name: ['Research agreement'], url: url }).full).toBe(
      'Research agreement',
    );
  });
  it('preserves custom names and never emits an active unsafe licence URL', () => {
    expect(licenseLabel({ '@id': 'javascript:alert(1)', name: ['Research agreement'] })).toEqual({
      short: 'Research agreement',
      full: 'Research agreement',
      url: undefined,
    });
    expect(licenseLabel([], 'https://example.test/licence').short).toBe('https://example.test/licence');
  });
});
describe('public identifiers', () => {
  it('drops real storage locators and prioritises canonical DOI URLs', () => {
    expect(
      publicIdentifiers({
        identifier: [
          './',
          { name: ['public_ocfl'], value: ['opaque-object'] },
          'https://dx.doi.org/10.26195/5bbacddd05c3e',
          { name: ['repository'], value: ['arcp://name,uts/object'] },
          'https://example.test/dataset',
        ],
      }),
    ).toEqual([
      {
        label: 'https://doi.org/10.26195/5bbacddd05c3e',
        href: 'https://doi.org/10.26195/5bbacddd05c3e',
        doi: '10.26195/5bbacddd05c3e',
      },
      { label: 'https://example.test/dataset', href: 'https://example.test/dataset' },
    ]);
  });
  it('reads PropertyValue identifiers and deduplicates DOI spellings', () => {
    const identifiers = publicIdentifiers({
      doi: ['10.1234/abc'],
      identifier: [
        { name: ['DOI'], value: ['http://dx.doi.org/10.1234/abc'] },
        { name: ['Catalogue number'], value: ['UTS-2024-17'] },
      ],
    });
    expect(identifiers).toHaveLength(2);
    expect(identifiers[1]?.label).toBe('UTS-2024-17');
    expect(canonicalDoi('DOI: 10.1234/abc')).toBe('https://doi.org/10.1234/abc');
  });
  it('uses ARCP only when no public identifier exists and rejects unsafe locators', () => {
    expect(
      publicIdentifiers({ identifier: ['./', 'repository', 'javascript:alert(1)'] }, 'arcp://name,uts/object'),
    ).toEqual([{ label: 'arcp://name,uts/object' }]);
    expect(publicIdentifiers({ identifier: ['./'] })).toEqual([]);
    expect(
      publicIdentifiers({
        identifier: [
          {
            '@id': 'arcp://name,uts/object#entity:_%3Alocal-id%3Apublic_ocfl',
            name: ['public_ocfl'],
          },
        ],
      }),
    ).toEqual([]);
  });
});
describe('hidden-file patterns', () => {
  const hidden = hiddenFileMatcher(defaultHiddenFilePatterns);
  it.each([
    'ro-crate-metadata.json',
    'ro-crate-preview.html',
    'ro-crate-preview_files/image.png',
    'CATALOG.html',
    'CATALOG_textiles.html',
    'CATALOG_files/nested/data.csv',
    'index.html',
    'folder/index.html',
  ])('hides %s including paths encoded in IDs', (path) => {
    expect(
      hidden({
        id: `arcp://name,uts/object#file:${encodeURIComponent(path)}`,
        filename: path.split('/').pop(),
      }),
    ).toBe(true);
  });
  it('keeps research files and catalogue spreadsheets', () => {
    for (const filename of ['CATALOG_ftir.xlsx', 'README.txt', 'data.csv', 'FTIR_data.zip']) {
      expect(hidden({ id: filename, filename })).toBe(false);
    }
  });
  it('supports custom globs, regexes, Windows paths and an empty override', () => {
    expect(hiddenFileMatcher(['**/*.tmp', { regex: '(^|/)private/' }])({ id: 'folder/cache.tmp' })).toBe(true);
    expect(hiddenFileMatcher([{ regex: '(^|/)private/' }])({ id: 'folder/private/a.csv' })).toBe(true);
    expect(hiddenFileMatcher([])({ id: 'index.html' })).toBe(false);
    expect(entityFilePath('arcp://name,uts/object#file:CATALOG_files%2Ftest.csv')).toBe('CATALOG_files/test.csv');
    expect(hidden({ id: 'folder\\index.html' })).toBe(true);
  });
});
