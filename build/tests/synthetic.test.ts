import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateCases, SEED, CASE_COUNT } from '../src/synthetic/generate.js';
import type { SyntheticCase } from '../src/synthetic/types.js';

const cases = generateCases(SEED);
const CASES_DIR = join(import.meta.dirname, '..', 'synthetic', 'cases');

// The same patterns scripts/phi_check.py looks for, applied to the case text.
const PHI_PATTERNS: [string, RegExp][] = [
  ['SSN', /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/],
  // phi_check.py matches the label case-insensitively and the identifier case-sensitively (upper case or digits).
  ['labeled DOB', /\b(?:[Dd][Oo][Bb]|[Dd]ate of [Bb]irth|[Bb]irth ?[Dd]ate)[ \t]*[:#=]?[ \t]*\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/],
  ['labeled MRN', /\b(?:[Mm][Rr][Nn]|[Mm]edical [Rr]ecord (?:[Nn]umber|[Nn]o\.?))[ \t]*[:#=]?[ \t]*[A-Z0-9-]{5,}/],
  ['labeled member id', /\b(?:[Mm]ember|[Ss]ubscriber|[Ii]nsurance)[ \t]*(?:[Ii][Dd]|[Nn]umber|[Nn]o\.?|#)[ \t]*[:#=]?[ \t]*[A-Z0-9-]{6,}/],
  ['labeled claim number', /\b[Cc]laim[ \t]*(?:[Ii][Dd]|[Nn]umber|[Nn]o\.?|#)[ \t]*[:#=]?[ \t]*[A-Z0-9-]{8,}/],
  ['ten digit run', /(?<!\d)\d{10}(?!\d)/],
];

const REAL_PAYERS = /aetna|cigna|unitedhealth|united healthcare|humana|anthem|blue cross|blue shield|kaiser|centene|molina|elevance|oscar|highmark|wellcare/i;

function count<T>(xs: T[], f: (x: T) => boolean): number {
  return xs.filter(f).length;
}

describe('synthetic denial set', () => {
  test(`has ${CASE_COUNT} cases with sequential ids and is deterministic for the seed`, () => {
    assert.equal(cases.length, CASE_COUNT);
    cases.forEach((c, i) => assert.equal(c.id, `case-${String(i + 1).padStart(3, '0')}`));
    assert.equal(JSON.stringify(generateCases(SEED)), JSON.stringify(cases));
    assert.notEqual(JSON.stringify(generateCases(SEED + 1)), JSON.stringify(cases));
  });

  test('chart entries are sequential note-NNN ids in date order, 15 to 40 per case', () => {
    for (const c of cases) {
      assert.ok(c.chart.length >= 15 && c.chart.length <= 40, `${c.id} has ${c.chart.length} entries`);
      c.chart.forEach((e, i) => {
        assert.equal(e.id, `note-${String(i + 1).padStart(3, '0')}`, `${c.id} entry ${i}`);
        assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(e.text.trim().length > 20, `${c.id} ${e.id} is too short`);
        if (i > 0) assert.ok(e.date >= c.chart[i - 1]!.date, `${c.id} ${e.id} is out of order`);
      });
      const last = c.denial.serviceEnd ?? c.denial.dateOfService;
      assert.ok(c.chart.every(e => e.date <= last), `${c.id} has an entry after the service period`);
      assert.equal(new Set(c.chart.map(e => e.text)).size, c.chart.length, `${c.id} repeats an entry verbatim`);
    }
  });

  test('every support and distractor reference resolves, and they do not overlap', () => {
    for (const c of cases) {
      const ids = new Set(c.chart.map(e => e.id));
      const critIds = new Set(c.criteria.map(k => k.id));
      for (const [crit, notes] of Object.entries(c.expected.support)) {
        assert.ok(critIds.has(crit), `${c.id} support names unknown criterion ${crit}`);
        for (const n of notes) {
          assert.ok(ids.has(n), `${c.id} support names unknown note ${n}`);
          assert.ok(!c.expected.distractors.includes(n), `${c.id} ${n} is both support and distractor`);
        }
      }
      for (const n of c.expected.distractors) assert.ok(ids.has(n), `${c.id} distractor ${n} missing`);
      assert.ok(c.expected.distractors.length >= 3, `${c.id} needs at least 3 distractors`);
      assert.deepEqual(
        [...c.expected.criteriaMet].sort(),
        Object.entries(c.expected.support).filter(([, n]) => n.length > 0).map(([k]) => k).sort(),
        `${c.id} criteriaMet disagrees with support`,
      );
    }
  });

  test('labels: 30 warranted, 20 not, with the four not-warranted subtypes', () => {
    const warranted = cases.filter(c => c.expected.warranted);
    const not = cases.filter(c => !c.expected.warranted);
    assert.equal(warranted.length, 30);
    assert.equal(not.length, 20);
    assert.ok(warranted.every(c => c.expected.subtype === undefined));
    assert.equal(count(not, c => c.expected.subtype === 'absent'), 6);
    assert.equal(count(not, c => c.expected.subtype === 'near-miss'), 7);
    assert.equal(count(not, c => c.expected.subtype === 'wrong-remedy'), 4);
    assert.equal(count(not, c => c.expected.subtype === 'exclusion'), 3);
  });

  test('warranted cases support every criterion; absent and near-miss cases leave one unsupported; wrong-remedy cases support all', () => {
    for (const c of cases) {
      const unsupported = c.criteria.filter(k => (c.expected.support[k.id] ?? []).length === 0).map(k => k.id);
      const sub = c.expected.subtype;
      if (c.expected.warranted || sub === 'wrong-remedy') {
        assert.deepEqual(unsupported, [], `${c.id} (${sub ?? 'warranted'}) leaves ${unsupported.join(',')} unsupported`);
      } else {
        assert.ok(unsupported.length >= 1, `${c.id} (${sub}) should leave a criterion unsupported`);
      }
      assert.ok(c.expected.note.length > 20, `${c.id} needs an explanatory note`);
    }
  });

  test('spans the high-dollar denial categories: payers, services, settings, CARC codes', () => {
    const payers = new Set(cases.map(c => c.payer.name));
    const codes = new Set(cases.map(c => c.procedure.code));
    const categories = new Set(cases.map(c => c.category));
    const settings = new Set(cases.map(c => c.setting));
    const carcs = new Set(cases.map(c => c.denial.carc));
    assert.equal(payers.size, 6);
    assert.ok(codes.size >= 16, `only ${codes.size} distinct service codes`);
    assert.ok(categories.size >= 10, `only ${categories.size} categories`);
    assert.deepEqual([...settings].sort(), ['inpatient', 'outpatient', 'post-acute']);
    assert.ok(carcs.size >= 10, `only ${carcs.size} CARC codes`);
    assert.ok(count(cases, c => c.category === 'post-acute care') >= 8, 'post-acute care is the documented target and needs weight');
    for (const c of cases) {
      assert.ok(c.criteria.length >= 3 && c.criteria.length <= 6, `${c.id} has ${c.criteria.length} criteria`);
      c.criteria.forEach((k, i) => assert.equal(k.id, `crit-${i + 1}`));
      assert.match(c.denial.text, new RegExp(`${c.procedure.codeSystem} ${c.procedure.code}`));
      assert.match(c.denial.text, new RegExp(`CARC ${c.denial.carc}\\b`));
      assert.ok(c.stakesUsd >= 1000, `${c.id} stakes`);
      if (c.denial.serviceEnd) assert.ok(c.denial.serviceEnd > c.denial.dateOfService);
    }
  });

  test('facility charts read as facility records: no clinic-style insurance calls, dates inside the stay', () => {
    for (const c of cases.filter(c => c.setting !== 'outpatient')) {
      assert.ok(c.denial.serviceEnd, `${c.id} needs a service period`);
      assert.ok(!c.chart.some(e => /where things stand with the insurance/.test(e.text)), `${c.id} has an outpatient phone note`);
    }
  });

  test('carries no patient identifiers and names no real payer', () => {
    for (const c of cases) {
      const json = JSON.stringify(c);
      for (const [name, re] of PHI_PATTERNS) assert.ok(!re.test(json), `${c.id}: ${name} pattern in case text`);
      assert.ok(!REAL_PAYERS.test(json), `${c.id} names a real payer`);
      assert.match(c.patient.alias, /^SYN-\d{3}$/);
      assert.ok(c.patient.age >= 18 && c.patient.age <= 85);
    }
  });

  test('charts are dictation sized: 500 to 3500 words (a sub-24-hour stay is the shortest)', () => {
    for (const c of cases) {
      const words = c.chart.reduce((n, e) => n + e.text.split(/\s+/).length, 0);
      assert.ok(words >= 500 && words <= 3500, `${c.id} has ${words} words`);
    }
  });

  test('committed case files match the generator', () => {
    const files = readdirSync(CASES_DIR).filter(f => f.endsWith('.json')).sort();
    assert.equal(files.length, CASE_COUNT, 'run `npm run synthetic` to regenerate');
    files.forEach((f, i) => {
      const onDisk = JSON.parse(readFileSync(join(CASES_DIR, f), 'utf8')) as SyntheticCase;
      assert.deepEqual(onDisk, cases[i], `${f} differs from the generator; run \`npm run synthetic\``);
    });
  });
});
