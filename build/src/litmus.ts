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
//      quote glyphs, and dash variants normalized: curly quotes to straight,
//      en, em, and figure dashes and the minus sign to the ASCII hyphen,
//      compatibility forms such as fullwidth digits to their ASCII form;
//      nothing else). Absent, trivial, or made of stopwords alone: refuted.
//   3. Every hard token in the sentence (numbers, including ones written as
//      words; dates, in any written form; codes, with their letter and the
//      system named before them; and a side, however abbreviated) must appear
//      in the cited entry, the payer criteria,
//      the denial, or the stated case facts. Anything else: refuted, token named.
//      The whole cited entry counts, not only the quoted span: the gate exists
//      to catch invented facts, not to grade quoting form, and the clinician who
//      wrote the entry did not write it to a payer's vocabulary.
//   4. A check that throws is an error, never a refutation and never a pass.
// There is no resemblance threshold and no keyword list. The evidence is the
// clinician's own words, which no payer vocabulary can require.
import { sha256Hex } from './hash.js';
import { CITATION_ID } from './citation.js';
import type { Appeal } from './schema.js';

export const LITMUS_VERSION = 'build/src/litmus.ts v1.6 (2026-11-02): exact-quote referential gate from the LITMUS papers; compound number words read as one number; a sentence whose unsourced tokens all live in another chart entry is returned as needs-citation naming that entry, still blocked; a side is a hard token wherever it names a side, written left, right, L, R, Lt, or Rt, and a side a source carries only inside an idiom is not an admissible source; the words one and zero are counts; a date written with a month name is a date; the day and month of a date are not admissible as bare numbers; a thousands-separated figure is one number and digits outside ASCII are digits; the letter of an alphanumeric code and the code system named before a code are part of the code; a quote of stopwords alone and an empty sentence are refuted';

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
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90', hundred: '100', dozen: '12',
};
const NUMBER_WORD_RE = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'g');
// v1.6: "one" and "zero" are counts (found in review: "one week of therapy"
// against an entry that says twelve weeks was verified, because the word was
// not a number). The uses of "one" that are a pronoun or a determiner ("one of
// the entries", "no one", "this one") are masked first, on both sides of the
// check, the way side idioms are. The list is fixed and not exhaustive; "the
// one" is left as a count, because "the one month required" is one more often
// than "the one entry that" in this prose (the spike-in found the masked form
// passing a fabricated count).
const ONE_IDIOM = /\b(?:no|any|each|every|some|this|that|which|another|other|same|either|neither) one\b|\bone (?:of|another|way|hand|thing|point)\b/g;
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

function blank(m: string): string {
  return ' '.repeat(m.length);
}

function prepare(text: string): string {
  let t = canon(text)
    .replace(/\bnote-\d{3}\b/g, ' ')
    .replace(/\bcrit-\d+\b/g, ' ')
    .replace(HUNDREDS_RE, hundreds)
    .replace(COMPOUND_RE, (_, tens: string, ones: string) => String(Number(NUMBER_WORDS[tens]) + ONES_VALUE[ones]!))
    .replace(ONE_IDIOM, blank)
    .replace(NUMBER_WORD_RE, w => NUMBER_WORDS[w]!);
  // v1.6: "2,200 grams" is one number. Until Nov 2 it was read as 2 and 200,
  // and an entry that said "5 foot 2, 200 pounds" sourced a resection of 2,200 grams.
  while (/\d,\d{3}\b/.test(t)) t = t.replace(/(\d),(\d{3})\b/g, '$1$2');
  return t;
}

function stripZeros(n: string): string {
  return n.replace(/^0+(?=\d)/, '');
}

// --- dates -------------------------------------------------------------------
// v1.6: a date is a hard token in any written form, held in one form
// (yyyy-mm-dd; yyyy-mm for a month and year; mm-dd for a month and day), so
// "September 14, 2025" is checked against an entry dated 2025-08-14 and
// refuted (found in review: month names were not tokens, so only the day was
// checked, and it matched). Dates are blanked before the number pass, so the
// day and the month of a date are not admissible as bare numbers: an entry
// dated the 14th no longer sources "14 weeks". The year stays admissible.
const MONTHS: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04', may: '05',
  jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08', sep: '09', sept: '09', september: '09',
  oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
};
const MONTH = Object.keys(MONTHS).join('|');
const MONTH_NOT_MAY = Object.keys(MONTHS).filter(m => m !== 'may').join('|');
const ORD = '(?:st|nd|rd|th)?';
const MDY_RE = new RegExp(`\\b(${MONTH})\\.? (\\d{1,2})${ORD},? (\\d{4})\\b`, 'g');
const DMY_RE = new RegExp(`\\b(\\d{1,2})${ORD} (?:of )?(${MONTH})\\.?,? (\\d{4})\\b`, 'g');
const MY_RE = new RegExp(`\\b(${MONTH})\\.?,? (\\d{4})\\b`, 'g');
const MD_RE = new RegExp(`\\b(${MONTH_NOT_MAY})\\.? (\\d{1,2})${ORD}\\b`, 'g'); // "may 3" is too often the verb
const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
const pad = (n: string): string => n.padStart(2, '0');
const year4 = (y: string): string => (y.length === 2 ? `20${y}` : y);

// Adds the dates of a text to the set and returns the text with every date
// blanked. A sentence contributes the form it wrote; a source contributes every
// form a sentence might write for the same date, and the year.
function dateTokens(t: string, into: Set<string>, source: boolean): string {
  const full = (y: string, m: string, d: string): string => {
    into.add(`${y}-${m}-${d}`);
    if (source) { into.add(`${y}-${m}`); into.add(`${m}-${d}`); into.add(y); }
    return '';
  };
  return t
    .replace(ISO_RE, (w, y: string, m: string, d: string) => { full(y, m, d); return blank(w); })
    .replace(SLASH_RE, (w, m: string, d: string, y: string) => { full(year4(y), pad(m), pad(d)); return blank(w); })
    .replace(MDY_RE, (w, mo: string, d: string, y: string) => { full(y, MONTHS[mo]!, pad(d)); return blank(w); })
    .replace(DMY_RE, (w, d: string, mo: string, y: string) => { full(y, MONTHS[mo]!, pad(d)); return blank(w); })
    .replace(MY_RE, (w, mo: string, y: string) => { into.add(`${y}-${MONTHS[mo]!}`); if (source) into.add(y); return blank(w); })
    .replace(MD_RE, (w, mo: string, d: string) => { into.add(`${MONTHS[mo]!}-${pad(d)}`); return blank(w); });
}

// --- sides -------------------------------------------------------------------
// v1.4: a side is a hard token wherever it names a side. v1.3 recognized a side
// only before a fixed list of anatomical words, and the mutation harness
// (scripts/mutate.ts, Oct 28) found 48 swapped sides passing in contexts outside
// that list: "left ventricle", "left forefoot ulcer", "right great toe extensor",
// "left total knee arthroplasty". The uses of left and right that are not sides
// ("left the clinic", "right back to baseline") are masked before the check.
// v1.5: the same mask applies to the sources. Until Oct 31 only the sentence
// was masked, so an entry that carried "right back to baseline" made the bare
// word admissible for every sentence citing it, and an invented right-sided
// claim citing such an entry was verified (found in review on case-006
// note-017; the shunt-direction pair "left to right" / "right to left" leaked
// the same way). The idiom list is fixed and not exhaustive; it is applied
// identically on both sides of the check.
// v1.6: a side written R, L, Rt, or Lt is a side (found in review: "the R
// knee" carried no side token at all). RT as radiation therapy, L as liters,
// and R/O as rule out are masked first, on both sides; liters only when the
// letter is attached to the number or followed by a unit word, so "grade 2 L
// forefoot" is a side (the spike-in found it masked).
const SIDE_IDIOM = /\bright (?:back|away|now|after|before|here|there|then|to|at)\b|\bleft (?:the|a|an|against|behind|over|off|out|in|to|for|at|on|with|without|home|early|before|after|us|him|her|them|it|from)\b/g;
const NOT_A_SIDE = /\br\/o\b|\b\d+(?:\.\d+)?l\b|\b\d+(?:\.\d+)? l(?= (?:of|per|nc|o2|fluids?|saline|bolus|lactated|normal|ns|iv|over)\b|\/)|\/l\b|\bl\/(?:min|hr|h|day)\b|\brt (?:planning|therapy|dose|doses|dosimetry|simulation|field|fields|course|session|sessions|boost|fraction|fractions|completed|started|began|delivered|plan)\b|\b(?:radiation|respiratory|external beam|beam|adjuvant|palliative|definitive) rt\b/g;
const SIDE_RE = /\b(left|right|l|r|lt|rt)\b/g;
const SIDE_OF: Record<string, 'left' | 'right'> = { left: 'left', l: 'left', lt: 'left', right: 'right', r: 'right', rt: 'right' };
function sideTokens(t: string, into: Set<string>): void {
  for (const m of t.replace(SIDE_IDIOM, blank).replace(NOT_A_SIDE, blank).matchAll(SIDE_RE)) into.add(SIDE_OF[m[1]!]!);
  if (/\bbilat(?:eral(?:ly)?)?\b|\bb\/l\b/.test(t)) into.add('bilateral');
}

// --- codes -------------------------------------------------------------------
// A code with a letter (ICD-10 C34.90, HCPCS J9271) is one token, letter and
// all; v1.6 adds the letter-and-four-digit form (found in review: K9271
// verified against an entry that said J9271, because only the digits were
// compared). A code system named before a code (CPT 19318, HCPCS 19318) is
// part of the claim: the sentence's "system:code" must match a source that
// names the same system for that code. A code no source labels is not graded
// on its label, so an unlabeled entry never refuses a labeled sentence.
const CODE_RE = /\b[a-z]\d{2}(?:\.\d+)?\b|\b[a-z]\d{4}\b/g;
const SYSTEM_RE = /\b(cpt|hcpcs|icd(?:-?10(?:-?cm)?)?|carc|rarc|ndc|ms-drg|drg|loinc)\b(?: codes?)?:?[ -]?([a-z]?\d{2,5}(?:\.\d+)?)\b/g;
function systemOf(s: string): string {
  return s.startsWith('icd') ? 'icd' : s;
}

// Hard tokens of a sentence: the facts that must have an admissible source.
function sentenceHardTokens(text: string): Set<string> {
  const out = new Set<string>();
  const t = dateTokens(prepare(text), out, false);
  for (const m of t.matchAll(SYSTEM_RE)) out.add(`${systemOf(m[1]!)}:${m[2]!}`);
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.add(stripZeros(m[0]));
  for (const m of t.matchAll(CODE_RE)) out.add(m[0]);
  sideTokens(t, out);
  out.delete('');
  return out;
}

// Admissible tokens of a source: everything a sentence may legitimately carry.
function sourceTokens(text: string, into: Set<string>): void {
  const t = dateTokens(prepare(text), into, true);
  for (const m of t.matchAll(SYSTEM_RE)) { into.add(`${systemOf(m[1]!)}:${m[2]!}`); into.add(`coded:${m[2]!}`); }
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) into.add(stripZeros(m[0]));
  for (const m of t.matchAll(CODE_RE)) into.add(m[0]);
  sideTokens(t, into);
}

// --- the checks --------------------------------------------------------------

type Check = { ok: true } | { ok: false; status: 'unresolved' | 'refuted'; reason: string; missing?: string[] };

function resolve(chart: GateEntry[], citation: string): { ok: true; entry: GateEntry } | { ok: false; status: 'unresolved'; reason: string } {
  if (!CITATION_ID.test(citation)) return { ok: false, status: 'unresolved', reason: `citation-malformed: ${citation.slice(0, 40) || '(empty)'}` };
  const entry = chart.find(e => e.id === citation);
  if (!entry) return { ok: false, status: 'unresolved', reason: `citation-unknown: ${citation}` };
  return { ok: true, entry };
}

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'is', 'was', 'were', 'be', 'been', 'by', 'with', 'as', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they', 'his', 'her', 'their', 'has', 'have', 'had', 'not', 'no', 'from', 'if', 'so', 'than', 'then', 'there', 'which', 'who', 'we', 'you', 'i', 'my', 'our', 'your', 'are', 'am', 'do', 'did', 'does', 'will', 'would', 'can', 'could', 'may', 'might', 'shall', 'should']);

function checkQuote(entry: GateEntry, quote: string): Check {
  const q = canon(quote);
  if (q.length === 0) return { ok: false, status: 'refuted', reason: 'quote-empty' };
  // Two words, or one substantive word of five or more letters ("Nonsmoker"). Never "the" or "PT".
  const words = q.split(' ').filter(w => /[a-z0-9]/.test(w));
  const substantive = words.length === 1 && /^[a-z]{5,}$/.test(words[0]!);
  if (words.length < 2 && !substantive) return { ok: false, status: 'refuted', reason: 'quote-too-short: a quote must be at least two words, or one substantive word' };
  // v1.6: "of the" is two words and appears in every entry; it is not a quote.
  if (!words.some(w => !STOPWORDS.has(w))) return { ok: false, status: 'refuted', reason: 'quote-trivial: a quote must carry at least one word that is not a stopword' };
  if (!canon(entry.text).includes(q)) return { ok: false, status: 'refuted', reason: `quote-not-in-entry: the quote does not appear verbatim in ${entry.id}` };
  return { ok: true };
}

function checkHardTokens(text: string, allowed: Set<string>): Check {
  const missing = [...sentenceHardTokens(text)].filter(t => {
    if (allowed.has(t)) return false;
    const labeled = /^([a-z-]+):(.+)$/.exec(t);
    // A labeled code is wrong only when a source labels the same code otherwise.
    if (labeled) return allowed.has(`coded:${labeled[2]!}`);
    return true;
  });
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

// Tokens every sentence of a case may carry: from the payer criteria, the
// denial, and the stated case facts. The cited entry's own tokens are added
// per sentence.
function sharedTokens(sources: GateSources): Set<string> {
  const shared = new Set<string>();
  for (const c of sources.criteria) sourceTokens(c.text, shared);
  for (const d of sources.denial) sourceTokens(d, shared);
  for (const x of sources.facts ?? []) sourceTokens(x, shared);
  return shared;
}

export interface SentenceInput { text: string; citation: string; quote: string }

// One sentence through the gate. This is the function litmus() applies to each
// sentence of a draft; it is exported so the viewer can re-check a sentence a
// reader has edited, in the browser, with the same code and the same sources
// (viewer/src/gatecheck.ts). The optional shared set lets litmus() compute the
// case-level tokens once per draft.
export function checkSentence(sources: GateSources, s: SentenceInput, index = 0, shared: Set<string> = sharedTokens(sources)): SentenceRecord {
  const base: SentenceBase = { index, text: s.text, citation: s.citation, quote: s.quote, reason: '' };
  try {
    if (!/[a-z0-9]/.test(canon(s.text))) return { ...base, status: 'refuted', reason: 'sentence-empty: nothing to verify' };
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
}

export function litmus(sources: GateSources, appeal: Appeal): GateResult {
  const inputHash = sha256Hex(JSON.stringify({ chart: sources.chart, criteria: sources.criteria, denial: sources.denial, facts: sources.facts ?? [], appeal }));

  const shared = sharedTokens(sources);
  const criterionIds = new Set(sources.criteria.map(c => c.id));

  const sentences: SentenceRecord[] = appeal.sentences.map((s, index) => checkSentence(sources, s, index, shared));

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
