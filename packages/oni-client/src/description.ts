const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (value: string) =>
  value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== '#') {
      return ENTITIES[entity.toLowerCase()] ?? match;
    }
    const code =
      entity[1] === 'x' || entity[1] === 'X' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });

/**
 * Converts authored description markup to plain text with paragraph breaks.
 * The result is text, not sanitised HTML: render it as text (React children,
 * Vue interpolation), never through innerHTML/v-html. Works without a DOM.
 */
export function plainDescription(value: string): string {
  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|section|tr)\s*>/gi, '\n\n')
    // Only tag-like text: `a < b > c` in scientific prose is kept.
    .replace(/<\/?[a-z][^>]*>/gi, '');
  return decodeEntities(text)
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(strings);
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    return strings(node['@value'] ?? node.value);
  }
  return [];
}

const DESCRIPTION_FIELDS = ['description', 'abstract', 'http://schema.org/description', 'http://schema.org/abstract'];

/**
 * Returns description paragraphs from the first source and field with text:
 * crate metadata first, then the entity summary. Empty arrays and blank values
 * fall through, so a crate with `description: []` still shows its abstract.
 */
export function descriptionParagraphs(...sources: (Record<string, unknown> | undefined)[]): string[] {
  for (const source of sources) {
    for (const field of DESCRIPTION_FIELDS) {
      const paragraphs = strings(source?.[field]).flatMap((value) =>
        plainDescription(value)
          .split(/\n\s*\n/)
          .map((part) => part.trim())
          .filter(Boolean),
      );
      if (paragraphs.length) {
        return paragraphs;
      }
    }
  }
  return [];
}
