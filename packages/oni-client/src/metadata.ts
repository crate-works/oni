import { first } from './tools.js';
import type { RoCrate } from './types.js';

type MetadataGraphNode = {
  'rdfs:label'?: unknown;
  '@id'?: unknown;
  name?: unknown;
};

const getFirstStringValue = (value: unknown): string | null => {
  const values = Array.isArray(value) ? value : [value];
  const firstValue = first(values.filter((item): item is string => typeof item === 'string' && item.trim().length > 0));

  if (typeof firstValue !== 'string') {
    return null;
  }

  return firstValue.trim();
};

/**
 * Interpret an already-loaded RO-Crate with @context and @graph, including a
 * metadata descriptor (about: { '@id': './' }) and root Dataset ('@id': './').
 * A bare list of label nodes is not the input contract; see the README example.
 * Loading, URL bases and fallback belong to the app.
 */
export const buildMetadataNameMap = async (payload: unknown): Promise<Map<string, string>> => {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('Expected mapping data object');
  }
  const { parseRoCrateGraph } = await import('./rocrate.js');
  const graph = parseRoCrateGraph(payload);
  const mapping = new Map<string, string>();

  for (const node of graph) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const graphNode = node as MetadataGraphNode;
    const idFromLabel = getFirstStringValue(graphNode['rdfs:label']);
    const idFromId = getFirstStringValue(graphNode['@id']);
    const name = getFirstStringValue(graphNode.name);

    if (name) {
      if (idFromLabel) {
        mapping.set(idFromLabel, name);
      }

      if (idFromId) {
        mapping.set(idFromId, name);
      }
    }
  }

  return mapping;
};

export type MetadataLabelOptions = {
  /** True even if a configured mapping failed to load: preserve raw labels. */
  mappingConfigured?: boolean;
  names?: ReadonlyMap<string, string>;
  textReplacements?: Readonly<Record<string, string>>;
};

export const metadataLabel = (str: string, options: MetadataLabelOptions = {}): string => {
  const { mappingConfigured = false, names, textReplacements = {} } = options;
  if (typeof str !== 'string' || !str) {
    return '';
  }

  if (mappingConfigured) {
    const mappedName = names?.get(str);
    if (mappedName) {
      return mappedName;
    }

    return str;
  }

  let words = str;

  for (const [pattern, replacement] of Object.entries(textReplacements)) {
    const regex = new RegExp(pattern, 'g');
    words = words.replace(regex, replacement);
  }

  words = words
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => {
      if (Object.values(textReplacements).includes(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return words;
};

export type MetadataSelection =
  | { mode: 'explicit'; show: readonly string[] }
  | { mode?: 'filter'; top: readonly { name: string }[]; hide: readonly string[] };
export type MetadataField = { name: string; data: RoCrate[keyof RoCrate] };

const isEmpty = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'object' && Object.keys(value).length === 0);

export const extractPropertyFromIdentifier = (
  identifiers: { name: string[]; value: string[] }[],
  propertyName: string,
): string | undefined => first(identifiers.find((id) => first(id.name) === propertyName)?.value);

export const metadataName = (md: Pick<RoCrate, 'name'>, fallback?: string | string[]): string =>
  first(md.name) || (fallback ? first(fallback) : '') || '';

/** Keep linked values by reference; do not JSON-clone cyclic crate proxies. */
export const selectMetadata = (md: RoCrate, options: MetadataSelection): MetadataField[] => {
  const fields: MetadataField[] = [];
  const add = (name: string, data: RoCrate[keyof RoCrate]) => {
    if (!isEmpty(data)) {
      fields.push({ name, data });
    }
  };
  if (options.mode === 'explicit') {
    for (const field of options.show) {
      if (field.includes('.')) {
        const [fieldName, propertyName] = field.split('.') as [keyof RoCrate, string];
        if (fieldName in md) {
          add(propertyName, extractPropertyFromIdentifier(md[fieldName] as RoCrate['identifier'], propertyName));
        }
      } else if (field in md) {
        add(field, md[field as keyof RoCrate]);
      }
    }
  } else {
    const topNames = options.top.map(({ name }) => name);
    for (const name of topNames) {
      if (name in md) {
        add(name, md[name as keyof RoCrate]);
      }
    }
    const remaining = Object.keys(md).filter((key) => !options.hide.includes(key) && !topNames.includes(key));
    for (const name of remaining.sort()) {
      add(name, md[name as keyof RoCrate]);
    }
  }
  return fields;
};
