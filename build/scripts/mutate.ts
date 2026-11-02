// Mutation test of the gate. The nine kept runs hold about 2,200 sentences the
// gate verified and none it refuted, because no model fabricated anything. So
// the only way to measure what the gate catches is to inject fabrications into
// sentences it has already verified and count what gets through.
//
// Three classes, reported separately:
//   hard       a fact the gate is built to check is corrupted: a number replaced
//              by a value absent from every admissible source, a date shifted,
//              a side swapped, a side added that the cited entry carries only
//              inside an idiom ("right back to baseline"; Oct 31), a citation
//              moved to an entry that lacks the quote, a word dropped from the
//              quote; and, from Nov 2 (gate v1.6, after the Muse Code review),
//              a count rewritten as the word one or zero, a date rewritten with
//              a month name and the month moved, a side swapped and written as
//              R or L, the letter of a code changed, the system word before a
//              code swapped, a wrong number written in fullwidth digits. Every
//              pass here is a gate defect.
//   collision  a wrong number or side that happens to appear in the criteria,
//              the denial, the case facts, or elsewhere in the cited entry. The
//              gate checks presence, not correspondence, so these pass by design;
//              the count is the size of that gap.
//   soft       a corruption with no hard token in it: a negation flipped, a
//              pronoun swapped. The gate is not built to see these; the count is
//              the referential limit with a number on it.
//
// Nothing here changes the gate. It is a measurement.
//
//   npm run mutate -- [--seed 2026] [--out results/mutations/report.json]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { litmus, LITMUS_VERSION, type GateEntry, type GateSources, type SentenceStatus } from '../src/litmus.js';
import { gateSources, loadCases, type CaseResult } from '../src/harness.js';
import { Rng, addDays } from '../src/synthetic/rng.js';

export type MutationKind =
  | 'number-absent'
  | 'date-shift'
  | 'laterality-swap'
  | 'laterality-idiom-leak'
  | 'count-word'
  | 'month-name-date'
  | 'laterality-abbreviation'
  | 'code-letter'
  | 'code-system'
  | 'fullwidth-digits'
  | 'citation-moved'
  | 'quote-word-dropped'
  | 'number-collision'
  | 'laterality-collision'
  | 'negation-flip'
  | 'pronoun-swap';
export type MutationClass = 'hard' | 'collision' | 'soft';
export interface Sentence { text: string; citation: string; quote: string }
export interface Mutation { kind: MutationKind; class: MutationClass; sentence: Sentence; note: string }
export interface MutationRecord { kind: MutationKind; class: MutationClass; status: SentenceStatus }

export const CLASS_OF: Record<MutationKind, MutationClass> = {
  'number-absent': 'hard',
  'date-shift': 'hard',
  'laterality-swap': 'hard',
  'laterality-idiom-leak': 'hard',
  'count-word': 'hard',
  'month-name-date': 'hard',
  'laterality-abbreviation': 'hard',
  'code-letter': 'hard',
  'code-system': 'hard',
  'fullwidth-digits': 'hard',
  'citation-moved': 'hard',
  'quote-word-dropped': 'hard',
  'number-collision': 'collision',
  'laterality-collision': 'collision',
  'negation-flip': 'soft',
  'pronoun-swap': 'soft',
};

// --- the gate's view of text, mirrored so a candidate's absence is judged the way the gate judges it

function canon(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, dozen: 12, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const WORD_FOR: Record<number, string> = Object.fromEntries(Object.entries(NUMBER_WORDS).map(([w, n]) => [n, w]));
const NUMBER_WORD_RE = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'g');
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
// A standalone number: not glued to letters (J9271), ids (note-003), decimals handled whole.
const STANDALONE_NUMBER_RE = /(?<![A-Za-z0-9.\-/])(\d+(?:\.\d+)?)(?![A-Za-z0-9.\-/]*[A-Za-z0-9])/g;

function strip(n: string): string {
  return n.replace(/^0+(?=\d)/, '');
}

const MONTHS: Record<string, string> = { jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12' };
const MONTH_NAME: string[] = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MDY_RE = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\.? (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{4})\\b`, 'g');
const ONE_IDIOM_RE = /\b(?:no|any|each|every|some|this|that|which|another|other|same|either|neither) one\b|\bone (?:of|another|way|hand|thing|point)\b/g;

// The gate's admissible numbers and dates of a text (v1.6): every date in one
// form (yyyy-mm-dd, yyyy-mm, mm-dd) plus its year; the day and the month are
// not bare numbers; thousands separators folded; one and zero are numbers.
function digitTokens(text: string): Set<string> {
  let t = canon(text).replace(ONE_IDIOM_RE, m => ' '.repeat(m.length)).replace(NUMBER_WORD_RE, w => String(NUMBER_WORDS[w]));
  while (/\d,\d{3}\b/.test(t)) t = t.replace(/(\d),(\d{3})\b/g, '$1$2');
  const out = new Set<string>();
  const full = (y: string, m: string, d: string): string => { out.add(`${y}-${m}-${d}`); out.add(`${y}-${m}`); out.add(`${m}-${d}`); out.add(y); return ' '; };
  t = t
    .replace(ISO_DATE_RE, (_, y: string, m: string, d: string) => full(y, m, d))
    .replace(SLASH_DATE_RE, (_, m: string, d: string, y: string) => full(y.length === 2 ? `20${y}` : y, m.padStart(2, '0'), d.padStart(2, '0')))
    .replace(MDY_RE, (_, mo: string, d: string, y: string) => full(y, MONTHS[mo]!, d.padStart(2, '0')));
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.add(strip(m[0]));
  return out;
}

// "right back to baseline" and "left the clinic" are not sides, in a sentence
// or in a source (gate v1.5). The idioms are masked with spaces of the same
// length so offsets survive.
const SIDE_IDIOM_RE = /\bright\s+(?:back|away|now|after|before|here|there|then|to|at)\b|\bleft\s+(?:the|a|an|against|behind|over|off|out|in|to|for|at|on|with|without|home|early|before|after|us|him|her|them|it|from)\b/gi;

const NOT_A_SIDE_RE = /\br\/o\b|\b\d+(?:\.\d+)?l\b|\b\d+(?:\.\d+)? l(?= (?:of|per|nc|o2|fluids?|saline|bolus|lactated|normal|ns|iv|over)\b|\/)|\/l\b|\bl\/(?:min|hr|h|day)\b|\brt (?:planning|therapy|dose|doses|dosimetry|simulation|field|fields|course|session|sessions|boost|fraction|fractions|completed|started|began|delivered|plan)\b|\b(?:radiation|respiratory|external beam|beam|adjuvant|palliative|definitive) rt\b/g;
const SIDE_OF: Record<string, string> = { left: 'left', l: 'left', lt: 'left', right: 'right', r: 'right', rt: 'right' };
function sideTokens(text: string): Set<string> {
  const out = new Set<string>();
  const masked = canon(text).replace(SIDE_IDIOM_RE, m => ' '.repeat(m.length)).replace(NOT_A_SIDE_RE, m => ' '.repeat(m.length));
  for (const m of masked.matchAll(/\b(left|right|l|r|lt|rt)\b/g)) out.add(SIDE_OF[m[1]!]!);
  return out;
}

// The side words a text carries only inside an idiom.
function idiomSides(text: string): string[] {
  const out: string[] = [];
  for (const m of canon(text).matchAll(SIDE_IDIOM_RE)) {
    const w = m[0].split(/\s+/)[0]!;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

interface Admissible { entry: Set<string>; shared: Set<string>; all: Set<string>; chartWide: Set<string>; sidesEntry: Set<string>; sidesShared: Set<string> }

function admissible(sources: GateSources, entry: GateEntry): Admissible {
  const entryTokens = digitTokens(entry.text);
  if (entry.date) for (const t of digitTokens(entry.date)) entryTokens.add(t);
  const shared = new Set<string>();
  for (const c of sources.criteria) for (const t of digitTokens(c.text)) shared.add(t);
  for (const d of sources.denial) for (const t of digitTokens(d)) shared.add(t);
  for (const f of sources.facts ?? []) for (const t of digitTokens(f)) shared.add(t);
  for (const txt of [entry.text, ...sources.criteria.map(c => c.text), ...sources.denial, ...(sources.facts ?? [])]) {
    for (const m of canon(txt).matchAll(/\b(cpt|hcpcs)\b(?: codes?)?:?[ -]?(\d{5})\b/g)) (txt === entry.text ? entryTokens : shared).add(`${m[1]}:${m[2]}`);
  }
  const all = new Set([...entryTokens, ...shared]);
  const chartWide = new Set(all);
  for (const e of sources.chart) {
    for (const t of digitTokens(e.text)) chartWide.add(t);
    for (const m of canon(e.text).matchAll(/\b[a-z]\d{2}(?:\.\d+)?\b|\b[a-z]\d{4}\b/g)) chartWide.add(m[0]);
    if (e.date) for (const t of digitTokens(e.date)) chartWide.add(t);
  }
  const sidesEntry = sideTokens(entry.text);
  const sidesShared = new Set<string>();
  for (const c of sources.criteria) for (const t of sideTokens(c.text)) sidesShared.add(t);
  for (const d of sources.denial) for (const t of sideTokens(d)) sidesShared.add(t);
  for (const f of sources.facts ?? []) for (const t of sideTokens(f)) sidesShared.add(t);
  return { entry: entryTokens, shared, all, chartWide, sidesEntry, sidesShared };
}

// --- finding what a sentence carries

interface NumberSpot { start: number; end: number; raw: string; value: number; word: boolean }

const MONTH_DAY_RE = new RegExp(`\\b(?:${Object.keys(MONTHS).join('|')})\\.? \\d{1,2}(?:st|nd|rd|th)?(?:,? \\d{4})?\\b`, 'gi');
function maskDatesAndIds(text: string): string {
  // Same length, so offsets survive: dates (in any written form, v1.6) and ids become spaces.
  return text.replace(ISO_DATE_RE, m => ' '.repeat(m.length)).replace(SLASH_DATE_RE, m => ' '.repeat(m.length)).replace(MONTH_DAY_RE, m => ' '.repeat(m.length)).replace(/\b(note|crit)-\d+\b/g, m => ' '.repeat(m.length));
}

function numbersIn(text: string): NumberSpot[] {
  const masked = maskDatesAndIds(text);
  const out: NumberSpot[] = [];
  for (const m of masked.matchAll(STANDALONE_NUMBER_RE)) {
    out.push({ start: m.index!, end: m.index! + m[1]!.length, raw: text.slice(m.index!, m.index! + m[1]!.length), value: Number(m[1]), word: false });
  }
  for (const m of masked.matchAll(new RegExp(NUMBER_WORD_RE.source, 'gi'))) {
    out.push({ start: m.index!, end: m.index! + m[0].length, raw: text.slice(m.index!, m.index! + m[0].length), value: NUMBER_WORDS[m[1]!.toLowerCase()]!, word: true });
  }
  return out.sort((a, b) => a.start - b.start);
}

function splice(text: string, spot: { start: number; end: number }, replacement: string): string {
  return text.slice(0, spot.start) + replacement + text.slice(spot.end);
}

function render(spot: NumberSpot, value: number): string {
  if (spot.word) {
    const w = WORD_FOR[value];
    if (!w) return String(value);
    return /^[A-Z]/.test(spot.raw) ? w[0]!.toUpperCase() + w.slice(1) : w;
  }
  // An integer is written as an integer: "2", not "2.0", which the gate would read as a different token.
  if (Number.isInteger(value)) return String(value);
  return spot.raw.includes('.') ? value.toFixed(spot.raw.split('.')[1]!.length) : String(value);
}

function matchCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) ? replacement[0]!.toUpperCase() + replacement.slice(1) : replacement;
}

// --- the mutations

function numberAbsent(s: Sentence, adm: Admissible, rng: Rng): Mutation | null {
  const spots = numbersIn(s.text);
  if (spots.length === 0) return null;
  const spot = rng.pick(spots);
  const base = Math.round(spot.value);
  const candidates = [base + 1, base - 1, base + 2, base + 3, base + 5, base + 7, base * 2 + 1, base + 11, base + 13, base + 17].filter(n => n > 0 && n !== base);
  const absentEverywhere = candidates.find(n => !adm.chartWide.has(String(n)) && (!spot.word || WORD_FOR[n] !== undefined));
  const absentFromAdmissible = candidates.find(n => !adm.all.has(String(n)) && (!spot.word || WORD_FOR[n] !== undefined));
  const value = absentEverywhere ?? absentFromAdmissible;
  if (value === undefined) return null;
  const text = splice(s.text, spot, render(spot, value));
  return { kind: 'number-absent', class: 'hard', sentence: { ...s, text }, note: `${spot.raw} -> ${render(spot, value)}${absentEverywhere === undefined ? ' (present in another entry)' : ''}` };
}

function numberCollision(s: Sentence, adm: Admissible, rng: Rng): Mutation | null {
  const spots = numbersIn(s.text).filter(sp => !sp.word || true);
  if (spots.length === 0) return null;
  const pool = [...adm.shared].filter(t => /^\d+$/.test(t) && !adm.entry.has(t)).map(Number).filter(n => n > 0).sort((a, b) => a - b);
  if (pool.length === 0) return null;
  const spot = rng.pick(spots);
  const choices = pool.filter(n => n !== Math.round(spot.value) && (!spot.word || WORD_FOR[n] !== undefined));
  if (choices.length === 0) return null;
  const value = rng.pick(choices);
  const text = splice(s.text, spot, render(spot, value));
  return { kind: 'number-collision', class: 'collision', sentence: { ...s, text }, note: `${spot.raw} -> ${render(spot, value)} (present in the criteria, denial, or case facts, absent from the entry)` };
}

function dateShift(s: Sentence, adm: Admissible): Mutation | null {
  const iso = [...s.text.matchAll(ISO_DATE_RE)];
  if (iso.length > 0) {
    const m = iso[0]!;
    for (const days of [1, -1, 2, -2]) {
      const shifted = addDays(m[0], days);
      if (!adm.all.has(shifted)) {
        return { kind: 'date-shift', class: 'hard', sentence: { ...s, text: s.text.replace(m[0], shifted) }, note: `${m[0]} -> ${shifted}` };
      }
    }
    return null;
  }
  const slash = [...s.text.matchAll(SLASH_DATE_RE)];
  if (slash.length > 0) {
    const m = slash[0]!;
    const day = Number(m[2]);
    for (const delta of [1, -1]) {
      const d = day + delta;
      if (d < 1 || d > 28) continue;
      const shifted = `${m[1]}/${d}/${m[3]}`;
      if (!adm.all.has(shifted)) return { kind: 'date-shift', class: 'hard', sentence: { ...s, text: s.text.replace(m[0], shifted) }, note: `${m[0]} -> ${shifted}` };
    }
  }
  return null;
}

function sideSpots(text: string): { start: number; end: number; word: string }[] {
  const masked = text.replace(SIDE_IDIOM_RE, m => ' '.repeat(m.length));
  return [...masked.matchAll(/\b(left|right)\b/gi)].map(m => ({ start: m.index!, end: m.index! + m[0].length, word: m[0] }));
}

function lateralitySwap(s: Sentence, adm: Admissible): Mutation | null {
  const spots = sideSpots(s.text);
  if (spots.length === 0) return null;
  let text = s.text;
  for (const sp of [...spots].reverse()) text = splice(text, sp, matchCase(sp.word, sp.word.toLowerCase() === 'left' ? 'right' : 'left'));
  const sides = new Set(spots.map(sp => sp.word.toLowerCase()));
  const swappedIn = [...sides].map(w => (w === 'left' ? 'right' : 'left'));
  const present = swappedIn.some(w => adm.sidesEntry.has(w) || adm.sidesShared.has(w));
  const kind: MutationKind = present ? 'laterality-collision' : 'laterality-swap';
  return { kind, class: CLASS_OF[kind], sentence: { ...s, text }, note: `${[...sides].join('/')} -> ${swappedIn.join('/')}${present ? ' (the other side already appears in the entry, criteria, denial, or facts)' : ''}` };
}

// The idiom leak (Oct 31, found in review): a side the cited entry carries only
// inside an idiom is added to a sentence that named none. Under gate v1.4 the
// entry's idiom made the word admissible and the sentence was verified. Only
// attempted where the word is a side nowhere in the entry, the criteria, the
// denial, or the facts, so a pass is the leak and nothing else.
function lateralityIdiomLeak(s: Sentence, entry: GateEntry, adm: Admissible): Mutation | null {
  if (sideSpots(s.text).length > 0) return null;
  const leaked = idiomSides(entry.text).find(w => !adm.sidesEntry.has(w) && !adm.sidesShared.has(w));
  if (!leaked) return null;
  const text = s.text.endsWith('.') ? `${s.text.slice(0, -1)} on the ${leaked} side.` : `${s.text} on the ${leaked} side`;
  return { kind: 'laterality-idiom-leak', class: 'hard', sentence: { ...s, text }, note: `"${leaked}" added; the entry has the word only in an idiom` };
}

// --- the v1.6 classes (Nov 2, after the Muse Code review) ----------------------

// A count rewritten as the word "one" (or "zero"): absent everywhere, so a
// pass means the word was not read as a number.
function countWord(s: Sentence, adm: Admissible): Mutation | null {
  const spot = numbersIn(s.text).find(sp => Number.isInteger(sp.value) && sp.value >= 2 && !sp.word);
  if (!spot) return null;
  for (const [n, w] of [[1, 'one'], [0, 'zero']] as const) {
    if (adm.chartWide.has(String(n))) continue;
    const text = splice(s.text, spot, w);
    return { kind: 'count-word', class: 'hard', sentence: { ...s, text }, note: `${spot.raw} -> ${w}` };
  }
  return null;
}

// An ISO or slash date rewritten with a month name, the month moved by one to
// three months, to a date no source carries in any form.
function monthNameDate(s: Sentence, adm: Admissible): Mutation | null {
  const m = [...s.text.matchAll(ISO_DATE_RE)][0] ?? null;
  const sl = m ? null : ([...s.text.matchAll(SLASH_DATE_RE)][0] ?? null);
  if (!m && !sl) return null;
  const y = m ? m[1]! : (sl![3]!.length === 2 ? `20${sl![3]}` : sl![3]!);
  const mo = Number(m ? m[2] : sl![1]);
  const d = Number(m ? m[3] : sl![2]);
  for (const delta of [1, -1, 2, -2, 3]) {
    const nm = ((mo - 1 + delta + 12) % 12) + 1;
    const iso = `${y}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (adm.all.has(iso) || adm.all.has(`${y}-${String(nm).padStart(2, '0')}`)) continue;
    const written = `${MONTH_NAME[nm - 1]} ${d}, ${y}`;
    return { kind: 'month-name-date', class: 'hard', sentence: { ...s, text: s.text.replace((m ?? sl!)[0], written) }, note: `${(m ?? sl!)[0]} -> ${written}` };
  }
  return null;
}

// A side swapped and written as its abbreviation (R, L).
function lateralityAbbreviation(s: Sentence, adm: Admissible): Mutation | null {
  const spots = sideSpots(s.text);
  if (spots.length === 0) return null;
  const sides = new Set(spots.map(sp => sp.word.toLowerCase()));
  const swappedIn = [...sides].map(w => (w === 'left' ? 'right' : 'left'));
  if (swappedIn.some(w => adm.sidesEntry.has(w) || adm.sidesShared.has(w))) return null;
  let text = s.text;
  for (const sp of [...spots].reverse()) text = splice(text, sp, sp.word.toLowerCase() === 'left' ? 'R' : 'L');
  return { kind: 'laterality-abbreviation', class: 'hard', sentence: { ...s, text }, note: `${[...sides].join('/')} -> ${swappedIn.map(w => (w === 'left' ? 'L' : 'R')).join('/')}` };
}

// The letter of an alphanumeric code changed (J9271 -> K9271), to a code no
// source carries.
function codeLetter(s: Sentence, adm: Admissible): Mutation | null {
  const m = /\b([A-Za-z])(\d{2}(?:\.\d+)?|\d{4})\b/.exec(s.text);
  if (!m) return null;
  const letter = m[1]!;
  const next = String.fromCharCode(letter.charCodeAt(0) + (letter.toLowerCase() === 'z' ? -1 : 1));
  const code = `${next}${m[2]}`;
  if (adm.chartWide.has(code.toLowerCase())) return null;
  const text = s.text.slice(0, m.index) + code + s.text.slice(m.index + m[0].length);
  return { kind: 'code-letter', class: 'hard', sentence: { ...s, text }, note: `${m[0]} -> ${code}` };
}

// The system word before a code swapped (CPT 19318 -> HCPCS 19318) where a
// source names the code under the written system, so the swap contradicts it.
function codeSystem(s: Sentence, adm: Admissible): Mutation | null {
  const m = /\b(CPT|HCPCS)\b(?: codes?)?:? ?(\d{5})\b/i.exec(s.text);
  if (!m) return null;
  const sys = m[1]!.toLowerCase();
  if (!adm.all.has(`${sys}:${m[2]}`)) return null;
  const other = sys === 'cpt' ? 'HCPCS' : 'CPT';
  if (adm.all.has(`${other.toLowerCase()}:${m[2]}`)) return null;
  const text = s.text.slice(0, m.index) + m[0].replace(m[1]!, other) + s.text.slice(m.index + m[0].length);
  return { kind: 'code-system', class: 'hard', sentence: { ...s, text }, note: `${m[1]} ${m[2]} -> ${other} ${m[2]}` };
}

// A wrong number written in fullwidth digits (U+FF10 to U+FF19).
function fullwidthDigits(s: Sentence, adm: Admissible): Mutation | null {
  const spot = numbersIn(s.text).find(sp => Number.isInteger(sp.value) && !sp.word);
  if (!spot) return null;
  const value = [spot.value + 1, spot.value + 3, spot.value + 7, spot.value * 2 + 1].find(n => !adm.chartWide.has(String(n)));
  if (value === undefined) return null;
  const wide = String(value).replace(/\d/g, d => String.fromCharCode(0xff10 + Number(d)));
  return { kind: 'fullwidth-digits', class: 'hard', sentence: { ...s, text: splice(s.text, spot, wide) }, note: `${spot.raw} -> ${wide}` };
}

function citationMoved(s: Sentence, sources: GateSources, rng: Rng): Mutation | null {
  const q = canon(s.quote);
  const others = sources.chart.filter(e => e.id !== s.citation && !canon(e.text).includes(q));
  if (others.length === 0) return null;
  const target = rng.pick(others);
  return { kind: 'citation-moved', class: 'hard', sentence: { ...s, citation: target.id }, note: `${s.citation} -> ${target.id}` };
}

function quoteWordDropped(s: Sentence, entry: GateEntry, rng: Rng): Mutation | null {
  const words = s.quote.split(' ');
  if (words.length < 3) return null;
  const entryText = canon(entry.text);
  for (const i of rng.shuffle(words.map((_, i) => i))) {
    const candidate = [...words.slice(0, i), ...words.slice(i + 1)].join(' ');
    if (entryText.includes(canon(candidate))) continue;
    const text = s.text.includes(s.quote) ? s.text.replace(s.quote, candidate) : s.text;
    return { kind: 'quote-word-dropped', class: 'hard', sentence: { ...s, text, quote: candidate }, note: `dropped "${words[i]}"` };
  }
  return null;
}

const NEGATION_FLIPS: [RegExp, string][] = [
  [/\bwithout\b/, 'with'],
  [/\bno further\b/, 'further'],
  [/\bnot\s+/, ''],
  [/\bimproved\b/, 'worsened'],
  [/\bimprovement\b/, 'decline'],
  [/\bexceeds\b/, 'falls short of'],
  [/\bexceeded\b/, 'fell short of'],
  [/\bexceeding\b/, 'falling short of'],
  [/\bmeets\b/, 'does not meet'],
  [/\bmet\b/, 'did not meet'],
  [/\bdocuments\b/, 'does not document'],
  [/\bdocumented\b/, 'never documented'],
  [/\bconfirms\b/, 'does not confirm'],
  [/\bconfirmed\b/, 'did not confirm'],
  [/\bshows\b/, 'does not show'],
  [/\bdemonstrates\b/, 'does not demonstrate'],
  [/\brequired\b/, 'did not require'],
  [/\brequires\b/, 'does not require'],
  [/\btolerated\b/, 'did not tolerate'],
  [/\bfailed\b/, 'succeeded with'],
  [/\b(is|was|were|has|had|does|did)\b(?!\s+not\b)/, '$1 not'],
  [/\bwith\b/, 'without'],
];

function negationFlip(s: Sentence): Mutation | null {
  for (const [re, rep] of NEGATION_FLIPS) {
    if (re.test(s.text)) {
      const text = s.text.replace(re, rep).replace(/\s{2,}/g, ' ');
      if (text === s.text) continue;
      return { kind: 'negation-flip', class: 'soft', sentence: { ...s, text }, note: `${re.source} -> "${rep}"` };
    }
  }
  return null;
}

const PRONOUNS: Record<string, string> = { he: 'she', she: 'he', his: 'her', her: 'his', him: 'her', himself: 'herself', herself: 'himself' };

function pronounSwap(s: Sentence): Mutation | null {
  const re = /\b(he|she|his|her|him|himself|herself)\b/gi;
  if (!re.test(s.text)) return null;
  const text = s.text.replace(re, w => matchCase(w, PRONOUNS[w.toLowerCase()]!));
  return { kind: 'pronoun-swap', class: 'soft', sentence: { ...s, text }, note: 'he/she, his/her, him/her swapped' };
}

export function mutateSentence(s: Sentence, sources: GateSources, rng: Rng): Mutation[] {
  const entry = sources.chart.find(e => e.id === s.citation);
  if (!entry) return [];
  const adm = admissible(sources, entry);
  const out: Mutation[] = [];
  const push = (m: Mutation | null) => { if (m) out.push(m); };
  push(numberAbsent(s, adm, rng));
  push(dateShift(s, adm));
  push(lateralitySwap(s, adm));
  push(lateralityIdiomLeak(s, entry, adm));
  push(countWord(s, adm));
  push(monthNameDate(s, adm));
  push(lateralityAbbreviation(s, adm));
  push(codeLetter(s, adm));
  push(codeSystem(s, adm));
  push(fullwidthDigits(s, adm));
  push(citationMoved(s, sources, rng));
  push(quoteWordDropped(s, entry, rng));
  push(numberCollision(s, adm, rng));
  push(negationFlip(s));
  push(pronounSwap(s));
  return out;
}

export function gateMutation(sources: GateSources, m: Mutation): { status: SentenceStatus; reason: string } {
  const r = litmus(sources, { warranted: true, evidence: [], sentences: [m.sentence] });
  const s = r.sentences[0]!;
  return { status: s.status, reason: s.reason };
}

export interface KindSummary { attempted: number; caught: number; passed: number; statuses: Partial<Record<SentenceStatus, number>> }
export interface ClassSummary { attempted: number; caught: number; passed: number }
export interface MutationSummary { byKind: Partial<Record<MutationKind, KindSummary>>; byClass: Record<MutationClass, ClassSummary> }

export function summarizeMutations(records: MutationRecord[]): MutationSummary {
  const byKind: Partial<Record<MutationKind, KindSummary>> = {};
  const byClass: Record<MutationClass, ClassSummary> = { hard: { attempted: 0, caught: 0, passed: 0 }, collision: { attempted: 0, caught: 0, passed: 0 }, soft: { attempted: 0, caught: 0, passed: 0 } };
  for (const r of records) {
    const k = (byKind[r.kind] ??= { attempted: 0, caught: 0, passed: 0, statuses: {} });
    const caught = r.status !== 'verified';
    k.attempted += 1;
    if (caught) k.caught += 1; else k.passed += 1;
    k.statuses[r.status] = (k.statuses[r.status] ?? 0) + 1;
    const c = byClass[r.class];
    c.attempted += 1;
    if (caught) c.caught += 1; else c.passed += 1;
  }
  return { byKind, byClass };
}

// --- the run over the kept results

interface ResultsFile { run: { model: string; provider: string; litmus?: string }; results: CaseResult[] }
interface FullRecord extends MutationRecord { file: string; caseId: string; sentence: number; note: string; reason: string; before: Sentence; after: Sentence }

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { seed: { type: 'string', default: '2026' }, out: { type: 'string' } } });
  const here = dirname(fileURLToPath(import.meta.url));
  const resultsDir = join(here, '..', 'results');
  const cases = new Map(loadCases(join(here, '..', 'synthetic', 'cases')).map(c => [c.id, c]));
  const files = readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort();
  const rng = new Rng(Number(values.seed));
  const records: FullRecord[] = [];
  let drafts = 0;
  let verified = 0;
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as ResultsFile;
    for (const r of parsed.results) {
      if (!r.gate || !r.draft) continue;
      const c = cases.get(r.caseId);
      if (!c) throw new Error(`case ${r.caseId} not found`);
      const sources = gateSources(c);
      drafts += 1;
      r.gate.sentences.forEach((s, index) => {
        if (s.status !== 'verified') return;
        verified += 1;
        const sentence = { text: s.text, citation: s.citation, quote: s.quote };
        for (const m of mutateSentence(sentence, sources, rng)) {
          const g = gateMutation(sources, m);
          records.push({ file, caseId: r.caseId, sentence: index, kind: m.kind, class: m.class, status: g.status, reason: g.reason, note: m.note, before: sentence, after: m.sentence });
        }
      });
    }
  }
  const summary = summarizeMutations(records);
  const misses = records.filter(r => r.class === 'hard' && r.status === 'verified');
  const collisionPasses = records.filter(r => r.class === 'collision' && r.status === 'verified');
  const softPasses = records.filter(r => r.class === 'soft' && r.status === 'verified');
  const example = (kind: MutationKind, status: 'verified' | 'caught') => records.find(r => r.kind === kind && (status === 'verified' ? r.status === 'verified' : r.status !== 'verified'));
  const report = {
    generatedAt: new Date().toISOString(),
    seed: Number(values.seed),
    gate: LITMUS_VERSION,
    corpus: { files, drafts, verifiedSentences: verified, mutations: records.length },
    summary,
    misses,
    collisionPasses,
    collisionCaughtSample: records.filter(r => r.class === 'collision' && r.status !== 'verified').slice(0, 15),
    softPassSample: softPasses.slice(0, 25),
    caughtExamples: (['number-absent', 'date-shift', 'laterality-swap', 'laterality-idiom-leak', 'citation-moved', 'quote-word-dropped'] as MutationKind[]).map(k => example(k, 'caught')).filter(Boolean),
  };
  const out = values.out ? values.out : join(resultsDir, 'mutations', 'report.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');

  const pct = (n: number, d: number) => (d === 0 ? '-' : `${((100 * n) / d).toFixed(1)}%`);
  console.log(`corpus: ${files.length} kept runs, ${drafts} gated drafts, ${verified} verified sentences, ${records.length} mutations; seed ${values.seed}; ${LITMUS_VERSION.split(':')[0]}`);
  console.log('');
  console.log(`${'kind'.padEnd(22)} ${'class'.padEnd(10)} ${'attempted'.padStart(9)} ${'caught'.padStart(7)} ${'passed'.padStart(7)}  caught%  statuses`);
  for (const [kind, k] of Object.entries(summary.byKind)) {
    console.log(`${kind.padEnd(22)} ${CLASS_OF[kind as MutationKind].padEnd(10)} ${String(k!.attempted).padStart(9)} ${String(k!.caught).padStart(7)} ${String(k!.passed).padStart(7)}  ${pct(k!.caught, k!.attempted).padStart(6)}  ${Object.entries(k!.statuses).map(([s, n]) => `${s} ${n}`).join(', ')}`);
  }
  console.log('');
  for (const [cls, c] of Object.entries(summary.byClass)) console.log(`${cls.padEnd(10)} attempted ${c.attempted}, caught ${c.caught} (${pct(c.caught, c.attempted)}), passed ${c.passed}`);
  console.log('');
  console.log(`hard-class misses (gate defects if any): ${misses.length}`);
  for (const m of misses.slice(0, 40)) console.log(`  ${m.file.slice(0, 30)} ${m.caseId} s${m.sentence} ${m.kind} ${m.note}\n    before: ${m.before.text}\n    after:  ${m.after.text}`);
  console.log(`wrote ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error));
    process.exit(1);
  });
}
