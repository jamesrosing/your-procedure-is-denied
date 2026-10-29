import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isAbsolute, join, resolve } from 'node:path';
import { resolveOutDir, resultFileName } from '../src/harness.js';

describe('harness output location', () => {
  test('without --out-dir, results land in build/results next to the source', () => {
    const here = '/repo/build/src';
    assert.equal(resolveOutDir(here, undefined), join(here, '..', 'results'));
  });

  test('a relative --out-dir is resolved against the working directory', () => {
    const got = resolveOutDir('/repo/build/src', 'results/repeats');
    assert.equal(got, resolve(process.cwd(), 'results/repeats'));
    assert.ok(isAbsolute(got));
  });

  test('an absolute --out-dir is kept as given', () => {
    assert.equal(resolveOutDir('/repo/build/src', '/tmp/elsewhere'), '/tmp/elsewhere');
  });

  test('the result file name carries label, model, effort, mode flags, and the start stamp', () => {
    const name = resultFileName({ label: 'baseten', model: 'meta-models/muse-spark-open-1026', effort: 'low', agentic: true, chart: true, startedAt: '2026-10-28T07:13:57.225Z' });
    assert.equal(name, 'baseten-meta-models_muse-spark-open-1026-low-agentic-chart-2026-10-28T07-13-57-225Z.json');
  });

  test('a prompt-chart run has neither mode flag in its name', () => {
    const name = resultFileName({ label: 'meta', model: 'muse-spark-1.3', effort: 'low', agentic: false, chart: false, startedAt: '2026-10-27T08:17:14.218Z' });
    assert.equal(name, 'meta-muse-spark-1.3-low-2026-10-27T08-17-14-218Z.json');
  });
});
