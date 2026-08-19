import { describe, expect, it } from 'vitest';

import {
  clampPage,
  fileDeepLink,
  formatTimecode,
  matchAnnotation,
  parsePageParam,
  parseStartParam,
  parseTierParam,
  type SearchSegment,
  segmentLabel,
  segmentRows,
  segmentUrl,
  startParamToMs,
} from '@/segments';

const pageSegment: SearchSegment = { type: 'page', page: 4, highlight: ['...<mark>kurrama</mark>...'] };
const annotationSegment: SearchSegment = {
  type: 'time-aligned-annotation',
  tier: 'tx@EDD',
  startMs: 192000,
  endMs: 195400,
  highlight: ['...spoken...'],
};

describe('formatTimecode', () => {
  it('formats sub-hour times as mm:ss', () => {
    expect(formatTimecode(0)).toBe('00:00');
    expect(formatTimecode(192000)).toBe('03:12');
    expect(formatTimecode(195400)).toBe('03:15');
    expect(formatTimecode(599999)).toBe('09:59');
  });

  it('formats hour-long times as h:mm:ss', () => {
    expect(formatTimecode(3600000)).toBe('1:00:00');
    expect(formatTimecode(3723000)).toBe('1:02:03');
    expect(formatTimecode(36000000)).toBe('10:00:00');
  });
});

describe('segmentLabel', () => {
  it('labels page segments', () => {
    expect(segmentLabel(pageSegment)).toBe('p. 4');
  });

  it('labels annotation segments with a timecode range', () => {
    expect(segmentLabel(annotationSegment)).toBe('03:12–03:15');
  });

  it('labels hour-long annotations', () => {
    expect(segmentLabel({ type: 'time-aligned-annotation', tier: 't', startMs: 3600000, endMs: 3661000 })).toBe(
      '1:00:00–1:01:01',
    );
  });

  it('returns null for unknown segment types', () => {
    expect(segmentLabel({ type: 'paragraph', highlight: ['...'] })).toBe(null);
  });

  it('returns null for known types missing their location fields', () => {
    expect(segmentLabel({ type: 'page' })).toBe(null);
    expect(segmentLabel({ type: 'time-aligned-annotation', tier: 't' })).toBe(null);
  });
});

describe('segmentUrl', () => {
  it('builds a page deep link', () => {
    expect(segmentUrl('abc/1', pageSegment)).toBe('/file?id=abc%2F1&page=4');
  });

  it('builds an annotation deep link with start in seconds and the verbatim tier', () => {
    expect(segmentUrl('abc', annotationSegment)).toBe('/file?id=abc&start=192&tier=tx%40EDD');
  });

  it('carries fractional seconds', () => {
    expect(segmentUrl('abc', { ...annotationSegment, startMs: 192500 })).toBe('/file?id=abc&start=192.5&tier=tx%40EDD');
  });

  it('omits the tier parameter when the segment has no tier', () => {
    expect(segmentUrl('abc', { type: 'time-aligned-annotation', startMs: 1000, endMs: 2000 })).toBe(
      '/file?id=abc&start=1',
    );
  });

  it('URL-encodes arbitrary depositor tier names', () => {
    const tier = 'phonetic (ˈkʊrama) & more';
    const url = segmentUrl('abc', { type: 'time-aligned-annotation', tier, startMs: 0, endMs: 1 });
    expect(url).not.toBe(null);
    const query = new URLSearchParams((url as string).split('?')[1]);
    expect(query.get('tier')).toBe(tier);
  });

  it('returns null for unknown segment types', () => {
    expect(segmentUrl('abc', { type: 'paragraph', highlight: ['...'] })).toBe(null);
  });

  it('returns null for malformed known segments', () => {
    expect(segmentUrl('abc', { type: 'page' })).toBe(null);
    expect(segmentUrl('abc', { type: 'page', page: 0 })).toBe(null);
    expect(segmentUrl('abc', { type: 'time-aligned-annotation', tier: 't' })).toBe(null);
    expect(segmentUrl('abc', { type: 'time-aligned-annotation', tier: 't', startMs: -5, endMs: 0 })).toBe(null);
  });
});

describe('fileDeepLink', () => {
  it('builds a plain file link', () => {
    expect(fileDeepLink('abc/1')).toBe('/file?id=abc%2F1');
  });

  it('carries start and tier when present', () => {
    expect(fileDeepLink('abc', 192.5, 'tx@EDD')).toBe('/file?id=abc&start=192.5&tier=tx%40EDD');
    expect(fileDeepLink('abc', 192.5)).toBe('/file?id=abc&start=192.5');
    expect(fileDeepLink('abc', null, 'tx')).toBe('/file?id=abc&tier=tx');
  });
});

describe('segmentRows', () => {
  it('maps segments to rows preserving server order', () => {
    const rows = segmentRows('abc', [pageSegment, annotationSegment]);
    expect(rows).toEqual([
      { label: 'p. 4', tier: null, url: '/file?id=abc&page=4', highlight: '...<mark>kurrama</mark>...' },
      { label: '03:12–03:15', tier: 'tx@EDD', url: '/file?id=abc&start=192&tier=tx%40EDD', highlight: '...spoken...' },
    ]);
  });

  it('keeps unknown segment types as plain rows with their highlight', () => {
    const rows = segmentRows('abc', [{ type: 'paragraph', highlight: ['fragment'] }]);
    expect(rows).toEqual([{ label: null, tier: null, url: null, highlight: 'fragment' }]);
  });

  it('drops segments with neither a label nor a highlight', () => {
    expect(segmentRows('abc', [{ type: 'mystery' }])).toEqual([]);
  });

  // The spec renamed this type to 'time-aligned-annotation' before 0.1.0 shipped
  // and nabu rewrote its stored segments to match, so the old value is a foreign
  // type like any other — no timecode label, no deep link.
  it('does not deep-link the pre-rename annotation type', () => {
    const rows = segmentRows('abc', [{ ...annotationSegment, type: 'annotation' }]);

    expect(rows).toEqual([{ label: null, tier: null, url: null, highlight: '...spoken...' }]);
  });
});

describe('parsePageParam', () => {
  it('parses an integer page', () => {
    expect(parsePageParam('4')).toBe(4);
    expect(parsePageParam('0')).toBe(0);
    expect(parsePageParam('-3')).toBe(-3);
  });

  it('drops malformed values', () => {
    expect(parsePageParam('abc')).toBe(null);
    expect(parsePageParam('2.5')).toBe(null);
    expect(parsePageParam('')).toBe(null);
    expect(parsePageParam(undefined)).toBe(null);
    expect(parsePageParam(null)).toBe(null);
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parsePageParam(['4', '7'])).toBe(4);
  });
});

describe('clampPage', () => {
  it('keeps in-range pages', () => {
    expect(clampPage(4, 10)).toBe(4);
  });

  it('clamps out-of-range pages into the document range', () => {
    expect(clampPage(400, 10)).toBe(10);
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-3, 10)).toBe(1);
  });

  it('returns null when the document has no pages', () => {
    expect(clampPage(4, 0)).toBe(null);
  });
});

describe('parseStartParam', () => {
  it('parses fractional seconds', () => {
    expect(parseStartParam('192.5')).toBe(192.5);
    expect(parseStartParam('5000')).toBe(5000);
  });

  it('drops malformed or negative values', () => {
    expect(parseStartParam('abc')).toBe(null);
    expect(parseStartParam('-1')).toBe(null);
    expect(parseStartParam('')).toBe(null);
    expect(parseStartParam(undefined)).toBe(null);
    expect(parseStartParam(null)).toBe(null);
  });
});

describe('parseTierParam', () => {
  it('passes through a verbatim tier id', () => {
    expect(parseTierParam('tx@EDD')).toBe('tx@EDD');
  });

  it('drops empty or missing values', () => {
    expect(parseTierParam('')).toBe(null);
    expect(parseTierParam(undefined)).toBe(null);
    expect(parseTierParam(null)).toBe(null);
  });
});

describe('matchAnnotation', () => {
  const annotations = [
    { startMs: 0, endMs: 1000, id: 'a' },
    { startMs: 2000, endMs: 3000, id: 'b' },
    { startMs: 10000, endMs: 12000, id: 'c' },
  ];

  it('returns the annotation whose interval contains the start time', () => {
    expect(matchAnnotation(annotations, 2500)?.id).toBe('b');
    expect(matchAnnotation(annotations, 2000)?.id).toBe('b'); // inclusive start
  });

  it('treats the interval end as exclusive', () => {
    expect(matchAnnotation(annotations, 1000)?.id).toBe('a'); // nearest, not containing
  });

  it('falls back to the nearest annotation by start time', () => {
    expect(matchAnnotation(annotations, 900)?.id).toBe('a'); // contained, not fallback
    expect(matchAnnotation(annotations, 1400)?.id).toBe('b');
    expect(matchAnnotation(annotations, 99000)?.id).toBe('c');
  });

  it('returns null for an empty tier', () => {
    expect(matchAnnotation([], 2500)).toBe(null);
  });
});

describe('startParamToMs', () => {
  it('round-trips segment start times through the URL without float drift', () => {
    for (const startMs of [0, 192000, 192500, 195400, 3599999]) {
      const url = segmentUrl('abc', {
        type: 'time-aligned-annotation',
        tier: 't',
        startMs,
        endMs: startMs + 1000,
      }) as string;
      const start = new URLSearchParams(url.split('?')[1]).get('start') as string;
      expect(startParamToMs(Number(start))).toBe(startMs);
    }
  });
});
