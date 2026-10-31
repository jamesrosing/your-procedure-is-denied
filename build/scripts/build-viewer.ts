// Builds the static viewer: copies every results file and the synthetic
// cases into viewer/data/, writes the manifest the page reads, and bundles
// viewer/src/main.ts into one app.js. No server, no framework. viewer/data
// and viewer/app.js are build output and are not committed.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const viewer = join(root, 'viewer');
const data = join(viewer, 'data');

rmSync(data, { recursive: true, force: true });
mkdirSync(join(data, 'results'), { recursive: true });

// The kept physician-side runs (results/, group kept: Table 1, the scoreboard,
// the compare tab), then the post hoc directories the page lists last in the
// picker, labeled, and keeps off the scoreboard: the payer-side runs of Table 4
// (results/payer/), the repair-turn runs of Table 5 (results/repair/), and the
// effort sweep of Table 6 (results/effort/). Repeat runs (results/repeats/) and
// the intake run (results/intake/) are not shown.
const resultsDir = join(root, 'results');
type Group = 'kept' | 'payer' | 'repair' | 'effort';
const sub = (name: Group): { dir: string; f: string; group: Group }[] => {
  const dir = name === 'kept' ? resultsDir : join(resultsDir, name);
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ dir, f, group: name })) : [];
};
const listed = [...sub('kept'), ...sub('payer'), ...sub('repair'), ...sub('effort')];
const results = listed.map(({ dir, f, group }) => {
  cpSync(join(dir, f), join(data, 'results', f));
  const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
    run: { provider: string; model: string; effort: string; startedAt: string; cases: number; agentic?: boolean; side?: 'payer'; repair?: number };
    results: { trace?: { live?: boolean }[] }[];
  };
  return {
    file: f,
    provider: parsed.run.provider,
    model: parsed.run.model,
    effort: parsed.run.effort,
    startedAt: parsed.run.startedAt,
    cases: parsed.run.cases,
    agentic: parsed.run.agentic === true || parsed.results.some(r => (r.trace?.length ?? 0) > 0),
    live: parsed.results.some(r => (r.trace ?? []).some(t => t.live === true)),
    group,
    ...(parsed.run.side === 'payer' ? { side: 'payer' as const } : {}),
    ...(parsed.run.repair ? { repair: parsed.run.repair } : {}),
  };
});

const casesDir = join(root, 'synthetic', 'cases');
const cases = readdirSync(casesDir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(casesDir, f), 'utf8')) as unknown);
writeFileSync(join(data, 'cases.json'), JSON.stringify(cases));
writeFileSync(join(data, 'index.json'), JSON.stringify({ results, cases: 'cases.json', builtAt: new Date().toISOString() }, null, 2));

await build({
  entryPoints: [join(viewer, 'src', 'main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: join(viewer, 'app.js'),
  sourcemap: false,
  minify: false,
  logLevel: 'warning',
});

console.error(`viewer built: ${results.length} results file(s), ${cases.length} cases, app.js`);
