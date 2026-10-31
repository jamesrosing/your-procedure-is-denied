// Verifies the built viewer in headless Chromium, the way a judge's browser
// would see it, instead of by reading the source: serves viewer/ on a local
// port, opens the page with playwright-core on the Chromium that Playwright
// installs, and fails on any console error or page error. Checks: the compare
// tab lays out three columns for every case; a repaired case shows the repair
// banner at the repair step and a re-stamped sentence at the verdict; the
// model's why types out under the chart header on a read. Writes frames to
// --out (default the system temp directory) so a reader can look at them.
// `npm run viewer:check` after `npm run viewer`.
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { buildTimeline, type ResultsFile, type ViewerCase } from '../viewer/src/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const viewer = join(here, '..', 'viewer');
const { values } = parseArgs({ options: { out: { type: 'string' }, port: { type: 'string', default: '8791' } } });
const out = values.out ?? join(tmpdir(), 'ypid-viewer-check');
mkdirSync(out, { recursive: true });
const port = Number(values.port);

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`server did not answer at ${url}`);
}

async function main(): Promise<void> {
  const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', viewer], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/`;
  const problems: string[] = [];
  try {
    await waitForServer(`${base}data/index.json`);
    const manifest = JSON.parse(readFileSync(join(viewer, 'data', 'index.json'), 'utf8')) as { results: { file: string; group?: string; model: string; repair?: number; live?: boolean }[] };
    const cases = JSON.parse(readFileSync(join(viewer, 'data', 'cases.json'), 'utf8')) as ViewerCase[];
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'no-preference' });
    page.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
    page.on('pageerror', e => problems.push(`page error: ${e.message}`));
    const go = async (hash: string): Promise<void> => {
      await page.goto(`${base}#${hash}`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelectorAll('#entries .entry').length > 0 || !document.getElementById('stage')!.hidden === false, null, { timeout: 10_000 });
    };

    // 1. The compare tab, every case: three columns, no errors.
    const kept = manifest.results.filter(m => (m.group ?? 'kept') === 'kept' && m.live);
    const keptFile = kept.find(m => m.model === 'muse-spark-1.3')?.file ?? kept[0]!.file;
    let compared = 0;
    for (const c of cases) {
      await go(`file=${encodeURIComponent(keptFile)}&case=${c.id}&view=compare`);
      await page.waitForFunction(() => document.querySelectorAll('#compare .col').length === 3, null, { timeout: 10_000 }).catch(() => problems.push(`compare: ${c.id} did not lay out three columns`));
      const head = await page.textContent('#compare-case');
      if (!head?.includes(c.id)) problems.push(`compare: ${c.id} header reads ${head}`);
      compared++;
    }
    await go(`file=${encodeURIComponent(keptFile)}&case=case-001&view=compare`);
    await page.waitForFunction(() => document.querySelectorAll('#compare .col').length === 3, null, { timeout: 10_000 });
    await page.screenshot({ path: join(out, 'compare-case-001.png'), fullPage: true });

    // 2. A repaired case: the banner at the repair step, the re-stamp at the verdict.
    const repairRuns = manifest.results.filter(m => m.group === 'repair');
    let repairedShown = 0;
    for (const m of repairRuns) {
      const file = JSON.parse(readFileSync(join(viewer, 'data', 'results', m.file), 'utf8')) as ResultsFile;
      const repaired = file.results.filter(r => r.firstGate && (r.repairs?.length ?? 0) > 0);
      for (const r of repaired) {
        const c = cases.find(x => x.id === r.caseId)!;
        const steps = buildTimeline(r, c);
        const repairAt = steps.findIndex(s => s.kind === 'repair');
        await go(`file=${encodeURIComponent(m.file)}&case=${r.caseId}&step=${repairAt + 1}`);
        await page.waitForSelector('#verdict[data-verdict="repair"]', { timeout: 10_000 }).catch(() => problems.push(`repair: ${m.file} ${r.caseId} shows no repair banner at step ${repairAt + 1}`));
        if (repairedShown === 0) await page.screenshot({ path: join(out, `repair-${r.caseId}-banner.png`), fullPage: true });
        await go(`file=${encodeURIComponent(m.file)}&case=${r.caseId}&step=end`);
        await page.waitForSelector('#verdict .after-repair', { timeout: 10_000 }).catch(() => problems.push(`repair: ${m.file} ${r.caseId} verdict does not say after repair`));
        const restamped = await page.locator('.sentence.restamped').count();
        const expectRestamp = steps.some(s => s.kind === 'sentence' && s.previous);
        if (expectRestamp && restamped === 0) problems.push(`repair: ${m.file} ${r.caseId} has no re-stamped sentence at the verdict`);
        if (repairedShown === 0) await page.screenshot({ path: join(out, `repair-${r.caseId}-verdict.png`), fullPage: true });
        repairedShown++;
      }
    }

    // 3. The why: on a read step of a run that carries it, the line is visible and typed.
    const whyRun = repairRuns.find(m => m.model === 'muse-spark-1.3') ?? repairRuns[0];
    if (whyRun) {
      const file = JSON.parse(readFileSync(join(viewer, 'data', 'results', whyRun.file), 'utf8')) as ResultsFile;
      const r = file.results.find(x => x.caseId === 'case-001')!;
      const steps = buildTimeline(r, cases.find(x => x.id === 'case-001')!);
      const readAt = steps.findIndex(s => s.kind === 'read' && s.why);
      await go(`file=${encodeURIComponent(whyRun.file)}&case=case-001&step=${readAt + 1}`);
      await page.waitForSelector('#chart-why:not([hidden])', { timeout: 10_000 }).catch(() => problems.push('why: the chart-why line did not show on a read step'));
      const step = steps[readAt];
      const expected = step && step.kind === 'read' ? step.why ?? '' : '';
      await page.waitForFunction((txt: string) => (document.getElementById('chart-why')?.textContent ?? '').includes(txt), expected, { timeout: 15_000 }).catch(() => problems.push(`why: the typed text never reached "${expected.slice(0, 40)}"`));
      await page.screenshot({ path: join(out, 'why-case-001.png'), fullPage: false });
    }

    // 4. The scoreboard and the default landing still work.
    await page.goto(base, { waitUntil: 'load' });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('#entries .entry').length > 0, null, { timeout: 10_000 });
    await page.keyboard.press('s');
    await page.waitForFunction(() => document.querySelectorAll('#board-table tr').length >= 10, null, { timeout: 10_000 }).catch(() => problems.push('scoreboard: fewer than nine rows'));
    const boardRows = await page.locator('#board-table tr').count();
    await browser.close();
    console.log(`compare: ${compared} cases laid out; repaired cases shown: ${repairedShown}; scoreboard rows (with header): ${boardRows}; frames in ${out}`);
  } finally {
    server.kill();
  }
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log('viewer check: no console errors, no page errors');
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
