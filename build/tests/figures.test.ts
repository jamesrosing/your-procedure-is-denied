import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { githubAnchor, paperIndex, README_URL, REPO_BLOB_URL } from '../viewer/src/figures.js';

const here = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(here, '..', '..', 'README.md'), 'utf8');

describe('githubAnchor', () => {
  test('lowercases, drops punctuation, joins words with hyphens, as GitHub does for headings', () => {
    assert.equal(githubAnchor('2.2 The system under test'), '22-the-system-under-test');
    assert.equal(githubAnchor('4.2 The disagreements, read'), '42-the-disagreements-read');
    assert.equal(githubAnchor('3. Results'), '3-results');
    assert.equal(githubAnchor("2.12 Dictation (prepared; the recording is the author's)"), '212-dictation-prepared-the-recording-is-the-authors');
  });
});

describe('paperIndex over the README', () => {
  const index = paperIndex(readme);

  test('finds every figure of the paper, numbered in order from 1', () => {
    assert.equal(index.figures.length, 13);
    assert.deepEqual(index.figures.map(f => f.n), Array.from({ length: 13 }, (_, i) => i + 1));
  });

  test('finds every table, numbered in order from 1, with its title and the section it sits in', () => {
    assert.equal(index.tables.length, 7);
    assert.deepEqual(index.tables.map(t => t.n), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(index.tables[0]!.title, 'Kept runs');
    assert.equal(index.tables[0]!.anchor, '3-results');
    assert.equal(index.tables[0]!.href, `${README_URL}#3-results`);
    for (const t of index.tables) {
      assert.ok(t.caption.length > 0 && !t.caption.includes('**'), `table ${t.n} caption is plain text`);
      assert.ok(t.caption.endsWith('.'), `table ${t.n} caption is one sentence`);
    }
  });

  test('a figure addressed by deep link keeps the link in page, with file and case', () => {
    for (const f of index.figures.filter(f => f.n >= 2 && f.n <= 12)) {
      const inPage = f.segments.filter(s => s.href !== undefined && s.inPage);
      assert.ok(inPage.length >= 1, `figure ${f.n} has an in-page link`);
      for (const s of inPage) {
        assert.ok(s.href!.startsWith('#file=') && s.href!.includes('&case=case-'), `figure ${f.n} link ${s.href}`);
      }
    }
    const twelve = index.figures.find(f => f.n === 12)!;
    assert.ok(twelve.segments.some(s => s.inPage && s.href!.includes('view=compare')));
    const nine = index.figures.find(f => f.n === 9)!;
    assert.equal(nine.segments.filter(s => s.inPage).length, 2, 'both chairs of figure 9');
  });

  test('a figure that is a file in the repository links to that file on GitHub', () => {
    const thirteen = index.figures.find(f => f.n === 13)!;
    const file = thirteen.segments.find(s => s.href !== undefined)!;
    assert.equal(file.inPage, false);
    assert.equal(file.href, `${REPO_BLOB_URL}build/synthetic/letters/case-001.png`);
  });

  test('a figure that names a section and carries no link links to that section of the README', () => {
    const one = index.figures.find(f => f.n === 1)!;
    const link = one.segments.find(s => s.href !== undefined)!;
    assert.equal(link.inPage, false);
    assert.equal(link.href, `${README_URL}#22-the-system-under-test`);
  });

  test('titles are the text before the first colon, captions carry no markdown', () => {
    assert.equal(index.figures[1]!.title, 'A warranted case drafted and verified');
    assert.equal(index.figures[0]!.title, 'The system under test');
    for (const f of index.figures) {
      const text = f.segments.map(s => s.text).join('');
      assert.ok(!/[\[\]()]\(http/.test(text) && !text.includes(']('), `figure ${f.n} caption is plain text`);
      assert.ok(text.startsWith(f.title), `figure ${f.n} caption starts with its title`);
    }
  });
});

describe('paperIndex on small inputs', () => {
  test('tracks the nearest heading above each table and ignores lines that are not figures or tables', () => {
    const md = ['## 2. Methods', '### 2.4 The gate', 'Prose with [a link](https://example.org) in it.', '**Table 9. A title.** First sentence here. Second sentence.', '## 3. Results', '- Figure 1. Alone: see section 2.4 for the rule.', '- Not a figure.'].join('\n');
    const index = paperIndex(md);
    assert.equal(index.tables.length, 1);
    assert.equal(index.tables[0]!.anchor, '24-the-gate');
    assert.equal(index.tables[0]!.caption, 'First sentence here.');
    assert.equal(index.figures.length, 1);
    assert.equal(index.figures[0]!.anchor, '3-results');
    assert.equal(index.figures[0]!.segments.find(s => s.href)!.href, `${README_URL}#24-the-gate`);
  });

  test('a demo link becomes an in-page hash and keeps its parameters', () => {
    const md = '- Figure 2. A thing: [frame](https://demo.hemeehr.com/#file=a.json&case=case-001&step=end). After.';
    const f = paperIndex(md).figures[0]!;
    assert.deepEqual(f.segments, [
      { text: 'A thing: ' },
      { text: 'frame', href: '#file=a.json&case=case-001&step=end', inPage: true },
      { text: '. After.' },
    ]);
  });
});
