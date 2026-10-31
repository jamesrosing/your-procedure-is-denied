// The denial as it arrives: each of the fifty synthetic denials rendered as a
// one-page remittance letter image, so the intake step (src/intake.ts) can be
// measured on the document a practice actually receives. Everything on the
// page is a pure function of the case file: a fictional payer letterhead, the
// patient alias (no name, no date of birth, no member, subscriber, or claim
// number, because the synthetic set issues none), one claim line with the code,
// the dates of service and the billed amount, the CARC code and text, the RARC
// where there is one, the payer's remark, and an appeal-rights paragraph with
// the payer's own appeal window. The HTML is rendered to PNG at 1275 by 1650
// px (letter size at 150 dpi) by Playwright's Chromium through playwright-core,
// a plain JavaScript package; nothing native is added. The images are committed
// with a manifest of hashes, and a test regenerates the HTML (always) and two
// of the images (where that Chromium is installed) and compares the bytes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PAYERS } from './content.js';
import type { SyntheticCase } from './types.js';
import { generateCases, SEED } from './generate.js';

export const LETTER_WIDTH = 1275;
export const LETTER_HEIGHT = 1650;
const FONTS = '"DejaVu Serif", "DejaVu Sans", "DejaVu Sans Mono"';

// The fields the letter states and the intake must read back; the case file is the truth.
export interface LetterFields {
  carc: string;
  remark: string;
  dateOfService: string;
  serviceEnd: string | null;
  code: string;
  codeSystem: string;
  billedUsd: number;
  payerName: string;
}

export function payerRemark(c: SyntheticCase): string {
  return /Payer remark:\s*(.+)$/s.exec(c.denial.text)?.[1]?.trim() ?? '';
}

export function rarcText(c: SyntheticCase): string | null {
  if (!c.denial.rarc) return null;
  const m = new RegExp(`RARC ${c.denial.rarc}:\\s*(.+?)\\s*Payer remark:`, 's').exec(c.denial.text);
  return m?.[1]?.trim() ?? null;
}

export function letterFields(c: SyntheticCase): LetterFields {
  return {
    carc: c.denial.carc,
    remark: payerRemark(c),
    dateOfService: c.denial.dateOfService,
    serviceEnd: c.denial.serviceEnd ?? null,
    code: c.procedure.code,
    codeSystem: c.procedure.codeSystem,
    billedUsd: c.stakesUsd,
    payerName: c.payer.name,
  };
}

// The date on the notice: three weeks after the last date of service, in UTC,
// so it is a function of the case and not of the clock.
export function remittanceDate(c: SyntheticCase): string {
  const last = c.denial.serviceEnd ?? c.denial.dateOfService;
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 21);
  return d.toISOString().slice(0, 10);
}

const usd = (n: number): string => `$${n.toLocaleString('en-US')}.00`;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function letterHtml(c: SyntheticCase): string {
  const payer = PAYERS.find(p => p.name === c.payer.name);
  const appealDays = payer?.appealDays ?? 60;
  const dates = c.denial.serviceEnd ? `${c.denial.dateOfService} to ${c.denial.serviceEnd}` : c.denial.dateOfService;
  const rarc = rarcText(c);
  const remark = payerRemark(c);
  const noticeDate = remittanceDate(c);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(c.payer.name)} remittance advice, ${esc(c.id)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${LETTER_WIDTH}px; height: ${LETTER_HEIGHT}px; overflow: hidden; font-family: ${FONTS}, serif; font-size: 19px; line-height: 1.45; color: #1b1f23; -webkit-font-smoothing: antialiased; }
  .page { box-sizing: border-box; width: ${LETTER_WIDTH}px; height: ${LETTER_HEIGHT}px; padding: 92px 108px 80px; position: relative; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1b1f23; padding-bottom: 14px; }
  .payer { font-family: "DejaVu Sans", sans-serif; font-size: 34px; font-weight: bold; letter-spacing: -0.01em; }
  .plan { font-family: "DejaVu Sans", sans-serif; font-size: 16px; color: #4a525b; margin-top: 4px; }
  .dept { font-family: "DejaVu Sans", sans-serif; font-size: 14px; color: #4a525b; text-align: right; line-height: 1.5; }
  .title { font-family: "DejaVu Sans", sans-serif; font-size: 24px; font-weight: bold; margin: 34px 0 6px; }
  .meta { font-size: 17px; color: #2d3338; margin: 0 0 22px; }
  .meta b { font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 24px; font-size: 16.5px; }
  th { font-family: "DejaVu Sans", sans-serif; font-size: 13px; text-align: left; color: #4a525b; border-bottom: 2px solid #1b1f23; padding: 6px 8px; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 10px 8px; border-bottom: 1px solid #cdd3d9; vertical-align: top; }
  td.num, th.num { text-align: right; font-family: "DejaVu Sans Mono", monospace; }
  .code { font-family: "DejaVu Sans Mono", monospace; }
  h2 { font-family: "DejaVu Sans", sans-serif; font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #4a525b; margin: 26px 0 6px; }
  p { margin: 0 0 12px; }
  .remark { padding: 12px 16px; border-left: 4px solid #1b1f23; background: #f2f4f6; }
  .foot { position: absolute; left: 108px; right: 108px; bottom: 54px; border-top: 1px solid #cdd3d9; padding-top: 10px; font-family: "DejaVu Sans", sans-serif; font-size: 12.5px; color: #6b747d; line-height: 1.5; }
</style></head>
<body><div class="page">
  <div class="head">
    <div><div class="payer">${esc(c.payer.name)}</div><div class="plan">${esc(c.payer.planType)}</div></div>
    <div class="dept">Claims Department, Provider Remittance<br>Notice date ${noticeDate}<br>Notice ${esc(c.id)} of a synthetic benchmark set</div>
  </div>
  <div class="title">Remittance advice and notice of claim denial</div>
  <p class="meta"><b>Patient:</b> ${esc(c.patient.alias)}, ${c.patient.age} year old ${esc(c.patient.sex)}. <b>Rendering provider:</b> the treating physician's practice. <b>Setting:</b> ${esc(c.setting)}.</p>
  <table>
    <thead><tr><th>Line</th><th>Service</th><th>Code</th><th>Dates of service</th><th class="num">Billed</th><th class="num">Allowed</th><th>Reason</th></tr></thead>
    <tbody><tr>
      <td>1</td>
      <td>${esc(c.procedure.description)}</td>
      <td class="code">${esc(c.procedure.codeSystem)} ${esc(c.procedure.code)}</td>
      <td class="code">${esc(dates)}</td>
      <td class="num">${usd(c.stakesUsd)}</td>
      <td class="num">$0.00</td>
      <td class="code">CARC ${esc(c.denial.carc)}${c.denial.rarc ? `<br>RARC ${esc(c.denial.rarc)}` : ''}</td>
    </tr></tbody>
  </table>
  <h2>Adjustment reason</h2>
  <p><span class="code">CARC ${esc(c.denial.carc)}</span>: ${esc(c.denial.carcText)}${rarc ? ` <span class="code">RARC ${esc(c.denial.rarc ?? '')}</span>: ${esc(rarc)}` : ''}</p>
  <h2>Reviewer's remark</h2>
  <p class="remark">${esc(remark)}</p>
  <h2>Your appeal rights</h2>
  <p>You have the right to appeal this determination. A written appeal must be received within ${appealDays} days of the date of this notice and should state why the service met the plan's coverage criteria in force on the date of service, with the clinical record attached. The physician who rendered the service may also request a peer-to-peer discussion with the plan's medical director before the appeal deadline. An appeal does not change the claim's timely filing status. If the determination is upheld, the notice of that decision will explain any further level of review available under the plan.</p>
  <p>Total billed ${usd(c.stakesUsd)}; total allowed $0.00; patient responsibility is determined by the plan document and is not stated on this notice.</p>
  <div class="foot">Synthetic data for a benchmark. ${esc(c.payer.name)} is a fictional plan; the patient is an alias with an age and a sex only. No member, subscriber, or claim identifiers are issued in this set, and no real person, provider, or plan is described.</div>
</div></body></html>
`;
}

// PNG dimensions from the IHDR chunk, for the test and the manifest.
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// Playwright's own Chromium, if its install is present; the package downloads
// nothing by itself, and the test skips without it.
export function chromiumExecutable(): string | null {
  try {
    const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof import('playwright-core');
    const p = chromium.executablePath();
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

export interface LetterManifest {
  renderer: string;
  fonts: string;
  width: number;
  height: number;
  letters: Record<string, { html: string; png: string; bytes: number }>;
}

// Renders the letters to PNG bytes, one page each, with a single browser. The
// viewport is the page, the scale is 1, animations are off, and the fonts are
// awaited, so the same machine renders the same bytes every time.
export async function renderLetters(cases: SyntheticCase[]): Promise<Map<string, Buffer>> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--font-render-hinting=none', '--disable-lcd-text', '--disable-gpu'] });
  const out = new Map<string, Buffer>();
  try {
    const page = await browser.newPage({ viewport: { width: LETTER_WIDTH, height: LETTER_HEIGHT }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    for (const c of cases) {
      await page.setContent(letterHtml(c), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled', caret: 'hide', scale: 'css' });
      const size = pngSize(png);
      if (size.width !== LETTER_WIDTH || size.height !== LETTER_HEIGHT) throw new Error(`${c.id}: rendered ${size.width} by ${size.height}`);
      out.set(c.id, png);
    }
  } finally {
    await browser.close();
  }
  return out;
}

export async function rendererName(): Promise<string> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ headless: true });
  try { return `playwright-core, Chromium ${browser.version()}`; } finally { await browser.close(); }
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, '..', '..', 'synthetic', 'letters');
  mkdirSync(dir, { recursive: true });
  const cases = generateCases(SEED);
  const started = Date.now();
  const rendered = await renderLetters(cases);
  const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
  const manifest: LetterManifest = { renderer: await rendererName(), fonts: FONTS, width: LETTER_WIDTH, height: LETTER_HEIGHT, letters: {} };
  for (const c of cases) {
    const png = rendered.get(c.id)!;
    writeFileSync(join(dir, `${c.id}.png`), png);
    manifest.letters[c.id] = { html: sha(letterHtml(c)), png: sha(png), bytes: png.length };
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const total = [...rendered.values()].reduce((n, b) => n + b.length, 0);
  console.log(`wrote ${rendered.size} letters to ${dir} (${(total / 1024).toFixed(0)} KB) in ${((Date.now() - started) / 1000).toFixed(1)} s; ${manifest.renderer}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
