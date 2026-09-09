import { ROCrate } from 'ro-crate';

import { ui } from '@/configuration';
import { first } from '@/lib/tools';

type MetadataMappingConfig = {
  mappingFile?: string;
  textReplacements?: Record<string, string>;
};

const metadataMapping: MetadataMappingConfig = ui.metadataMapping ?? {};
const mappingFile = metadataMapping.mappingFile;
const textReplacements: Record<string, string> = metadataMapping.textReplacements ?? {};

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

const isAbsoluteUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

const resolveMetadataMappingUrl = (mappingFile: string) => {
  if (isAbsoluteUrl(mappingFile)) {
    return mappingFile;
  }

  const normalizedPath = mappingFile.startsWith('/') ? mappingFile : `/${mappingFile}`;
  const prefix = ui.urlPrefix.endsWith('/') ? ui.urlPrefix.slice(0, -1) : ui.urlPrefix;

  return `${prefix}${normalizedPath}`;
};

const loadMetadataMapping = async () => {
  if (!mappingFile) {
    return new Map<string, string>();
  }

  try {
    const response = await fetch(resolveMetadataMappingUrl(mappingFile));
    if (!response.ok) {
      return new Map<string, string>();
    }

    const payload = await response.json();
    const crate = new ROCrate(payload, { array: true, link: true });
    const graph = crate.getGraph();
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
  } catch {
    return new Map<string, string>();
  }
};

const metadataNameById = await loadMetadataMapping();

export const startCase = (str: string) => {
  if (typeof str !== 'string' || !str) {
    return '';
  }

  if (mappingFile) {
    const mappedName = metadataNameById.get(str);
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
