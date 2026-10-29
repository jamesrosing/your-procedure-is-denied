import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { litmus, type GateSources } from '../src/litmus.js';
import { Rng } from '../src/synthetic/rng.js';
import { gateMutation, mutateSentence, summarizeMutations, type Mutation, type MutationRecord } from '../scripts/mutate.js';

// A small chart in the project's own fixture style. note-001 names the left
// side only; note-002 carries a non-anatomical "right" ("right back to baseline")
// so a laterality swap on note-001 is sourced elsewhere, which the gate reports
// as needs-citation: still blocked, still caught.
const chart = [
  { id: 'note-001', date: '2025-06-26', kind: 'office visit', text: '49 year old woman here about her left breast pain for 17 months. Schnur 22nd percentile at that BSA is about 620 grams. I am estimating 690 grams per side.' },
  { id: 'note-002', date: '2025-08-14', kind: 'physical therapy', text: 'Finished 12 weeks of PT across the street, says it helped while she was there and then right back to baseline.' },
  { id: 'note-003', date: '2025-09-01', kind: 'office visit', text: 'Blood pressure check. 128 over 82 today. Keep the dose, recheck in 8 weeks.' },
];
const sources: GateSources = {
  chart,
  criteria: [
    { id: 'crit-1', text: 'Symptoms documented for at least 6 months.' },
    { id: 'crit-2', text: 'At least 3 months of conservative treatment without adequate relief.' },
  ],
  denial: ['Northwind denied CPT 19318 with date of service 2026-03-14. CARC 50.'],
  facts: ['SYN-049, 49 year old woman'],
};

const PT = { text: 'The patient completed 12 weeks of physical therapy without lasting relief, as documented on 2025-08-14; she said it helped while there.', citation: 'note-002', quote: 'Finished 12 weeks of PT across the street' };
const SIDE = { text: 'The pain is in the left breast.', citation: 'note-001', quote: 'left breast pain' };

function verifiedFirst(sentence: typeof PT): void {
  const r = litmus(sources, { warranted: true, evidence: [], sentences: [sentence] });
  assert.equal(r.sentences[0]!.status, 'verified', 'fixture sentence must start verified');
}

function only(ms: Mutation[], kind: Mutation['kind']): Mutation {
  const found = ms.filter(m => m.kind === kind);
  assert.equal(found.length, 1, `expected one ${kind} mutation, got ${found.length}`);
  return found[0]!;
}

describe('mutations the gate must catch (class hard)', () => {
  test('a number replaced by a value absent from every admissible source is caught', () => {
    verifiedFirst(PT);
    const m = only(mutateSentence(PT, sources, new Rng(1)), 'number-absent');
    assert.equal(m.class, 'hard');
    assert.notEqual(m.sentence.text, PT.text);
    assert.ok(!/\b12\b/.test(m.sentence.text.replace(/\d{4}-\d{2}-\d{2}/g, '')), 'the 12 was replaced');
    const g = gateMutation(sources, m);
    assert.notEqual(g.status, 'verified');
    assert.match(g.reason, /unsourced-token|needs-citation/);
  });

  test('a date shifted by one day is caught', () => {
    const m = only(mutateSentence(PT, sources, new Rng(1)), 'date-shift');
    assert.ok(m.sentence.text.includes('2025-08-15'), m.sentence.text);
    assert.notEqual(gateMutation(sources, m).status, 'verified');
  });

  test('left swapped for right in an anatomical context is caught', () => {
    verifiedFirst(SIDE);
    const m = only(mutateSentence(SIDE, sources, new Rng(1)), 'laterality-swap');
    assert.equal(m.sentence.text, 'The pain is in the right breast.');
    const g = gateMutation(sources, m);
    assert.notEqual(g.status, 'verified');
    assert.equal(g.status, 'needs-citation'); // "right back to baseline" lives in note-002
  });

  test('a citation moved to an entry that lacks the quote is refuted', () => {
    const m = only(mutateSentence(PT, sources, new Rng(1)), 'citation-moved');
    assert.notEqual(m.sentence.citation, 'note-002');
    assert.equal(m.sentence.quote, PT.quote);
    const g = gateMutation(sources, m);
    assert.equal(g.status, 'refuted');
    assert.match(g.reason, /quote-not-in-entry/);
  });

  test('a quote with one word dropped is refuted', () => {
    const m = only(mutateSentence(PT, sources, new Rng(1)), 'quote-word-dropped');
    assert.notEqual(m.sentence.quote, PT.quote);
    assert.equal(m.sentence.quote.split(' ').length, PT.quote.split(' ').length - 1);
    const g = gateMutation(sources, m);
    assert.equal(g.status, 'refuted');
    assert.match(g.reason, /quote-not-in-entry/);
  });
});

describe('presence collisions (class collision)', () => {
  test('a wrong number that appears in the criteria or denial but not the entry passes the gate', () => {
    const m = only(mutateSentence(PT, sources, new Rng(1)), 'number-collision');
    assert.equal(m.class, 'collision');
    assert.ok(!/\b12\b/.test(m.sentence.text.replace(/\d{4}-\d{2}-\d{2}/g, '')), 'the 12 was replaced');
    assert.equal(gateMutation(sources, m).status, 'verified');
  });
});

describe('corruptions the gate is not designed to see (class soft)', () => {
  test('a flipped negation changes the meaning and passes', () => {
    const m = only(mutateSentence(PT, sources, new Rng(1)), 'negation-flip');
    assert.equal(m.class, 'soft');
    assert.ok(m.sentence.text.includes('with lasting relief'), m.sentence.text);
    assert.equal(gateMutation(sources, m).status, 'verified');
  });

  test('a swapped pronoun passes', () => {
    const m = only(mutateSentence(PT, sources, new Rng(1)), 'pronoun-swap');
    assert.ok(/\bhe said\b/.test(m.sentence.text), m.sentence.text);
    assert.equal(gateMutation(sources, m).status, 'verified');
  });
});

describe('mutation bookkeeping', () => {
  test('kinds that do not apply are skipped, not faked', () => {
    const noSide = mutateSentence(PT, sources, new Rng(1));
    assert.equal(noSide.filter(m => m.kind === 'laterality-swap').length, 0);
    const noPronoun = mutateSentence(SIDE, sources, new Rng(1));
    assert.equal(noPronoun.filter(m => m.kind === 'pronoun-swap').length, 0);
    assert.equal(noPronoun.filter(m => m.kind === 'number-absent').length, 0);
  });

  test('the same seed yields the same mutations', () => {
    assert.deepEqual(mutateSentence(PT, sources, new Rng(7)), mutateSentence(PT, sources, new Rng(7)));
  });

  test('the summary counts attempted, caught, and passed per kind and per class', () => {
    const records: MutationRecord[] = [
      { kind: 'number-absent', class: 'hard', status: 'refuted' },
      { kind: 'number-absent', class: 'hard', status: 'needs-citation' },
      { kind: 'laterality-swap', class: 'hard', status: 'verified' },
      { kind: 'number-collision', class: 'collision', status: 'verified' },
      { kind: 'negation-flip', class: 'soft', status: 'verified' },
    ];
    const s = summarizeMutations(records);
    assert.deepEqual(s.byKind['number-absent'], { attempted: 2, caught: 2, passed: 0, statuses: { refuted: 1, 'needs-citation': 1 } });
    assert.deepEqual(s.byKind['laterality-swap'], { attempted: 1, caught: 0, passed: 1, statuses: { verified: 1 } });
    assert.deepEqual(s.byClass.hard, { attempted: 3, caught: 2, passed: 1 });
    assert.deepEqual(s.byClass.collision, { attempted: 1, caught: 0, passed: 1 });
    assert.deepEqual(s.byClass.soft, { attempted: 1, caught: 0, passed: 1 });
  });
});

describe('number rendering', () => {
  test('a collision replacement is written the way the admissible source writes it, not with borrowed decimals', () => {
    const chart4 = [{ id: 'note-004', date: '2025-09-05', kind: 'emergency note', text: 'Sepsis workup. Lactate 4.1 on arrival, repeat pending.' }];
    const src: GateSources = { chart: chart4, criteria: [{ id: 'crit-1', text: 'Lactate of 2 or more.' }], denial: ['Denied MS-DRG 871.'], facts: ['SYN-033, 70 year old man'] };
    const s = { text: 'The lactate was 4.1 on arrival.', citation: 'note-004', quote: 'Lactate 4.1 on arrival' };
    const m = only(mutateSentence(s, src, new Rng(1)), 'number-collision');
    // The replacement comes from the criteria, denial, or facts (2, 871, 70, or 33 from the alias) and is written as an integer.
    assert.ok(!/4\.1/.test(m.sentence.text) && !/\d\.\d/.test(m.sentence.text), m.sentence.text);
    assert.equal(gateMutation(src, m).status, 'verified');
  });
});

describe('laterality candidates', () => {
  test('a non-anatomical right ("right back to baseline") is not treated as a side', () => {
    const idiom = { text: 'She was right back to baseline after the sessions.', citation: 'note-002', quote: 'right back to baseline' };
    const ms = mutateSentence(idiom, sources, new Rng(1));
    assert.equal(ms.filter(m => m.kind === 'laterality-swap' || m.kind === 'laterality-collision').length, 0);
  });
});
