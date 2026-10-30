import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writDocument, writText, WRIT_BAND, WRIT_BUTTON, WRIT_HELP, WRIT_SIGNATURE } from '../viewer/src/writ.js';
import type { ResultsFile, ViewerCase } from '../viewer/src/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const load = (f: string) => JSON.parse(readFileSync(join(root, 'results', f), 'utf8')) as ResultsFile;
const caseOf = (id: string) => JSON.parse(readFileSync(join(root, 'synthetic', 'cases', `${id}.json`), 'utf8')) as ViewerCase;
const spark = load('meta-muse-spark-1.3-low-agentic-chart-2026-10-28T06-48-41-422Z.json');
const wonder = load('meta-muse-wonder-1.0-low-agentic-chart-2026-10-28T06-51-47-640Z.json');
const open = load('baseten-meta-models_muse-spark-open-low-agentic-chart-2026-10-28T07-13-57-225Z.json');
const pick = (f: ResultsFile, id: string) => f.results.find(r => r.caseId === id)!;

describe('the writ: a passing draft rendered as the instrument the physician would sign', () => {
  test('case-001: one footnote per sentence, in order, each carrying the cited entry, its date, its kind, and the verified quote', () => {
    const c = caseOf('case-001');
    const r = pick(spark, 'case-001');
    const doc = writDocument(c, r, spark.run)!;
    assert.ok(doc);
    assert.equal(doc.sentences.length, 8);
    assert.equal(doc.footnotes.length, 8);
    doc.sentences.forEach((s, i) => {
      assert.equal(s.n, i + 1);
      assert.equal(s.text, r.gate!.sentences[i]!.text);
      const fn = doc.footnotes[i]!;
      assert.equal(fn.n, i + 1);
      assert.equal(fn.entryId, r.gate!.sentences[i]!.citation);
      assert.equal(fn.quote, r.gate!.sentences[i]!.quote);
      const entry = c.chart.find(e => e.id === fn.entryId)!;
      assert.equal(fn.date, entry.date);
      assert.equal(fn.kind, entry.kind);
    });
  });

  test('the head names the payer, the service, the dates, and the reason code, and quotes the payer\'s own reason', () => {
    const c = caseOf('case-001');
    const doc = writDocument(c, pick(spark, 'case-001'), spark.run)!;
    assert.match(doc.to, /Silverline Medicare Advantage/);
    assert.match(doc.re, /HIPPS KDOB1/);
    assert.match(doc.re, /CARC 50/);
    assert.match(doc.re, new RegExp(c.denial.dateOfService));
    assert.ok(doc.payerReason && doc.payerReason.length > 10);
  });

  test('provenance names the model, the run date, the gate version, and the input hash; the band and the signature line are fixed copy', () => {
    const r = pick(spark, 'case-001');
    const doc = writDocument(caseOf('case-001'), r, spark.run)!;
    assert.match(doc.provenance, /muse-spark-1\.3/);
    assert.match(doc.provenance, /2026-10-28/);
    assert.match(doc.provenance, /v1\.4/);
    assert.ok(doc.provenance.includes((r.gate as { inputHash?: string }).inputHash!.slice(0, 12)));
    assert.equal(doc.band, WRIT_BAND);
    assert.equal(doc.signature, WRIT_SIGNATURE);
    assert.match(WRIT_BAND, /draft/i);
    assert.match(WRIT_BAND, /unsigned/i);
    assert.match(WRIT_BAND, /not (been )?sent/i);
    assert.match(WRIT_SIGNATURE, /_{8,}/);
    assert.match(WRIT_SIGNATURE, /MD/);
    for (const s of [WRIT_BAND, WRIT_SIGNATURE, WRIT_HELP, WRIT_BUTTON]) assert.ok(!s.includes('!'));
  });

  test('only a passing verdict has a writ: declined, blocked, and failed cases return null', () => {
    assert.equal(writDocument(caseOf('case-044'), pick(wonder, 'case-044'), wonder.run), null);
    assert.equal(writDocument(caseOf('case-027'), pick(spark, 'case-027'), spark.run), null);
    const failed = open.results.find(r => r.outcome === 'error');
    if (failed) assert.equal(writDocument(caseOf(failed.caseId), failed, open.run), null);
  });

  test('the false pass renders too, because PASS is the gate\'s word and the physician decides; the band says so', () => {
    const doc = writDocument(caseOf('case-023'), pick(open, 'case-023'), open.run)!;
    assert.ok(doc);
    assert.equal(doc.sentences.length, 9);
    assert.match(doc.band, /physician/i);
  });

  test('the plain-text rendering carries numbered markers, the footnotes, the band, the provenance, and the signature line', () => {
    const doc = writDocument(caseOf('case-001'), pick(spark, 'case-001'), spark.run)!;
    const txt = writText(doc);
    for (let n = 1; n <= 8; n++) {
      assert.ok(txt.includes(`[${n}]`), `marker ${n}`);
      assert.ok(txt.includes(`[${n}] ${doc.footnotes[n - 1]!.entryId}`), `footnote ${n}`);
    }
    assert.ok(txt.startsWith(WRIT_BAND));
    assert.ok(txt.includes(doc.provenance));
    assert.ok(txt.trimEnd().endsWith(WRIT_SIGNATURE) || txt.includes(WRIT_SIGNATURE));
    assert.ok(!/—/.test(txt), 'no em dashes in the instrument');
  });

  test('every passing result in every kept file renders, and no sentence is left without a footnote', () => {
    const files = ['meta-muse-spark-1.3-low-2026-10-27T08-17-14-218Z.json', 'meta-muse-wonder-1.0-low-agentic-2026-10-28T03-24-24-509Z.json', 'baseten-meta-models_muse-spark-open-low-agentic-chart-2026-10-28T07-13-57-225Z.json'];
    let rendered = 0;
    for (const f of files) {
      const file = load(f);
      for (const r of file.results) {
        const doc = writDocument(caseOf(r.caseId), r, file.run);
        if (r.gate?.verdict === 'pass') { assert.ok(doc, `${f} ${r.caseId}`); assert.equal(doc!.footnotes.length, doc!.sentences.length); rendered++; }
        else assert.equal(doc, null);
      }
    }
    assert.ok(rendered > 80, `rendered ${rendered}`);
  });
});
