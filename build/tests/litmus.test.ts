import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { litmus, type GateSources, type SentenceRecord } from '../src/litmus.js';
import type { Appeal } from '../src/schema.js';

const chart = [
  { id: 'note-001', date: '2025-06-26', kind: 'office visit', text: '49 year old woman here about her breasts. Going on 17 months of upper back and neck pain that she ties to the weight of the breasts, worse by the end of a shift. She is 5 foot 2, 200 pounds, which puts BSA right around 1.99. Schnur 22nd percentile at that BSA is about 620 grams. I am estimating 724 grams on the right and 690 on the left.' },
  { id: 'note-002', date: '2025-08-14', kind: 'physical therapy', text: 'Finished 12 weeks of PT across the street, says it helped while she was there and then right back to baseline. Still in the supportive bra, still on the ibuprofen.' },
  { id: 'note-003', date: '2025-09-01', kind: 'office visit', text: 'Blood pressure check. 128 over 82 today. Keep the dose, recheck in 8 weeks.' },
];
const criteria = [
  { id: 'crit-1', text: 'Symptoms attributable to macromastia documented for at least 6 months.' },
  { id: 'crit-2', text: 'At least 3 months of conservative treatment without adequate relief.' },
  { id: 'crit-3', text: 'Estimated resection weight at or above the 22nd percentile of the Schnur scale.' },
];
const sources: GateSources = {
  chart,
  criteria,
  denial: ['Northwind Mutual Health denied CPT 19318 with date of service 2026-03-14. CARC 50.'],
  facts: ['SYN-049, 49 year old woman'],
};

const Q_PAIN = 'Going on 17 months of upper back and neck pain that she ties to the weight of the breasts';
const Q_PT = 'Finished 12 weeks of PT across the street, says it helped while she was there and then right back to baseline';
const Q_WEIGHT = 'Schnur 22nd percentile at that BSA is about 620 grams. I am estimating 724 grams on the right and 690 on the left';

const fullEvidence = [
  { criterion: 'crit-1', citation: 'note-001', quote: Q_PAIN },
  { criterion: 'crit-2', citation: 'note-002', quote: Q_PT },
  { criterion: 'crit-3', citation: 'note-001', quote: Q_WEIGHT },
];

function appeal(sentences: Appeal['sentences'], evidence = fullEvidence, warranted = true, reason?: string): Appeal {
  return { warranted, ...(reason ? { reason } : {}), evidence, sentences };
}

const GOOD = [
  { text: 'The record documents 17 months of upper back and neck pain attributable to breast weight, exceeding the 6 month requirement.', citation: 'note-001', quote: Q_PAIN },
  { text: 'The patient completed twelve weeks of physical therapy without lasting relief.', citation: 'note-002', quote: Q_PT },
  { text: 'The estimated resection of 724 grams on the right and 690 on the left exceeds the 620 gram Schnur threshold.', citation: 'note-001', quote: Q_WEIGHT },
];

describe('litmus: packet verdicts', () => {
  test('passes only when every sentence is verified and every criterion has verified evidence', () => {
    const r = litmus(sources, appeal(GOOD));
    assert.equal(r.verdict, 'pass');
    assert.equal(r.errored, false);
    assert.deepEqual(r.reasons, []);
    assert.deepEqual(r.criteria, { 'crit-1': 'verified', 'crit-2': 'verified', 'crit-3': 'verified' });
    assert.equal(r.counts.verified, 3);
    assert.ok(r.sentences.every(s => s.status === 'verified'));
  });

  test('warranted with no sentences is blocked: no citations', () => {
    const r = litmus(sources, appeal([]));
    assert.equal(r.verdict, 'blocked');
    assert.ok(r.reasons.some(x => /no cited sentences/.test(x)), r.reasons.join('; '));
  });

  test('a criterion without verified evidence blocks the packet and is named', () => {
    const r = litmus(sources, appeal(GOOD, fullEvidence.filter(e => e.criterion !== 'crit-2')));
    assert.equal(r.verdict, 'blocked');
    assert.equal(r.criteria['crit-2'], 'unverified');
    assert.ok(r.reasons.some(x => /crit-2/.test(x)));
  });

  test('one refuted sentence blocks an otherwise clean packet', () => {
    const bad = [...GOOD, { text: 'She completed 16 weeks of physical therapy.', citation: 'note-002', quote: Q_PT }];
    const r = litmus(sources, appeal(bad));
    assert.equal(r.verdict, 'blocked');
    assert.equal(r.counts.refuted, 1);
    assert.equal(r.counts.verified, 3);
  });

  test('warranted false is declined, with the reason, and the evidence is still checked for the record', () => {
    const r = litmus(sources, appeal([], fullEvidence.slice(0, 2), false, 'no resection estimate in the chart'));
    assert.equal(r.verdict, 'declined');
    assert.equal(r.declinedReason, 'no resection estimate in the chart');
    assert.deepEqual(r.criteria, { 'crit-1': 'verified', 'crit-2': 'verified', 'crit-3': 'unverified' });
  });
});

describe('litmus: citation resolution', () => {
  test('an unknown note id is unresolved, not refuted', () => {
    const r = litmus(sources, appeal([{ text: 'A thing.', citation: 'note-099', quote: 'a thing' }]));
    assert.equal(r.sentences[0]?.status, 'unresolved');
    assert.match(r.sentences[0]?.reason ?? '', /citation-unknown/);
  });

  test('a malformed citation is unresolved', () => {
    const r = litmus(sources, appeal([{ text: 'A thing.', citation: 'the chart', quote: 'a thing' }]));
    assert.equal(r.sentences[0]?.status, 'unresolved');
    assert.match(r.sentences[0]?.reason ?? '', /citation-malformed/);
  });

  test('evidence naming an unknown criterion is unresolved', () => {
    const r = litmus(sources, appeal(GOOD, [...fullEvidence, { criterion: 'crit-9', citation: 'note-001', quote: Q_PAIN }]));
    assert.equal(r.evidence[3]?.status, 'unresolved');
    assert.match(r.evidence[3]?.reason ?? '', /criterion-unknown/);
  });
});

describe('litmus: quote check', () => {
  const one = (text: string, citation: string, quote: string): SentenceRecord => litmus(sources, appeal([{ text, citation, quote }])).sentences[0]!;

  test('a verbatim quote verifies a paraphrased sentence', () => {
    assert.equal(one('She finished physical therapy and the relief did not last.', 'note-002', Q_PT).status, 'verified');
  });

  test('whitespace, case, and curly quotes are not differences', () => {
    const q = '  finished 12 WEEKS of PT   across the street, says it helped while she was there and then right back to baseline ';
    assert.equal(one('Therapy was completed.', 'note-002', q).status, 'verified');
    assert.equal(one('Pain documented.', 'note-001', 'she ties to the weight of the breasts, worse by the end of a shift'.replace("'", '’')).status, 'verified');
  });

  test('a quote with one word changed is refuted: the chart said PT, not physical therapy', () => {
    const s = one('Therapy was completed.', 'note-002', 'Finished 12 weeks of physical therapy across the street');
    assert.equal(s.status, 'refuted');
    assert.match(s.reason, /quote-not-in-entry/);
  });

  test('a real quote attached to the wrong note is refuted', () => {
    const s = one('Therapy was completed.', 'note-001', Q_PT);
    assert.equal(s.status, 'refuted');
    assert.match(s.reason, /quote-not-in-entry/);
  });

  test('an empty or trivial quote is refuted; a single substantive word the clinician wrote is accepted', () => {
    assert.match(one('Therapy was completed.', 'note-002', '').reason, /quote-empty/);
    assert.match(one('Therapy was completed.', 'note-002', 'PT').reason, /quote-too-short/);
    assert.match(one('Therapy was completed.', 'note-002', 'the').reason, /quote-too-short/);
    assert.equal(one('She uses ibuprofen.', 'note-002', 'ibuprofen').status, 'verified');
  });
});

describe('litmus: hard tokens', () => {
  const one = (text: string, citation: string, quote: string): SentenceRecord => litmus(sources, appeal([{ text, citation, quote }])).sentences[0]!;

  test('a number not in the quote, the criteria, the denial, or the case facts refutes the sentence and is named', () => {
    const s = one('She completed 16 weeks of physical therapy.', 'note-002', Q_PT);
    assert.equal(s.status, 'refuted');
    assert.match(s.reason, /unsourced-token/);
    assert.deepEqual(s.missing, ['16']);
  });

  test('number words count as numbers: twelve matches 12', () => {
    assert.equal(one('The patient completed twelve weeks of therapy.', 'note-002', Q_PT).status, 'verified');
    assert.equal(one('The patient completed sixteen weeks of therapy.', 'note-002', Q_PT).status, 'refuted');
  });

  test('compound number words are one number: eighty-one is 81, not 80 and 1; ninety-nine is 99 (found live, Oct 28, muse-spark-1.3 agentic case-042)', () => {
    const src: GateSources = { ...sources, chart: [...chart, { id: 'note-004', date: '2025-09-02', kind: 'imaging', text: 'CT angiography: right internal carotid artery 81 percent stenosis by NASCET criteria. Duplex consistent with 70 to 99 percent stenosis.' }] };
    const run = (text: string) => litmus(src, appeal([{ text, citation: 'note-004', quote: '81 percent stenosis by NASCET criteria' }])).sentences[0]!;
    assert.equal(run('Angiography measured stenosis at eighty-one percent by NASCET method.').status, 'verified');
    assert.equal(run('Duplex placed the lesion in the seventy to ninety-nine percent range.').status, 'verified');
    assert.equal(run('Duplex placed the lesion in the seventy to ninety nine percent range.').status, 'verified');
    const bad = run('Angiography measured stenosis at eighty-five percent.');
    assert.equal(bad.status, 'refuted');
    assert.deepEqual(bad.missing, ['85']);
    assert.equal(run('Angiography measured eighty one percent stenosis, at ninety one he was fine.').status, 'refuted');
  });


  test('hundreds are one number: one hundred ten is 110, two hundred is 200, three hundred twenty-five is 325, a hundred and five is 105 (found live, Oct 28, muse-spark-1.3 with CHART, case-032)', () => {
    const src: GateSources = { ...sources, chart: [...chart, { id: 'note-005', date: '2025-09-03', kind: 'therapy note', text: 'Ambulation 40 feet to 110 feet with the rolling walker. Walked 200 feet. Stairs 325 steps. Dose 105 mg.' }] };
    const run = (text: string, quote: string) => litmus(src, appeal([{ text, citation: 'note-005', quote }])).sentences[0]!;
    assert.equal(run('Ambulation progressed from forty feet to one hundred ten feet with the rolling walker.', 'Ambulation 40 feet to 110 feet with the rolling walker').status, 'verified');
    assert.equal(run('She then walked two hundred feet.', 'Walked 200 feet').status, 'verified');
    assert.equal(run('Three hundred twenty-five steps and a hundred and five milligrams.', 'Stairs 325 steps. Dose 105 mg').status, 'verified');
    const bad = run('She walked one hundred twenty feet.', 'Walked 200 feet');
    assert.equal(bad.status, 'refuted');
    assert.deepEqual(bad.missing, ['120']);
  });
  test('a number from the payer criteria or the denial is admissible', () => {
    assert.equal(one('This exceeds the 6 month symptom requirement and answers the CARC 50 denial of CPT 19318.', 'note-001', Q_PAIN).status, 'verified');
  });

  test('a number anywhere in the cited entry is admissible, inside the quote or not: the physician wrote it', () => {
    assert.equal(one('The 620 gram threshold is exceeded.', 'note-001', Q_PAIN).status, 'verified');
    assert.equal(one('The 620 gram threshold is exceeded.', 'note-001', Q_WEIGHT).status, 'verified');
    const s = one('The 650 gram threshold is exceeded.', 'note-001', Q_WEIGHT);
    assert.equal(s.status, 'refuted');
    assert.deepEqual(s.missing, ['650']);
  });

  test('a fact in a different, uncited entry is not admissible', () => {
    const s = one('Blood pressure was 128 over 82.', 'note-002', Q_PT);
    assert.equal(s.status, 'refuted');
    assert.deepEqual(s.missing, ['128', '82']);
  });

  test('the cited entry date is admissible in either form', () => {
    assert.equal(one('The therapy note of 2025-08-14 documents completion.', 'note-002', Q_PT).status, 'verified');
    assert.equal(one('The therapy note of August 14, 2025 documents completion.', 'note-002', Q_PT).status, 'verified');
    assert.equal(one('The therapy note of August 15, 2025 documents completion.', 'note-002', Q_PT).status, 'refuted');
  });

  test('laterality is a hard token in anatomical context only', () => {
    const s = one('Resection on the left breast was estimated at 724 grams.', 'note-002', Q_PT.replace('12', '12'));
    assert.equal(s.status, 'refuted');
    assert.deepEqual(s.missing, ['724', 'left']);
    assert.equal(one('Resection on the left breast was estimated at 724 grams.', 'note-001', 'I am estimating 724 grams on the right').status, 'verified');
    assert.equal(one('The patient reserves the right to further appeal.', 'note-002', Q_PT).status, 'verified');
  });

  test('a note id mentioned in the sentence is not mistaken for a number', () => {
    assert.equal(one('As note-002 records, therapy was completed.', 'note-002', Q_PT).status, 'verified');
  });
});

describe('litmus: errors are not refutations', () => {
  test('a check that throws is status error, the packet is blocked and flagged errored, and other sentences are still judged', () => {
    const broken: GateSources = { ...sources, chart: [...chart, { id: 'note-004', date: '2025-09-02', kind: 'office visit', text: null as unknown as string }] };
    const r = litmus(broken, appeal([
      ...GOOD,
      { text: 'Something.', citation: 'note-004', quote: 'some thing' },
      { text: 'She completed 16 weeks of physical therapy.', citation: 'note-002', quote: Q_PT },
    ]));
    assert.equal(r.verdict, 'blocked');
    assert.equal(r.errored, true);
    assert.equal(r.sentences[3]?.status, 'error');
    assert.equal(r.sentences[4]?.status, 'refuted');
    assert.equal(r.counts.error, 1);
    assert.equal(r.counts.refuted, 1);
    assert.equal(r.counts.verified, 3);
  });
});

describe('litmus: provenance', () => {
  test('the input hash is stable for the same input and changes when a quote changes', () => {
    const a = litmus(sources, appeal(GOOD));
    const b = litmus(sources, appeal(GOOD));
    const c = litmus(sources, appeal([{ ...GOOD[0]!, quote: Q_PAIN.slice(0, -1) }, GOOD[1]!, GOOD[2]!]));
    assert.match(a.inputHash, /^[0-9a-f]{64}$/);
    assert.equal(a.inputHash, b.inputHash);
    assert.notEqual(a.inputHash, c.inputHash);
    assert.equal(typeof a.litmus, 'string');
  });

  test('only the gate can produce a verified record', () => {
    // @ts-expect-error status 'verified' carries a brand that no other module can supply
    const forged: SentenceRecord = { index: 0, text: 'x', citation: 'note-001', quote: 'a b', status: 'verified', reason: 'verified' };
    assert.equal(forged.status, 'verified');
  });
});
