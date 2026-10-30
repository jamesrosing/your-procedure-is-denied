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

// The kept physician-side runs, then the payer-side runs of README Table 4
// (results/payer/), which the page lists last in the picker and keeps off the
// scoreboard. Repeat runs (results/repeats/) are not shown.
const resultsDir = join(root, 'results');
const listed = [
  ...readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort().map(f => ({ dir: resultsDir, f })),
  ...(existsSync(join(resultsDir, 'payer')) ? readdirSync(join(resultsDir, 'payer')).filter(f => f.endsWith('.json')).sort().map(f => ({ dir: join(resultsDir, 'payer'), f })) : []),
];
const results = listed.map(({ dir, f }) => {
  cpSync(join(dir, f), join(data, 'results', f));
  const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
    run: { provider: string; model: string; effort: string; startedAt: string; cases: number; agentic?: boolean; side?: 'payer' };
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
    ...(parsed.run.side === 'payer' ? { side: 'payer' as const } : {}),
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
