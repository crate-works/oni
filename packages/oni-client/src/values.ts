import { joinAll } from './tools.js';

/**
 * Reads display strings from scalar, array or linked RO-Crate values without
 * serialising the cyclic proxy graph. Linked nodes yield their name, value,
 * `@value` or `@id`, in that order.
 */
export function metadataValues(value: unknown): string[] {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => metadataValues(item));
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return [String(value)];
  }
  if (typeof value === 'object') {
    const node = value as Record<string, unknown>;
    for (const field of ['name', 'value', '@value', '@id']) {
      if (node[field] != null && node[field] !== value) {
        const found = metadataValues(node[field]).filter((item) => item.trim());
        if (found.length) {
          return found;
        }
      }
    }
  }
  return [];
}

export const metadataText = (value: unknown, separator = ', ') => joinAll(metadataValues(value), separator);

/** Returns the URL only for http, https and mailto links; crate metadata is untrusted. */
export function safeHref(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}
