import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromiumExecutable, LETTER_HEIGHT, LETTER_WIDTH, letterFields, letterHtml, pngSize, remittanceDate, renderLetters, type LetterManifest } from '../src/synthetic/letters.js';
import { generateCases, SEED } from '../src/synthetic/generate.js';

const here = dirname(fileURLToPath(import.meta.url));
const lettersDir = join(here, '..', 'synthetic', 'letters');
const cases = generateCases(SEED);
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

describe('the denial as a letter (item 4): deterministic from the case file', () => {
  test('the HTML is a pure function of the case: same bytes twice, one page, the claim line, the codes, the dates, the amount, the reason, the remark, the appeal rights', () => {
    for (const c of cases) {
      const html = letterHtml(c);
      assert.equal(html, letterHtml(c), c.id);
      assert.ok(html.includes(c.payer.name) && html.includes(c.payer.planType), `${c.id} letterhead`);
      assert.ok(html.includes(c.procedure.code) && html.includes(c.procedure.codeSystem), `${c.id} code`);
      assert.ok(html.includes(c.denial.dateOfService), `${c.id} date of service`);
      if (c.denial.serviceEnd) assert.ok(html.includes(c.denial.serviceEnd), `${c.id} service end`);
      assert.ok(html.includes(`$${c.stakesUsd.toLocaleString('en-US')}.00`), `${c.id} billed amount`);
      assert.ok(html.includes(`CARC ${c.denial.carc}`) && html.includes(c.denial.carcText), `${c.id} reason code and text`);
      if (c.denial.rarc) assert.ok(html.includes(`RARC ${c.denial.rarc}`), `${c.id} remark code`);
      const remark = /Payer remark:\s*(.+)$/s.exec(c.denial.text)![1]!.trim();
      assert.ok(html.includes(remark), `${c.id} payer remark`);
      assert.match(html, /right to appeal/i);
      assert.ok(html.includes(`${c.patient.alias}`), `${c.id} alias`);
      assert.ok(html.includes(remittanceDate(c)), `${c.id} remittance date`);
      // No identifiers a real letter would carry: the synthetic set issues none.
      assert.ok(!/member (id|number)|subscriber (id|number)|claim (id|number)|date of birth|\bDOB\b|\bMRN\b/i.test(html.replace(/no member, subscriber, or claim identifiers/i, '')), `${c.id} carries no identifier label`);
      assert.ok(!html.includes('—'), 'no em dashes');
    }
  });

  test('the remittance date is three weeks after the last date of service, computed in UTC', () => {
    const c = { ...cases[0]!, denial: { ...cases[0]!.denial, dateOfService: '2026-09-13', serviceEnd: '2026-09-26' } };
    assert.equal(remittanceDate(c), '2026-10-17');
    const d = { ...cases[0]!, denial: { ...cases[0]!.denial, dateOfService: '2026-12-20' } };
    delete (d.denial as { serviceEnd?: string }).serviceEnd;
    assert.equal(remittanceDate(d), '2027-01-10');
  });

  test('the fields the intake must read back are the case file\'s, with the billed amount as a number and no service end where there is none', () => {
    const f = letterFields(cases[0]!);
    assert.deepEqual(Object.keys(f).sort(), ['billedUsd', 'carc', 'codeSystem', 'code', 'dateOfService', 'payerName', 'remark', 'serviceEnd'].sort());
    assert.equal(f.carc, cases[0]!.denial.carc);
    assert.equal(f.billedUsd, cases[0]!.stakesUsd);
    assert.equal(f.payerName, cases[0]!.payer.name);
    const single = cases.find(c => !c.denial.serviceEnd)!;
    assert.equal(letterFields(single).serviceEnd, null);
  });

  test('fifty letters are committed at 1275 by 1650, and the manifest\'s HTML and PNG hashes match the generator and the files', () => {
    const manifestPath = join(lettersDir, 'manifest.json');
    assert.ok(existsSync(manifestPath), 'synthetic/letters/manifest.json is committed');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as LetterManifest;
    assert.equal(manifest.width, LETTER_WIDTH);
    assert.equal(manifest.height, LETTER_HEIGHT);
    assert.equal(Object.keys(manifest.letters).length, 50);
    for (const c of cases) {
      const entry = manifest.letters[c.id];
      assert.ok(entry, `${c.id} in the manifest`);
      assert.equal(entry.html, sha(letterHtml(c)), `${c.id}: the HTML regenerates to the committed hash`);
      const png = readFileSync(join(lettersDir, `${c.id}.png`));
      assert.equal(sha(png), entry.png, `${c.id}: the committed PNG matches the manifest`);
      assert.deepEqual(pngSize(png), { width: LETTER_WIDTH, height: LETTER_HEIGHT }, `${c.id}: page size`);
    }
  });

  test('regeneration is byte-identical: two letters re-rendered in Playwright\'s Chromium match the committed files', { skip: chromiumExecutable() ? false : 'Playwright\'s Chromium is not installed on this machine' }, async () => {
    const two = cases.slice(0, 2);
    const rendered = await renderLetters(two);
    for (const c of two) {
      const committed = readFileSync(join(lettersDir, `${c.id}.png`));
      assert.ok(rendered.get(c.id)!.equals(committed), `${c.id}: re-rendered bytes equal the committed bytes`);
    }
  });
});
