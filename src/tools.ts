import { ui } from '@/configuration';
import type { EntityType } from '@/services/api';

const unitMultipliers = {
  bytes: 1,
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

export const formatFileSize = (bytes: number, locales = 'en') => {
  if (!bytes || bytes === 0) {
    return 'N/A';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const threshold = 1024;

  if (bytes < threshold) {
    return `${bytes} B`;
  }

  const i = Math.floor(Math.log(bytes) / Math.log(threshold));
  const value = bytes / threshold ** i;

  const formatter = new Intl.NumberFormat(locales, { maximumFractionDigits: 2 });

  return `${formatter.format(value)} ${units[i]}`;
};

export const joinAll = (arr: string | string[] | undefined, separator = ' | '): string => {
  if (!arr) {
    return '';
  }

  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr.filter(Boolean).join(separator);
};

export const shortenText = (input: string, { minLength = 0, maxLength = 24 } = {}) => {
  if (!input) {
    return input;
  }

  if (input.length <= minLength) {
    return input; // Don't shorten if it's too short
  }

  return input.length > maxLength ? `${input.slice(0, maxLength)}...` : input;
};

export const parseContentSize = (value: string | number) => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value; // Already in bytes
  }

  const regex = /^(\d+(?:\.\d+)?)(\s*)(bytes|b|kb|mb|gb|tb)$/i;

  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(regex);
  if (!match) {
    return null;
  }

  if (!match[1] || !match[3]) {
    return null;
  }

  const number = parseFloat(match[1]);
  const unit = match[3].toLowerCase();

  return number * (unitMultipliers[unit as keyof typeof unitMultipliers] || 1);
};

export const getEntityUrl = (entity: EntityType) => {
  const { entityType } = entity;
  const id = encodeURIComponent(entity.id);
  switch (entityType) {
    case 'http://pcdm.org/models#Collection':
      return `/collection?id=${id}`;
    case 'http://pcdm.org/models#Object':
      return `/object?id=${id}`;
    case 'http://schema.org/Person':
      return `/person?id=${id}`;
    case 'http://schema.org/MediaObject':
      return `/file?id=${id}`;
    default:
      return `/entity?id=${id}`;
  }
};

// NOTE: This assumes the array is never empty from a type perspective
export const first = <T>(arr: T | T[]) => {
  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr[0] as T;
};

// If metadataMapping exists, use the mapping file to map metadata fields to display names, using the "@id" or "rdfs:label" and "name" fields. Otherwise, use the textReplacements mapping.
const metadataMapping = ui.metadataMapping;
const textReplacements = ui.textReplacements;

type MetadataGraphNode = {
  'rdfs:label'?: unknown;
  '@id'?: unknown;
  name?: unknown;
};

type MetadataMappingFile = {
  '@graph'?: unknown;
};

const getMetadataName = (name: unknown): string | null => {
  if (typeof name === 'string' && name.trim()) {
    return name;
  }

  if (Array.isArray(name)) {
    const firstName = name.find((value) => typeof value === 'string' && value.trim());
    return typeof firstName === 'string' ? firstName : null;
  }

  return null;
};

const isAbsoluteUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

const getMappingFileCandidates = (mappingFile: string) => {
  const candidates = new Set<string>([mappingFile]);

  if (!isAbsoluteUrl(mappingFile)) {
    if (!mappingFile.startsWith('/')) {
      candidates.add(`/${mappingFile}`);
    }

    if (ui.urlPrefix) {
      const normalizedPrefix = ui.urlPrefix.endsWith('/') ? ui.urlPrefix.slice(0, -1) : ui.urlPrefix;
      const normalizedPath = mappingFile.startsWith('/') ? mappingFile : `/${mappingFile}`;
      candidates.add(`${normalizedPrefix}${normalizedPath}`);
    }
  }

  return Array.from(candidates);
};

const loadMetadataMapping = async () => {
  const mappingFile = metadataMapping?.mappingFile;
  if (!mappingFile) {
    return new Map<string, string>();
  }

  for (const path of getMappingFileCandidates(mappingFile)) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as MetadataMappingFile;
      const graph = Array.isArray(payload['@graph']) ? payload['@graph'] : [];
      const mapping = new Map<string, string>();

      for (const node of graph) {
        if (!node || typeof node !== 'object') {
          continue;
        }

        const graphNode = node as MetadataGraphNode;
        const idFromLabel = getMetadataName(graphNode['rdfs:label']);
        const idFromId = getMetadataName(graphNode['@id']);
        const name = getMetadataName(graphNode.name);

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
      // Continue trying fallback paths if available.
    }
  }

  return new Map<string, string>();
};

const metadataNameById = await loadMetadataMapping();

export const startCase = (str: string) => {
  if (typeof str !== 'string' || !str) {
    return '';
  }

  if (metadataMapping) {
    const mappedName = metadataNameById.get(str);
    if (mappedName) {
      return mappedName;
    }
  }

  let words = str;

  if (!metadataMapping) {
    for (const [pattern, replacement] of Object.entries(textReplacements)) {
      const regex = new RegExp(pattern, 'g');
      words = words.replace(regex, replacement);
    }
  }

  words = words
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => {
      // NOTE: Don't change the case of words that are in the replacements list.
      if (!metadataMapping && Object.values(textReplacements).includes(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return words;
};

export const formatDuration = (seconds: number) => {
  if (seconds < 0) {
    return '0s';
  }

  const units = [
    { label: 'd', value: 86400 },
    { label: 'h', value: 3600 },
    { label: 'm', value: 60 },
    { label: 's', value: 1 },
  ];

  const parts: string[] = [];
  let remaining = Math.floor(seconds);

  for (const unit of units) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value);
      parts.push(`${count}${unit.label}`);
      remaining %= unit.value;
    }
  }

  return parts.length > 0 ? parts.join(' ') : '0s';
};
