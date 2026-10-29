// The LITMUS gate, reimplemented during the event from the published papers
// (Litmus: The Admissible Set, doi 10.5281/zenodo.21227402, and its
// architecture companion, doi 10.5281/zenodo.21227855). Not copied from writ.
//
// What the papers fix:
//   - The check is deterministic and sits outside the model. A model grading
//     a model is the weak litmus the paper names as the one that fell away.
//   - It fails closed. Nothing ungrounded leaves; the worst case is deferral.
//   - Chart grounding is a referential warrant: it verifies that the draft
//     says what the record says, not that the care was right. Judgment stays
//     with the physician, who sees criterion, quote, and sentence together.
//   - Every claim, gate decision, and verdict is recorded (the provenance layer).
//
// How this gate checks support (the part the papers leave to the builder):
//   1. Resolve the citation to one chart entry. Unknown or malformed: unresolved.
//   2. The quote must appear verbatim in that entry's text (whitespace, case,
//      and quote glyphs normalized, nothing else). Absent or trivial: refuted.
//   3. Every hard token in the sentence (numbers, dates, codes, and a side,
//      left or right) must appear in the cited entry, the payer criteria,
//      the denial, or the stated case facts. Anything else: refuted, token named.
//      The whole cited entry counts, not only the quoted span: the gate exists
//      to catch invented facts, not to grade quoting form, and the clinician who
//      wrote the entry did not write it to a payer's vocabulary.
//   4. A check that throws is an error, never a refutation and never a pass.
// There is no resemblance threshold and no keyword list. The evidence is the
// clinician's own words, which no payer vocabulary can require.
import { createHash } from 'node:crypto';
import { CITATION_ID, type Appeal } from './schema.js';

export const LITMUS_VERSION = 'build/src/litmus.ts v1.4 (2026-10-28): exact-quote referential gate from the LITMUS papers; compound number words read as one number; a sentence whose unsourced tokens all live in another chart entry is returned as needs-citation naming that entry, still blocked; a side (left or right) is a hard token wherever it names a side, not only before a fixed anatomy list';

export interface GateEntry {
  id: string;
  date?: string;
  kind?: string;
  text: string;
}

export interface GateCriterion {
  id: string;
  text: string;
}

export interface GateSources {
  chart: GateEntry[];
  criteria: GateCriterion[];
  denial: string[]; // the denial's text fields: numbers here are admissible
  facts?: string[]; // other admissible case facts, e.g. the patient's age line
}

// needs-citation: every hard token the cited entry lacks is present in another
// entry of the same chart. The sentence may well be true, but the rule is one
// citation per sentence and every hard token in it, so the draft is still
// blocked; the record names the entry to add, so the physician is told what to
// fix rather than that the machine disagrees. A token found nowhere in the
// chart stays refuted: that is the invented-fact case the gate exists for.
export type SentenceStatus = 'verified' | 'unresolved' | 'refuted' | 'needs-citation' | 'error';

// Only this module holds the symbol, so only this module can build a record
// whose status is 'verified'. Other code can read the status; it cannot mint it.
const VERIFIED: unique symbol = Symbol('litmus.verified');

interface SentenceBase {
  index: number;
  text: string;
  citation: string;
  quote: string;
  reason: string; // a short code plus detail, e.g. 'unsourced-token: 16'
  missing?: string[]; // hard tokens with no admissible source
  alsoCite?: string[]; // needs-citation: chart entries that together source every missing token
}
export interface VerifiedSentence extends SentenceBase {
  status: 'verified';
  readonly [VERIFIED]: true;
}
export interface UnverifiedSentence extends SentenceBase {
  status: 'unresolved' | 'refuted' | 'needs-citation' | 'error';
}
export type SentenceRecord = VerifiedSentence | UnverifiedSentence;

interface EvidenceBase {
  index: number;
  criterion: string;
  citation: string;
  quote: string;
  reason: string;
}
export interface VerifiedEvidence extends EvidenceBase {
  status: 'verified';
  readonly [VERIFIED]: true;
}
export interface UnverifiedEvidence extends EvidenceBase {
  status: 'unresolved' | 'refuted' | 'error';
}
export type EvidenceRecord = VerifiedEvidence | UnverifiedEvidence;

export interface GateResult {
  litmus: string;
  verdict: 'pass' | 'blocked' | 'declined';
  reasons: string[]; // why a packet is blocked, one line each
  errored: boolean; // at least one check threw: distinguishable from refuted
  declinedReason?: string;
  sentences: SentenceRecord[];
  evidence: EvidenceRecord[];
  criteria: Record<string, 'verified' | 'unverified'>;
  counts: { sentences: number; verified: number; unresolved: number; refuted: number; needsCitation: number; error: number; evidence: number; evidenceVerified: number };
  inputHash: string; // sha256 of the sources and the draft, for the provenance record
}

// --- text normalization -----------------------------------------------------

function canon(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NUMBER_WORDS: Record<string, string> = {
  two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90', hundred: '100',
};
const NUMBER_WORD_RE = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'g');
// "eighty-one" or "eighty one" is 81, one number, not 80 and 1. Spoken dictation
// and model prose both write compounds; the gate must read them as the clinician meant.
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const ONES = 'one|two|three|four|five|six|seven|eight|nine';
const COMPOUND_RE = new RegExp(`\\b(${TENS})[ -](${ONES})\\b`, 'g');
const ONES_VALUE: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
// "one hundred ten", "two hundred", "three hundred twenty-five", "a hundred and five":
// one number each. Found live Oct 28 (muse-spark-1.3 with CHART, case-032): the
// gate read "one hundred ten feet" as 1, 100, 10 and refuted a true sentence.
const TEENS = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const HUNDREDS_RE = new RegExp(
  `\\b(${ONES}|a)[ -]hundred(?:[ -](?:and[ -])?(?:(${TENS})(?:[ -](${ONES}))?|(${TEENS})|(${ONES})))?\\b`,
  'g',
);
function hundreds(_: string, h: string, tens?: string, tensOnes?: string, teen?: string, ones?: string): string {
  let n = (h === 'a' ? 1 : ONES_VALUE[h]!) * 100;
  if (tens) n += Number(NUMBER_WORDS[tens]) + (tensOnes ? ONES_VALUE[tensOnes]! : 0);
  else if (teen) n += Number(NUMBER_WORDS[teen]);
  else if (ones) n += ONES_VALUE[ones]!;
  return String(n);
}

function prepare(text: string): string {
  return canon(text)
    .replace(/\bnote-\d{3}\b/g, ' ')
    .replace(/\bcrit-\d+\b/g, ' ')
    .replace(HUNDREDS_RE, hundreds)
    .replace(COMPOUND_RE, (_, tens: string, ones: string) => String(Number(NUMBER_WORDS[tens]) + ONES_VALUE[ones]!))
    .replace(NUMBER_WORD_RE, w => NUMBER_WORDS[w]!);
}

function stripZeros(n: string): string {
  return n.replace(/^0+(?=\d)/, '');
}

// v1.4: a side is a hard token wherever it names a side. v1.3 recognized a side
// only before a fixed list of anatomical words, and the mutation harness
// (scripts/mutate.ts, Oct 28) found 48 swapped sides passing in contexts outside
// that list: "left ventricle", "left forefoot ulcer", "right great toe extensor",
// "left total knee arthroplasty". The uses of left and right that are not sides
// ("left the clinic", "right back to baseline") are masked before the check.
const SIDE_IDIOM = /\bright (?:back|away|now|after|before|here|there|then|to|at)\b|\bleft (?:the|a|an|against|behind|over|off|out|in|to|for|at|on|with|without|home|early|before|after|us|him|her|them|it|from)\b/g;

// Hard tokens of a sentence: the facts that must have an admissible source.
function sentenceHardTokens(text: string): Set<string> {
  const t = prepare(text);
  const out = new Set<string>();
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(m[0]);
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) out.add(m[0]);
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.add(stripZeros(m[0]));
  for (const m of t.matchAll(/\b[a-z]\d{2}(?:\.\d+)?\b/g)) out.add(m[0]);
  for (const m of t.replace(SIDE_IDIOM, ' ').matchAll(/\b(left|right)\b/g)) out.add(m[1]!);
  if (/\bbilateral(?:ly)?\b/.test(t)) out.add('bilateral');
  out.delete('');
  return out;
}

// Admissible tokens of a source: everything a sentence may legitimately carry.
function sourceTokens(text: string, into: Set<string>): void {
  const t = prepare(text);
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    into.add(m[0]);
    into.add(stripZeros(m[1]!));
    into.add(stripZeros(m[2]!));
    into.add(stripZeros(m[3]!));
  }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    into.add(m[0]);
    into.add(stripZeros(m[1]!));
    into.add(stripZeros(m[2]!));
    into.add(stripZeros(m[3]!));
  }
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) into.add(stripZeros(m[0]));
  for (const m of t.matchAll(/\b[a-z]\d{2}(?:\.\d+)?\b/g)) into.add(m[0]);
  for (const m of t.matchAll(/\b(left|right)\b/g)) into.add(m[1]!);
  if (/\bbilateral(?:ly)?\b/.test(t)) into.add('bilateral');
}

// --- the checks --------------------------------------------------------------

type Check = { ok: true } | { ok: false; status: 'unresolved' | 'refuted'; reason: string; missing?: string[] };

function resolve(chart: GateEntry[], citation: string): { ok: true; entry: GateEntry } | { ok: false; status: 'unresolved'; reason: string } {
  if (!CITATION_ID.test(citation)) return { ok: false, status: 'unresolved', reason: `citation-malformed: ${citation.slice(0, 40) || '(empty)'}` };
  const entry = chart.find(e => e.id === citation);
  if (!entry) return { ok: false, status: 'unresolved', reason: `citation-unknown: ${citation}` };
  return { ok: true, entry };
}

function checkQuote(entry: GateEntry, quote: string): Check {
  const q = canon(quote);
  if (q.length === 0) return { ok: false, status: 'refuted', reason: 'quote-empty' };
  // Two words, or one substantive word of five or more letters ("Nonsmoker"). Never "the" or "PT".
  const words = q.split(' ').filter(w => /[a-z0-9]/.test(w));
  const substantive = words.length === 1 && /^[a-z]{5,}$/.test(words[0]!);
  if (words.length < 2 && !substantive) return { ok: false, status: 'refuted', reason: 'quote-too-short: a quote must be at least two words, or one substantive word' };
  if (!canon(entry.text).includes(q)) return { ok: false, status: 'refuted', reason: `quote-not-in-entry: the quote does not appear verbatim in ${entry.id}` };
  return { ok: true };
}

function checkHardTokens(text: string, allowed: Set<string>): Check {
  const missing = [...sentenceHardTokens(text)].filter(t => !allowed.has(t));
  if (missing.length > 0) return { ok: false, status: 'refuted', reason: `unsourced-token: ${missing.join(', ')}`, missing };
  return { ok: true };
}

// The smallest set of other entries that, together, source every missing
// token: each token is matched to the first entry (in chart order) that holds
// it. Null when any token is in no entry at all.
function sourcedElsewhere(chart: GateEntry[], citedId: string, missing: string[]): string[] | null {
  const found: string[] = [];
  const tokensOf = new Map<string, Set<string>>();
  for (const token of missing) {
    let holder: string | null = null;
    for (const entry of chart) {
      if (entry.id === citedId) continue;
      let set = tokensOf.get(entry.id);
      if (!set) {
        set = new Set<string>();
        // An entry that cannot be read is skipped here, never thrown: the
        // cited entry's own check already decided this sentence's status.
        try {
          sourceTokens(entry.text, set);
          if (entry.date) sourceTokens(entry.date, set);
        } catch {
          set = new Set<string>();
        }
        tokensOf.set(entry.id, set);
      }
      if (set.has(token)) { holder = entry.id; break; }
    }
    if (holder === null) return null;
    if (!found.includes(holder)) found.push(holder);
  }
  return found;
}

// --- the gate ----------------------------------------------------------------

export function litmus(sources: GateSources, appeal: Appeal): GateResult {
  const inputHash = createHash('sha256')
    .update(JSON.stringify({ chart: sources.chart, criteria: sources.criteria, denial: sources.denial, facts: sources.facts ?? [], appeal }))
    .digest('hex');

  const shared = new Set<string>();
  for (const c of sources.criteria) sourceTokens(c.text, shared);
  for (const d of sources.denial) sourceTokens(d, shared);
  for (const x of sources.facts ?? []) sourceTokens(x, shared);
  const criterionIds = new Set(sources.criteria.map(c => c.id));

  const sentences: SentenceRecord[] = appeal.sentences.map((s, index) => {
    const base: SentenceBase = { index, text: s.text, citation: s.citation, quote: s.quote, reason: '' };
    try {
      const r = resolve(sources.chart, s.citation);
      if (!r.ok) return { ...base, status: r.status, reason: r.reason };
      const q = checkQuote(r.entry, s.quote);
      if (!q.ok) return { ...base, status: q.status, reason: q.reason };
      const allowed = new Set(shared);
      sourceTokens(r.entry.text, allowed);
      if (r.entry.date) sourceTokens(r.entry.date, allowed);
      const h = checkHardTokens(s.text, allowed);
      if (!h.ok) {
        const elsewhere = h.missing ? sourcedElsewhere(sources.chart, r.entry.id, h.missing) : null;
        if (elsewhere) return { ...base, status: 'needs-citation', reason: `needs-citation: ${h.missing!.join(', ')} not in ${r.entry.id}; the chart has it in ${elsewhere.join(', ')}. If that entry is the source, cite it as well; if it is a count or figure the chart never states, rewrite the sentence`, missing: h.missing!, alsoCite: elsewhere };
        return { ...base, status: h.status, reason: h.reason, ...(h.missing ? { missing: h.missing } : {}) };
      }
      return { ...base, status: 'verified', reason: 'verified: quote found in the cited entry; every hard token sourced from the entry, the criteria, the denial, or the case facts', [VERIFIED]: true };
    } catch (error: unknown) {
      return { ...base, status: 'error', reason: `error: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  const evidence: EvidenceRecord[] = appeal.evidence.map((e, index) => {
    const base: EvidenceBase = { index, criterion: e.criterion, citation: e.citation, quote: e.quote, reason: '' };
    try {
      if (!criterionIds.has(e.criterion)) return { ...base, status: 'unresolved', reason: `criterion-unknown: ${e.criterion.slice(0, 40) || '(empty)'}` };
      const r = resolve(sources.chart, e.citation);
      if (!r.ok) return { ...base, status: r.status, reason: r.reason };
      const q = checkQuote(r.entry, e.quote);
      if (!q.ok) return { ...base, status: q.status, reason: q.reason };
      return { ...base, status: 'verified', reason: 'verified: quote found in the cited entry', [VERIFIED]: true };
    } catch (error: unknown) {
      return { ...base, status: 'error', reason: `error: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  const criteria: Record<string, 'verified' | 'unverified'> = {};
  for (const c of sources.criteria) criteria[c.id] = evidence.some(e => e.status === 'verified' && e.criterion === c.id) ? 'verified' : 'unverified';

  const tally = (status: SentenceStatus) => sentences.filter(s => s.status === status).length;
  const counts = {
    sentences: sentences.length,
    verified: tally('verified'),
    unresolved: tally('unresolved'),
    refuted: tally('refuted'),
    needsCitation: tally('needs-citation'),
    error: tally('error'),
    evidence: evidence.length,
    evidenceVerified: evidence.filter(e => e.status === 'verified').length,
  };
  const errored = sentences.some(s => s.status === 'error') || evidence.some(e => e.status === 'error');

  if (!appeal.warranted) {
    return { litmus: LITMUS_VERSION, verdict: 'declined', reasons: [], errored, declinedReason: appeal.reason ?? 'no reason given', sentences, evidence, criteria, counts, inputHash };
  }

  const reasons: string[] = [];
  if (sentences.length === 0) reasons.push('no cited sentences: a warranted draft with nothing to verify is blocked');
  for (const c of sources.criteria) if (criteria[c.id] === 'unverified') reasons.push(`criterion ${c.id} has no verified evidence`);
  for (const s of sentences) if (s.status !== 'verified') reasons.push(`sentence ${s.index} ${s.status}: ${s.reason}`);
  for (const e of evidence) if (e.status === 'error') reasons.push(`evidence ${e.index} error: ${e.reason}`);

  return { litmus: LITMUS_VERSION, verdict: reasons.length > 0 ? 'blocked' : 'pass', reasons, errored, sentences, evidence, criteria, counts, inputHash };
}
