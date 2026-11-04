import {
  getBasePathUrl as sharedGetBasePathUrl,
  getEntityUrl as sharedGetEntityUrl,
} from '@researchdatabox/oni-client';

export { first, joinAll } from '@researchdatabox/oni-client';

import type { EntityType } from '@/services/api';

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

export const shortenText = (input: string, { minLength = 0, maxLength = 24 } = {}) => {
  if (!input) {
    return input;
  }

  if (input.length <= minLength) {
    return input; // Don't shorten if it's too short
  }

  return input.length > maxLength ? `${input.slice(0, maxLength)}...` : input;
};

export const isAbsoluteUrl = (value: unknown) => {
  if (typeof value !== 'string' || /\s/.test(value)) {
    return false;
  }

  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const getBasePathUrl = (path: string) => sharedGetBasePathUrl(path, import.meta.env.BASE_URL);

export const getEntityUrl = (entity: EntityType) =>
  sharedGetEntityUrl(
    entity,
    {
      'http://pcdm.org/models#Collection': '/collection',
      'http://pcdm.org/models#Object': '/object',
      'http://schema.org/Person': '/person',
      'http://schema.org/MediaObject': '/file',
    },
    '/entity',
  );

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

const exactMediaTypeIcons: Record<string, string> = {
  'text/csv': 'file-csv',
  'application/zip': 'file-zipper',
  'application/pdf': 'file-pdf',
  'application/msword': 'file-word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-word',
  'application/x-ipynb+json': 'clipboard',
  'application/mp4': 'file-video',
  'application/mxf': 'file-video',
  'application/json': 'file-code',
};

const mediaTypeIcon = (mediaType: string) => {
  const exact = exactMediaTypeIcons[mediaType];
  if (exact) {
    return exact;
  }

  if (mediaType.startsWith('video')) {
    return 'file-video';
  }

  if (mediaType.startsWith('audio')) {
    return 'file-audio';
  }

  if (mediaType.startsWith('image')) {
    return 'file-image';
  }

  if (mediaType.startsWith('text')) {
    return 'file-lines';
  }

  if (mediaType.includes('xml')) {
    return 'file-code';
  }

  console.log(`Need mediaType icon for ${mediaType}`);

  return 'file';
};

export const groupMediaTypesByIcon = (mediaTypes: string[]) => {
  const groups = new Map<string, string[]>();
  for (const mediaType of new Set(mediaTypes)) {
    const icon = mediaTypeIcon(mediaType);
    const group = groups.get(icon);
    if (group) {
      group.push(mediaType);
    } else {
      groups.set(icon, [mediaType]);
    }
  }

  return [...groups].map(([icon, types]) => ({ icon, mediaTypes: types }));
};
