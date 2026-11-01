// The test count the documents state, taken from the suite itself. `npm run log`
// writes it between markers in README.md (2.8 Reproducibility) and
// build/README.md; tests/test-count.test.ts fails when a stated count differs.
// The count comes from running the suite in a child process and reading the
// TAP summary, so it is the number `npm test` prints, not a count of `test(`
// calls. The inner run is marked with an environment variable so the count
// test does not count the suite again from inside it.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const COUNTING_ENV = 'LITMUS_COUNTING_TESTS';
export const TEST_COUNT_FILES = ['README.md', 'build/README.md'] as const;
const START = '<!-- test-count:start -->';
const END = '<!-- test-count:end -->';
const MARKED = /<!-- test-count:start -->(\d+)<!-- test-count:end -->/;

// Runs the suite from the given build/tests directory and returns the `# tests` total.
export function countTests(testsDir: string): number {
  const buildDir = join(testsDir, '..');
  // node:test marks its own child processes with NODE_TEST_CONTEXT and refuses
  // to run a suite from inside one; this run is a separate suite by design.
  const env: NodeJS.ProcessEnv = { ...process.env, [COUNTING_ENV]: '1' };
  delete env['NODE_TEST_CONTEXT'];
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', 'tests/*.test.ts'], { cwd: buildDir, encoding: 'utf8', env, shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  const m = /^# tests (\d+)$/m.exec(r.stdout ?? '');
  if (!m) throw new Error(`npm test printed no "# tests" line${r.stderr ? `: ${r.stderr.slice(0, 400)}` : ''}`);
  return Number(m[1]);
}

export function statedTestCount(text: string): number | null {
  const m = MARKED.exec(text);
  return m ? Number(m[1]) : null;
}

export function withTestCount(text: string, count: number): string {
  if (!MARKED.test(text)) throw new Error('no test-count markers in the text');
  return text.replace(MARKED, `${START}${count}${END}`);
}
