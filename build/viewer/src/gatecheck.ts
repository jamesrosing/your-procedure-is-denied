// The gate, in the browser. Once a replay has reached its verdict, a reader can
// change a sentence (its words, its quote, or its citation) and have the same
// gate the harness ran re-check it against the same case: the same module
// (src/litmus.ts), the same admissible sources (src/sources.ts), bundled into
// app.js. Nothing is saved: the stored result and its verdict do not change,
// and the edit lives only in the page. This is the spike-in of section 2.7 made
// into a control a judge can turn by hand.
import { checkSentence, LITMUS_VERSION, type SentenceRecord, type SentenceStatus } from '../../src/litmus.js';
import { gateSources } from '../../src/sources.js';
import type { ViewerCase } from './replay.js';

export interface EditedSentence { text: string; citation: string; quote: string }

export interface Recheck {
  status: SentenceStatus;
  reason: string;
  missing?: string[];
  alsoCite?: string[];
  gate: string; // the gate version that judged the edit
}

export function recheck(c: ViewerCase, edited: EditedSentence): Recheck {
  const record: SentenceRecord = checkSentence(gateSources(c), { text: edited.text, citation: edited.citation, quote: edited.quote });
  return {
    status: record.status,
    reason: record.reason,
    ...(record.missing ? { missing: record.missing } : {}),
    ...(record.alsoCite ? { alsoCite: record.alsoCite } : {}),
    gate: LITMUS_VERSION,
  };
}

export function recheckLabel(status: SentenceStatus): string {
  return status === 'needs-citation' ? 'needs citation' : status;
}

export const EDIT_HELP = 'Change this sentence, its quote, or its citation, and the gate re-checks it here, in the browser, against the same chart, criteria, and denial the harness used. Nothing is saved: the stored result and its verdict do not change.';

export const EDIT_NOTE = 're-checked in the browser by the same gate; the stored verdict is unchanged';

export const EDIT_BUTTON = 'test the gate';
