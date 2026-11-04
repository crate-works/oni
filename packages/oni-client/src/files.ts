/** Crate scaffolding and generated previews that researchers rarely want listed. */
export const defaultHiddenFilePatterns = [
  '**/ro-crate-metadata.json',
  '**/ro-crate-preview.html',
  '**/ro-crate-preview_files/**',
  '**/CATALOG*.html',
  '**/CATALOG_files/**',
  '**/index.html',
];

/** A case-insensitive glob (`*`, `**`, `?`) or a regular expression source. */
export type HiddenFilePattern = string | { regex: string };

/** Decoded, forward-slash path of a file entity ID, including `…#file:<path>` IDs. */
export function entityFilePath(id: string): string {
  const raw = id.includes('#file:') ? id.split('#file:')[1] || '' : id;
  try {
    return decodeURIComponent(raw).replace(/\\/g, '/').replace(/^\.\//, '');
  } catch {
    return raw.replace(/\\/g, '/');
  }
}

const globToRegExp = (pattern: string) => {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i] || '';
    if (char === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') {
        source += '(?:.*/)?';
        i++;
      } else {
        source += '.*';
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, 'i');
};

/**
 * Builds a predicate matching files by path (from the ID), filename or name.
 * Invalid regular expressions throw, so validate configuration up front.
 */
export function hiddenFileMatcher(patterns: readonly HiddenFilePattern[]) {
  const matchers = patterns.map((pattern) =>
    typeof pattern === 'string' ? globToRegExp(pattern) : new RegExp(pattern.regex, 'i'),
  );
  return (file: { id: string; filename?: string; name?: string }) =>
    matchers.some((pattern) =>
      [entityFilePath(file.id), file.filename, file.name].some((value) => value && pattern.test(value)),
    );
}
