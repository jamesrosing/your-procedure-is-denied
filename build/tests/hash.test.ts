import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../src/hash.js';

const here = dirname(fileURLToPath(import.meta.url));
const node = (s: string) => createHash('sha256').update(s).digest('hex');

describe('sha256Hex: the gate hashes without node:crypto so it can run in the browser', () => {
  test('matches node for the empty string, short, block-boundary, and multi-block inputs', () => {
    for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(119), 'x'.repeat(1000)]) {
      assert.equal(sha256Hex(s), node(s), `length ${s.length}`);
    }
    assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('encodes non-ASCII as UTF-8, like node', () => {
    for (const s of ['left ventricle — “quoted” ’s', 'café ½ ‰', '\u{1F600} emoji']) assert.equal(sha256Hex(s), node(s));
  });

  test('reproduces every stored inputHash in the kept result files', () => {
    // litmus() hashed {chart, criteria, denial, facts, appeal} with node:crypto when the runs were made;
    // the pure implementation must give the same digest for the same sources, or provenance breaks.
    const resultsDir = join(here, '..', 'results');
    const casesDir = join(here, '..', 'synthetic', 'cases');
    const cases = new Map(readdirSync(casesDir).filter(f => f.endsWith('.json')).map(f => { const c = JSON.parse(readFileSync(join(casesDir, f), 'utf8')); return [c.id as string, c]; }));
    let checked = 0;
    for (const f of readdirSync(resultsDir).filter(f => f.endsWith('.json'))) {
      const file = JSON.parse(readFileSync(join(resultsDir, f), 'utf8'));
      for (const r of file.results) {
        if (!r.gate || !r.draft) continue;
        const c = cases.get(r.caseId);
        const sources = {
          chart: c.chart,
          criteria: c.criteria,
          denial: [c.denial.text, `CARC ${c.denial.carc}`, c.denial.dateOfService, ...(c.denial.serviceEnd ? [c.denial.serviceEnd] : []), ...(c.denial.rarc ? [c.denial.rarc] : [])],
          facts: [`Patient ${c.patient.alias}, ${c.patient.age} year old ${c.patient.sex}`, `${c.procedure.codeSystem} ${c.procedure.code} ${c.procedure.description}`, `${c.payer.name}, ${c.payer.planType}`],
        };
        const expected = sha256Hex(JSON.stringify({ chart: sources.chart, criteria: sources.criteria, denial: sources.denial, facts: sources.facts, appeal: r.draft }));
        assert.equal(r.gate.inputHash, expected, `${f} ${r.caseId}`);
        checked++;
      }
    }
    assert.ok(checked > 400, `checked ${checked}`);
  });
});
