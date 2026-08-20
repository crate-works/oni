// Search-hit segments (nabu's per-location matches) and the deep-link URL
// scheme they map onto: /file?page=N for PDFs, /file?start=S&tier=T for
// transcriptions and media. All parsing is forgiving — malformed values are
// dropped and out-of-range values clamped, so stale links still open the file.

export type SearchSegment = {
  type: string;
  page?: number;
  tier?: string;
  startMs?: number;
  endMs?: number;
  highlight?: string[];
};

export type SegmentRow = {
  label: string | null;
  tier: string | null;
  url: string | null;
  highlight: string | null;
};

const isValidPage = (page: unknown): page is number => Number.isInteger(page) && (page as number) >= 1;

const isValidMs = (ms: unknown): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0;

// A position within a recording: MM:SS, gaining an hours part past the hour.
// fraction adds centiseconds, for callers reading annotation boundaries that
// can sit less than a second apart.
export const formatTimecode = (ms: number, { fraction = false } = {}): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centis = fraction ? `.${String(Math.floor((ms % 1000) / 10)).padStart(2, '0')}` : '';
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${centis}`;

  return hours > 0 ? `${hours}:${mmss}` : mmss;
};

export const segmentLabel = (segment: SearchSegment): string | null => {
  if (segment.type === 'page' && isValidPage(segment.page)) {
    return `p. ${segment.page}`;
  }

  if (segment.type === 'time-aligned-annotation' && isValidMs(segment.startMs) && isValidMs(segment.endMs)) {
    return `${formatTimecode(segment.startMs)}–${formatTimecode(segment.endMs)}`;
  }

  return null;
};

// A /file link optionally carrying start (seconds) and tier deep-link parameters
export const fileDeepLink = (
  fileId: string,
  start: number | null = null,
  tier: string | null | undefined = null,
): string => {
  const startPart = start !== null ? `&start=${start}` : '';
  const tierPart = tier ? `&tier=${encodeURIComponent(tier)}` : '';

  return `/file?id=${encodeURIComponent(fileId)}${startPart}${tierPart}`;
};

export const segmentUrl = (fileId: string, segment: SearchSegment): string | null => {
  if (segment.type === 'page' && isValidPage(segment.page)) {
    return `${fileDeepLink(fileId)}&page=${segment.page}`;
  }

  if (segment.type === 'time-aligned-annotation' && isValidMs(segment.startMs)) {
    return fileDeepLink(fileId, segment.startMs / 1000, segment.tier ?? null);
  }

  return null;
};

export const segmentRows = (fileId: string, segments: SearchSegment[]): SegmentRow[] =>
  segments
    .map((segment) => ({
      label: segmentLabel(segment),
      tier: (segment.type === 'time-aligned-annotation' && segment.tier) || null,
      url: segmentUrl(fileId, segment),
      highlight: segment.highlight?.[0] ?? null,
    }))
    .filter((row) => row.label !== null || row.highlight !== null);

// Route query values are string | null | (string | null)[]
const firstQueryValue = (value: unknown): string | null => {
  const single = Array.isArray(value) ? value[0] : value;

  return typeof single === 'string' && single !== '' ? single : null;
};

export const parsePageParam = (value: unknown): number | null => {
  const raw = firstQueryValue(value);
  if (raw === null) {
    return null;
  }

  const page = Number(raw);

  return Number.isInteger(page) ? page : null;
};

// Applied where the page count is known (after the PDF loads)
export const clampPage = (page: number, numPages: number): number | null => {
  if (numPages < 1) {
    return null;
  }

  return Math.min(Math.max(page, 1), numPages);
};

export const parseStartParam = (value: unknown): number | null => {
  const raw = firstQueryValue(value);
  if (raw === null) {
    return null;
  }

  const start = Number(raw);

  return Number.isFinite(start) && start >= 0 ? start : null;
};

export const parseTierParam = (value: unknown): string | null => firstQueryValue(value);

// Rounds away the float drift from the seconds↔ms conversion (192.5 * 1000 is
// not exactly 192500 in IEEE 754), so a URL start always matches its annotation.
export const startParamToMs = (startSeconds: number): number => Math.round(startSeconds * 1000);

export type AnnotationInterval = { startMs: number; endMs: number };

// The annotation whose interval contains the start time (start inclusive, end
// exclusive); failing that, the nearest by start time — so slightly-off or
// hand-edited links still land on a plausible annotation.
export const matchAnnotation = <T extends AnnotationInterval>(annotations: T[], startMs: number): T | null => {
  const containing = annotations.find((a) => a.startMs <= startMs && startMs < a.endMs);
  if (containing) {
    return containing;
  }

  let nearest: T | null = null;
  for (const annotation of annotations) {
    if (!nearest || Math.abs(annotation.startMs - startMs) < Math.abs(nearest.startMs - startMs)) {
      nearest = annotation;
    }
  }

  return nearest;
};
