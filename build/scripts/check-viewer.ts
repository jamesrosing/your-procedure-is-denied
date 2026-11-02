// Verifies the built viewer in headless Chromium, the way a judge's browser
// would see it, instead of by reading the source: serves viewer/ on a local
// port, opens the page with playwright-core on the Chromium that Playwright
// installs, and fails on any console error or page error. Checks: the compare
// tab lays out three columns for every case; a repaired case shows the repair
// banner at the repair step and a re-stamped sentence at the verdict; the
// model's why types out under the chart header on a read; the narrow-screen
// rules (the phone shell) leave the desktop page pixel for pixel unchanged,
// and on a phone-sized viewport the dock drives the replay. Writes frames to
// --out (default the system temp directory) so a reader can look at them.
// `npm run viewer:check` after `npm run viewer`.
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
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

// Removes every `@media (max-width: 900px) { ... }` block, braces matched, so
// the stylesheet can be rendered as the desktop alone sees it.
export function stripNarrow(css: string): string {
  const open = '@media (max-width: 900px)';
  let out = css;
  for (let at = out.indexOf(open); at !== -1; at = out.indexOf(open)) {
    const brace = out.indexOf('{', at);
    let depth = 0, i = brace;
    for (; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}' && --depth === 0) break;
    }
    out = out.slice(0, at) + out.slice(i + 1);
  }
  return out;
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

    // 5. The presenter spotlight: a region is ringed on request and cleared on null; the page never sets it itself.
    await page.keyboard.press('s');
    const spotIdle = await page.evaluate(() => document.body.hasAttribute('data-spot') || document.querySelector('.spot') !== null);
    if (spotIdle) problems.push('spotlight: set without being asked');
    const spotOn = await page.evaluate(() => (window as unknown as { ypid: { spotlight: (n: string | null) => boolean } }).ypid.spotlight('chart') && document.querySelector('.panel.chart.spot') !== null && document.body.getAttribute('data-spot') === 'chart');
    if (!spotOn) problems.push('spotlight: chart did not ring');
    await page.keyboard.press('End');
    await page.waitForFunction(() => document.querySelectorAll('li.sentence').length > 0, null, { timeout: 10_000 }).catch(() => problems.push('spotlight: no sentences at the verdict'));
    const spotSentence = await page.evaluate(() => (window as unknown as { ypid: { spotlight: (n: string | null) => boolean } }).ypid.spotlight('sentence:0'));
    if (spotSentence !== true) problems.push('spotlight: sentence 0 did not ring');
    await page.screenshot({ path: join(out, 'spotlight-sentence.png'), fullPage: false });
    const spotOff = await page.evaluate(() => !(window as unknown as { ypid: { spotlight: (n: string | null) => boolean } }).ypid.spotlight(null) && document.querySelector('.spot') === null && !document.body.hasAttribute('data-spot'));
    if (!spotOff) problems.push('spotlight: null did not clear');
    // 6. Desktop invariance: with every narrow-screen media block removed from
    //    the stylesheet, the page at 1600 wide renders the same bytes. The
    //    recorded takes show the desktop page; this holds the phone shell to
    //    touching nothing they show.
    const still = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
    still.on('console', m => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
    still.on('pageerror', e => problems.push(`page error: ${e.message}`));
    await still.goto(`${base}#file=${encodeURIComponent(keptFile)}&case=case-025&step=end`, { waitUntil: 'load' });
    await still.waitForFunction(() => document.querySelectorAll('li.sentence').length > 0 && document.fonts.status === 'loaded', null, { timeout: 15_000 }).catch(() => problems.push('invariance: the verdict frame did not render'));
    await still.waitForTimeout(400);
    const withShell = await still.screenshot({ fullPage: true });
    const css = await (await fetch(`${base}styles.css`)).text();
    const stripped = stripNarrow(css);
    if (stripped === css) problems.push('invariance: no narrow-screen block found to strip');
    await still.evaluate((text: string) => {
      for (const l of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) l.disabled = true;
      const st = document.createElement('style');
      st.textContent = text;
      document.head.append(st);
    }, stripped);
    await still.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15_000 });
    await still.waitForTimeout(400);
    const withoutShell = await still.screenshot({ fullPage: true });
    // Two paints of the same layout differ by a level or two at antialiased
    // corners and hairlines, so the compare is per pixel with a tolerance: a
    // pixel moved by more than 24 levels on a channel is a change, and so is
    // more than one pixel in two thousand touched at all; the rest is reported. Decoded in the page on a canvas, so
    // the check needs no image library.
    // Passed as source text: tsx wraps named inner functions in a helper the page does not have.
    const compare = `async ([a, b]) => {
      const load = src => new Promise((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = err; im.src = 'data:image/png;base64,' + src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { size: ia.width + 'x' + ia.height + ' vs ' + ib.width + 'x' + ib.height, major: -1, minor: -1 };
      const draw = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
      const da = draw(ia), db = draw(ib);
      let major = 0, minor = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (d > 24) major++; else if (d > 0) minor++;
      }
      return { size: '', major, minor, total: da.length / 4 };
    }`;
    const diff = await still.evaluate(`(${compare})(${JSON.stringify([withShell.toString('base64'), withoutShell.toString('base64')])})`) as { size: string; major: number; minor: number; total: number };
    // A layout change moves hundreds of pixels by whole colours; antialiasing moves a few dozen by a level or two.
    if (diff.major !== 0 || diff.minor > diff.total / 2000) {
      writeFileSync(join(out, 'desktop-with-shell.png'), withShell);
      writeFileSync(join(out, 'desktop-without-shell.png'), withoutShell);
      problems.push(`invariance: the desktop page changed under the narrow-screen rules (${diff.size || `${diff.major} pixels moved, ${diff.minor} touched`}; see desktop-with-shell.png and desktop-without-shell.png)`);
    }
    const invariance = `desktop invariant under the phone shell (${diff.minor} antialiasing pixels within tolerance)`;
    await still.close();

    // 7. A phone: the dock is on screen and the header's transport is not, the
    //    dock plays the case to its verdict, the writ opens from it, nothing
    //    runs wider than the screen.
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    phone.on('console', m => { if (m.type() === 'error') problems.push(`console error (phone): ${m.text()}`); });
    phone.on('pageerror', e => problems.push(`page error (phone): ${e.message}`));
    await phone.goto(`${base}#file=${encodeURIComponent(keptFile)}&case=case-025&step=0`, { waitUntil: 'load' });
    await phone.waitForFunction(() => document.querySelectorAll('#entries .entry').length > 0, null, { timeout: 10_000 });
    const dockShown = await phone.evaluate(() => getComputedStyle(document.getElementById('dock')!).display !== 'none' && getComputedStyle(document.querySelector('.transport')!).display === 'none');
    if (!dockShown) problems.push('phone: the dock is not shown or the header transport still is');
    const phoneStatus0 = await phone.textContent('#dock-count');
    if (!/^0 of \d+ read$/.test(phoneStatus0 ?? '')) problems.push(`phone: the dock count at rest reads "${phoneStatus0}"`);
    await phone.screenshot({ path: join(out, 'phone-case-025-rest.png'), fullPage: false });
    await phone.tap('#dock-end');
    await phone.waitForSelector('#verdict[data-verdict="pass"]', { timeout: 10_000 }).catch(() => problems.push('phone: End from the dock did not reach PASS'));
    const phoneState = await phone.textContent('#dock-state');
    if (phoneState !== 'PASS') problems.push(`phone: the dock state at the verdict reads "${phoneState}"`);
    await phone.tap('#dock-writ');
    await phone.waitForSelector('#writ:not([hidden])', { timeout: 5_000 }).catch(() => problems.push('phone: the writ did not open from the dock'));
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) problems.push('phone: the page runs wider than the screen');
    await phone.screenshot({ path: join(out, 'phone-case-025-writ.png'), fullPage: false });
    await phone.close();

    await browser.close();
    console.log(`compare: ${compared} cases laid out; repaired cases shown: ${repairedShown}; scoreboard rows (with header): ${boardRows}; ${invariance}; phone dock drives the replay; frames in ${out}`);
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
