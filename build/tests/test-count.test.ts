import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTests, COUNTING_ENV, statedTestCount, TEST_COUNT_FILES } from '../scripts/test-count.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

// Oct 31 (review): README 2.8 and build/README.md said 236 tests when `npm test`
// printed 245. The count is now written by `npm run log` between markers, and
// this test fails when either file's stated count differs from what the suite
// reports. While the suite is being counted (the inner run), this test does
// not count it again.
test('the test count the README and build/README.md state is the count `npm test` reports', { skip: process.env[COUNTING_ENV] ? 'inner run, counting' : false }, () => {
  const live = countTests(here);
  assert.ok(live > 200, `the suite reports ${live} tests`);
  for (const f of TEST_COUNT_FILES) {
    const stated = statedTestCount(readFileSync(join(root, f), 'utf8'));
    assert.equal(stated, live, `${f} states ${stated} tests; npm test reports ${live}. Run npm run log.`);
  }
});

test('the stated count is read from between the markers, and a file without them has none', () => {
  assert.equal(statedTestCount('`npm test` runs the suite (<!-- test-count:start -->256<!-- test-count:end --> tests).'), 256);
  assert.equal(statedTestCount('`npm test` runs the suite (236 tests).'), null);
});
