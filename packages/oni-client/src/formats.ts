import { metadataValues } from './values.js';

const LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/csv': 'CSV',
  'text/tab-separated-values': 'TSV',
  'text/plain': 'TXT',
  'text/html': 'HTML',
  'application/xhtml+xml': 'HTML',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
  'application/gzip': 'GZIP',
  'application/x-gzip': 'GZIP',
  'application/x-tar': 'TAR',
  'application/json': 'JSON',
  'application/ld+json': 'JSON-LD',
  'application/xml': 'XML',
  'text/xml': 'XML',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12': 'XLSB',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'XLSM',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/tiff': 'TIFF',
  'image/svg+xml': 'SVG',
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'video/mp4': 'MP4',
  'zip format': 'ZIP',
  'gzip format': 'GZIP',
  'hypertext markup language': 'HTML',
  'microsoft excel non-xml binary workbook': 'XLSB',
  'microsoft excel for windows': 'XLS',
};
// PUIDs from The National Archives' PRONOM registry; unknown PUIDs retain identity.
const PRONOM: Record<string, string> = {
  'fmt/18': 'PDF',
  'fmt/19': 'PDF',
  'fmt/20': 'PDF',
  'fmt/276': 'PDF',
  'fmt/214': 'XLSX',
  'fmt/189': 'OOXML',
  'x-fmt/263': 'ZIP',
  'x-fmt/18': 'CSV',
  'fmt/96': 'HTML',
  'fmt/97': 'HTML',
  'fmt/98': 'HTML',
  'fmt/101': 'XML',
};
/**
 * Short, researcher-facing format label (`CSV`, `XLSX`, `PDF`) from MIME types,
 * PRONOM PUIDs or names, falling back to the file extension. Generic binary
 * types never hide a better extension.
 */
export function formatLabel(format: unknown, filename = ''): string {
  const candidates = metadataValues(format);
  if (format && typeof format === 'object') {
    for (const node of Array.isArray(format) ? format : [format]) {
      if (node && typeof node === 'object') {
        candidates.push(...metadataValues((node as Record<string, unknown>)['@id']));
      }
    }
  }
  const extension = filename
    .split(/[?#]/)[0]
    ?.match(/\.([a-z\d]{1,12})$/i)?.[1]
    ?.toUpperCase();
  for (const value of candidates) {
    const puid = value
      .trim()
      .toLowerCase()
      .match(/(?:^|\/)((?:x-)?fmt\/\d+)\/?$/)?.[1];
    if (puid && PRONOM[puid]) {
      return puid === 'fmt/189' ? extension || 'OOXML' : PRONOM[puid];
    }
  }
  for (const value of candidates) {
    const key = value.trim().toLowerCase().split(';')[0] || '';
    if (key === 'microsoft excel for windows' && extension) {
      return extension;
    }
    if (LABELS[key]) {
      return LABELS[key];
    }
  }
  const unknownPuid = candidates.map((value) => value.match(/(?:^|\/)((?:x-)?fmt\/\d+)\/?$/i)?.[1]).find(Boolean);
  const useful = candidates.find(
    (value) => value.trim() && !/^(application\/octet-stream|binary\/octet-stream)(?:;|$)/i.test(value.trim()),
  );
  return unknownPuid ? extension || `PRONOM ${unknownPuid}` : useful?.trim() || extension || '—';
}
