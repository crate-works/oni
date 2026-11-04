import { metadataText, metadataValues, safeHref } from './values.js';

export type LicenseLabel = {
  /** Badge text, e.g. `CC BY-NC 4.0`. */
  short: string;
  /** Full name, preferring the crate's own name over generated text. */
  full: string;
  /** Present only for safe http(s)/mailto URLs. */
  url?: string;
};

const CC_URL = /^https?:\/\/(?:www\.)?creativecommons\.org\//i;
const CC_LICENSE =
  /^https?:\/\/(?:www\.)?creativecommons\.org\/licenses\/(by(?:-(?:nc|nd|sa))*)\/(\d\.\d)(?:\/([a-z-]+))?\/?(?:[?#].*)?$/i;
const CC_ZERO = /^https?:\/\/(?:www\.)?creativecommons\.org\/publicdomain\/zero\/1\.0\/?/i;
const TERMS: Record<string, string> = { by: 'Attribution', nc: 'NonCommercial', nd: 'NoDerivatives', sa: 'ShareAlike' };

// Some crates reference licences as `_:license/<url>` and repeat the URL as the name.
const unwrap = (value: string) => value.trim().replace(/^_:license\//i, '');
const isUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * Describes a `license` value (linked entity, URL string or label) for display.
 * Creative Commons URLs map to standard badges and names; other licences keep
 * their crate name. `fallback` is used when the crate has no licence entity,
 * e.g. an index's content licence ID.
 */
export function licenseLabel(value: unknown, fallback?: string): LicenseLabel {
  const entry = Array.isArray(value) ? value[0] : value;
  const node = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : undefined;
  const rawName = metadataText(node?.name).trim();
  const name = isUrl(unwrap(rawName)) ? '' : rawName;
  const candidates = [
    ...metadataValues(node?.['@id']),
    ...metadataValues(node?.url),
    ...metadataValues(node?.identifier),
    rawName,
    typeof entry === 'string' ? entry : '',
    fallback ?? '',
  ]
    .map(unwrap)
    .filter(Boolean);
  const id = candidates.find((candidate) => CC_URL.test(candidate)) ?? candidates.find(isUrl) ?? candidates[0] ?? '';
  const cc = id.match(CC_LICENSE);
  let short = name || id;
  let full = name || id;
  if (cc) {
    const code = cc[1] || 'by';
    const version = cc[2];
    const jurisdiction = cc[3] && !['deed', 'legalcode'].includes(cc[3]) ? cc[3].toUpperCase() : '';
    short = `CC ${code.toUpperCase()} ${version}${jurisdiction ? ` ${jurisdiction}` : ''}`;
    const terms = code
      .split('-')
      .map((part) => TERMS[part.toLowerCase()])
      .join('-');
    const region =
      jurisdiction === 'AU'
        ? ' Australia'
        : jurisdiction
          ? ` ${jurisdiction}`
          : version === '4.0'
            ? ' International'
            : '';
    full = name && !/^CC\b/i.test(name) ? name : `Creative Commons ${terms} ${version}${region}`;
  } else if (CC_ZERO.test(id)) {
    short = 'CC0 1.0';
    full = name && !/^CC0\b/i.test(name) ? name : 'Creative Commons CC0 1.0 Universal';
  } else if (name) {
    short = name.match(/\((CC[^)]+)\)/i)?.[1] || name;
  }
  return { short, full, url: safeHref(id) };
}
