// The presenter spotlight (Nov 1). While a take is being recorded, the part of
// the page the narration is about is ringed and the rest of the stage dimmed,
// so the picture leads the voice: the reader sees where to look and the
// speaker, reading over the picture, sees what to say. It is driven from
// outside the page (window.ypid.spotlight in main.ts) by the recording script
// and never by the replay itself; a viewer never sees it unless something
// calls it. Pure mapping here, DOM work in main.ts.

export const SPOT_REGIONS = [
  'pickers', 'transport', 'context', 'chart', 'criteria', 'draft', 'payer-reason', 'strip', 'verdict', 'sentences', 'counters', 'board', 'compare', 'writ', 'writ-signature', 'writ-tools', 'writ-provenance',
] as const;
export type SpotRegion = (typeof SPOT_REGIONS)[number];

const SELECTORS: Record<SpotRegion, string> = {
  pickers: '.pickers',
  transport: '.transport',
  context: '#context',
  chart: '.panel.chart',
  criteria: '.panel.criteria',
  draft: '.panel.draft',
  'payer-reason': '#payer-reason',
  strip: '#strip',
  verdict: '#verdict',
  sentences: '#sentences',
  counters: '.counters',
  board: '#board-table',
  compare: '#compare-grid',
  writ: '#writ-sheet',
  'writ-signature': '#writ-signature',
  'writ-tools': '.writ-tools',
  'writ-provenance': '#writ-provenance',
};

// A region name, or `sentence:<index>` for one sentence of the draft, or an
// `entry:<id>` for one chart entry. Anything else is null, and the caller clears.
export function spotSelector(name: string): string | null {
  if ((SPOT_REGIONS as readonly string[]).includes(name)) return SELECTORS[name as SpotRegion];
  const s = /^sentence:(\d+)$/.exec(name);
  if (s) return `li.sentence[data-index="${s[1]}"]`;
  const e = /^entry:(note-\d{3})$/.exec(name);
  if (e) return `#entries .entry[data-id="${e[1]}"]`;
  return null;
}

export const SPOT_CLASS = 'spot';
export const SPOT_ATTR = 'data-spot';
