import { metadataText, metadataValues, safeHref } from './values.js';

export type PublicIdentifier = { label: string; href?: string; doi?: string };

/** Normalises `10.x/y`, `doi:10.x/y` and doi.org/dx.doi.org URLs to `https://doi.org/10.x/y`. */
export function canonicalDoi(value: string): string | undefined {
  const raw = value.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
  return /^10\.\d{4,9}\/\S+$/i.test(raw) ? `https://doi.org/${raw}` : undefined;
}

const STORAGE_KIND = /^(public[_-]?ocfl|repository|storage|local[-_ ]?id)$/i;
const LOCAL_ID = /(?:local-id|local%3Aid|local-id%3A)/i;
const PLACEHOLDER = /^(?:\.\/?|\/|public[_-]?ocfl|repository|storage)$/i;
const OPAQUE = /^(?:urn:(?!isbn:|issn:)|_?:local[-_ ]?id|#)/i;

/**
 * Lists identifiers worth showing to researchers from `doi` and `identifier`.
 * DOIs come first in canonical form; storage locators, local IDs and unsafe
 * schemes are dropped. `fallback` (usually the ARCP ID) is used only when no
 * public identifier exists.
 */
export function publicIdentifiers(metadata: Record<string, unknown> = {}, fallback?: string): PublicIdentifier[] {
  const raw = [metadata.doi, metadata.identifier].flatMap((value) => (Array.isArray(value) ? value : [value]));
  const found: PublicIdentifier[] = [];
  const arcp: PublicIdentifier[] = [];
  for (const entry of [...raw, fallback]) {
    if (entry == null) {
      continue;
    }
    const node = typeof entry === 'object' ? (entry as Record<string, unknown>) : undefined;
    const kind = metadataText(node?.propertyID || node?.name).trim();
    const id = metadataValues(node?.['@id'])[0] || '';
    if (STORAGE_KIND.test(kind) || LOCAL_ID.test(id)) {
      continue;
    }
    const candidates = node
      ? [node.value, node['@id'], node.name].map(metadataValues).find((list) => list.length) || []
      : metadataValues(entry);
    for (const candidate of candidates) {
      const value = candidate.trim();
      if (!value || PLACEHOLDER.test(value) || OPAQUE.test(value)) {
        continue;
      }
      const doi = canonicalDoi(value);
      if (doi) {
        found.push({ label: doi, href: doi, doi: doi.slice('https://doi.org/'.length) });
      } else if (/^arcp:/i.test(value)) {
        arcp.push({ label: value });
      } else if (safeHref(value) && /^https?:/i.test(value)) {
        found.push({ label: value, href: value });
      } else if (!/^(?:javascript|data|file):/i.test(value) && !/^\.\.?\//.test(value)) {
        found.push({ label: value });
      }
    }
  }
  const selected = found.length ? found : arcp;
  return [...new Map(selected.map((item) => [item.label, item])).values()].sort(
    (a, b) => Number(Boolean(b.doi)) - Number(Boolean(a.doi)),
  );
}
