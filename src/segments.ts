import {
  type SearchSegment,
  fileDeepLink as sharedFileDeepLink,
  segmentRows as sharedSegmentRows,
  segmentUrl as sharedSegmentUrl,
} from '@researchdatabox/oni-client';

// Router links stay route-relative; Vue Router applies the deployment base.
export const fileDeepLink = (id: string, start: number | null = null, tier?: string | null) =>
  sharedFileDeepLink(id, '/file', start, tier);
export const segmentUrl = (id: string, segment: SearchSegment) => sharedSegmentUrl(id, '/file', segment);
export const segmentRows = (id: string, segments: SearchSegment[]) => sharedSegmentRows(id, '/file', segments);
