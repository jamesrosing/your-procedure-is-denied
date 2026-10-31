// Dictation: the physician's spoken words as a chart entry. Given an audio
// file, a case id, and an entry id, this transcribes the recording with Muse
// Voice Transcribe through the Meta Model API (POST /v1/asr/transcribe,
// multipart: a JSON settings part and the WAV; dev.meta.ai docs, speech to
// text, read Oct 31, 2026), writes the transcript as that entry's text into a
// copy of the case under build/synthetic/dictated/, and runs the primary
// configuration (muse-spark-1.3, agentic, live CHART, --verbose) on that one
// case. The entry is then the physician's spoken words, so every quote the
// gate verifies against it is a quote of speech. Nothing clinical is judged
// here; the transcript is text, and the gate holds the draft to it as it holds
// a draft to any entry. The recording is Jim's to make: this stops with a
// clear error naming the file it needs, and prints the command to run once
// the file exists.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadCases, runCase, selectProvider, summarize, resultFileName } from './harness.js';
import { POLICY_STATUS_TOOL, policyStatusExecutor } from './chart.js';
import { LITMUS_VERSION } from './litmus.js';
import type { SyntheticCase } from './synthetic/types.js';

export const TRANSCRIBE_URL = 'https://api.meta.ai/v1/asr/transcribe';
export const TRANSCRIBE_MODEL = 'muse-voice-transcribe-1.0';
export const DEFAULT_AUDIO = 'assets/audio/case-001-note-013.wav';

// --- the WAV the endpoint accepts: RIFF/WAVE, mono, 16-bit PCM, 16 or 24 kHz, at most 10 minutes
export type WavInfo = { ok: true; channels: number; sampleRate: number; bits: number; durationMs: number } | { ok: false; reason: string };

export function wavInfo(b: Buffer): WavInfo {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return { ok: false, reason: 'not a RIFF/WAVE file' };
  // Walk the chunks for fmt and data.
  let at = 12;
  let fmt: { channels: number; sampleRate: number; bits: number; format: number } | null = null;
  let dataBytes = 0;
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === 'fmt ' && at + 24 <= b.length) fmt = { format: b.readUInt16LE(at + 8), channels: b.readUInt16LE(at + 10), sampleRate: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22) };
    if (id === 'data') { dataBytes = Math.min(size, b.length - at - 8); break; }
    at += 8 + size + (size % 2);
  }
  if (!fmt) return { ok: false, reason: 'no fmt chunk in the WAV' };
  const problems: string[] = [];
  if (fmt.format !== 1) problems.push('must be integer PCM');
  if (fmt.channels !== 1) problems.push('must be mono');
  if (fmt.bits !== 16) problems.push('must be 16-bit');
  if (fmt.sampleRate !== 16000 && fmt.sampleRate !== 24000) problems.push('must be 16 kHz or 24 kHz');
  const durationMs = fmt.sampleRate > 0 ? Math.round((dataBytes / (fmt.channels * (fmt.bits / 8))) / fmt.sampleRate * 1000) : 0;
  if (durationMs > 10 * 60 * 1000) problems.push('must be 10 minutes or less');
  if (problems.length) return { ok: false, reason: `the WAV ${problems.join(', ')} (ffmpeg -i in.wav -ac 1 -ar 24000 -c:a pcm_s16le out.wav)` };
  return { ok: true, channels: fmt.channels, sampleRate: fmt.sampleRate, bits: fmt.bits, durationMs };
}

// --- the request, as the docs describe it: multipart with `request` (JSON) and `audio` (WAV)
export interface TranscribeSettings { model: string; mode: 'PUSH_TO_TALK' | 'ENDPOINTING'; audioEncoding: 'WAV'; languageBias: string[] }

export function transcribeRequestParts(wav: Buffer, name: string): { url: string; settings: TranscribeSettings; form: FormData } {
  const settings: TranscribeSettings = { model: TRANSCRIBE_MODEL, mode: 'ENDPOINTING', audioEncoding: 'WAV', languageBias: ['English'] };
  const form = new FormData();
  form.set('request', new Blob([JSON.stringify(settings)], { type: 'application/json' }));
  form.set('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), name);
  return { url: TRANSCRIBE_URL, settings, form };
}

export interface Transcript { transcript: string; sessionId?: string; audioDurationMs?: number; turns?: { turnId?: number; startMs?: number; endMs?: number; transcript?: string; speaker?: string }[] }

export async function transcribe(wav: Buffer, name: string, apiKey: string, doFetch: typeof fetch = fetch): Promise<Transcript> {
  const { url, form } = transcribeRequestParts(wav, name);
  const res = await doFetch(url, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' }, body: form });
  if (!res.ok) throw new Error(`transcription returned HTTP ${res.status}${res.status === 400 ? ' (the audio is not a supported WAV, or is over 10 minutes)' : res.status === 429 ? ' (rate limited; retry later)' : ''}`);
  const body = (await res.json()) as Transcript;
  if (typeof body.transcript !== 'string') throw new Error('transcription answered without a transcript field');
  return body;
}

// --- the dictated copy of the case
export interface DictatedCase extends SyntheticCase {
  dictated: { entryId: string; audio: string; model: string; audioDurationMs: number; transcribedAt: string; original: string };
}

export function dictatedCase(c: SyntheticCase, entryId: string, transcript: string, meta: { audio: string; model: string; audioDurationMs: number; transcribedAt: string }): DictatedCase {
  const entry = c.chart.find(e => e.id === entryId);
  if (!entry) throw new Error(`${c.id} has no entry ${entryId}`);
  const text = transcript.replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('the transcript is empty');
  return {
    ...c,
    chart: c.chart.map(e => (e.id === entryId ? { ...e, text } : e)),
    dictated: { entryId, ...meta, original: entry.text },
  };
}

export function dictationCommand(audio: string, caseId: string, entryId: string): string {
  const rel = audio.startsWith('assets/') ? `../${audio}` : audio;
  return `npm run dictate -- --audio ${rel} --case ${caseId} --entry ${entryId}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { audio: { type: 'string', default: `../${DEFAULT_AUDIO}` }, case: { type: 'string', default: 'case-001' }, entry: { type: 'string', default: 'note-013' }, model: { type: 'string', default: 'muse-spark-1.3' }, 'no-run': { type: 'boolean', default: false }, 'out-dir': { type: 'string' } } });
  const here = dirname(fileURLToPath(import.meta.url));
  const audioPath = resolve(values.audio!);
  const caseId = values.case!;
  const entryId = values.entry!;
  const cases = loadCases(join(here, '..', 'synthetic', 'cases'));
  const c = cases.find(x => x.id === caseId);
  if (!c) throw new Error(`no case ${caseId} in synthetic/cases`);
  if (!c.chart.some(e => e.id === entryId)) throw new Error(`${caseId} has no entry ${entryId}`);
  if (!existsSync(audioPath)) {
    console.error(`The recording is needed at this point and is not there: ${audioPath}`);
    console.error(`Record ${entryId} of ${caseId} in your own voice as a WAV (mono, 16-bit PCM, 16 or 24 kHz, under 10 minutes), save it as that file, then run:`);
    console.error(`  cd build && ${dictationCommand(DEFAULT_AUDIO, caseId, entryId)}`);
    console.error(`The entry's text to read is in synthetic/cases/${caseId}.json under ${entryId}; the transcript, not the file, becomes the entry.`);
    process.exit(2);
  }
  const key = process.env['MODEL_API_KEY'];
  if (!key || !key.trim()) throw new Error('MODEL_API_KEY is not set');
  const wav = readFileSync(audioPath);
  const info = wavInfo(wav);
  if (!info.ok) throw new Error(`${audioPath}: ${info.reason}`);
  console.error(`transcribing ${basename(audioPath)} (${(info.durationMs / 1000).toFixed(1)} s, ${info.sampleRate} Hz mono) with ${TRANSCRIBE_MODEL}`);
  const started = Date.now();
  const t = await transcribe(wav, basename(audioPath), key);
  console.error(`transcript (${Date.now() - started} ms, $${((info.durationMs / 3_600_000) * 0.18).toFixed(5)} at $0.18 per hour): ${t.transcript}`);
  const transcribedAt = new Date().toISOString();
  const d = dictatedCase(c, entryId, t.transcript, { audio: basename(audioPath), model: TRANSCRIBE_MODEL, audioDurationMs: t.audioDurationMs ?? info.durationMs, transcribedAt });
  const outDir = join(here, '..', 'synthetic', 'dictated');
  mkdirSync(outDir, { recursive: true });
  const caseFile = join(outDir, `${caseId}.json`);
  writeFileSync(caseFile, JSON.stringify(d, null, 2) + '\n');
  console.error(`wrote ${caseFile}: ${entryId} is now the spoken words; the gate's quotes against it are quotes of speech`);
  if (values['no-run']) return;
  const chartKey = process.env['CHART_API_KEY'] ?? process.env['CHART_VERIFY_KEY'] ?? process.env['CHART_CUSTOM_TOKEN'];
  if (!chartKey || !chartKey.trim()) throw new Error('CHART_API_KEY (or CHART_VERIFY_KEY, CHART_CUSTOM_TOKEN) is not set');
  const provider = selectProvider('meta', values.model!);
  const startedAt = new Date().toISOString();
  console.error(`\nrunning ${caseId} on ${provider.label}/${provider.model}, effort low, agentic, live CHART, verbose; ${entryId} dictated`);
  const r = await runCase(provider, d, { effort: 'low', maxTokens: 12288, agentic: true, tools: [POLICY_STATUS_TOOL], extra: policyStatusExecutor({ apiKey: chartKey }), verbose: true });
  const quotesOfSpeech = (r.gate?.sentences ?? []).filter(s => s.citation === entryId);
  console.error(`${caseId} ${r.outcome} ${r.gate ? `${r.gate.verdict} verified ${r.gate.counts.verified}/${r.gate.counts.sentences}` : r.error ?? ''}; ${quotesOfSpeech.length} sentence(s) quote the dictated entry ${entryId} $${r.costUsd.toFixed(4)}`);
  for (const s of quotesOfSpeech) console.error(`  ${s.status.padEnd(14)} "${s.quote}"`);
  const resultsDir = values['out-dir'] ? resolve(values['out-dir']) : join(here, '..', 'results', 'dictated');
  mkdirSync(resultsDir, { recursive: true });
  const file = join(resultsDir, resultFileName({ label: 'meta', model: provider.model, effort: 'low', agentic: true, chart: true, startedAt }).replace('.json', `-dictated-${caseId}-${entryId}.json`));
  writeFileSync(file, JSON.stringify({ run: { startedAt, finishedAt: new Date().toISOString(), provider: provider.label, model: provider.model, effort: 'low', concurrency: 1, maxTokens: 12288, cases: 1, agentic: true, side: 'physician', tools: ['list_entries', 'read_entry', 'policy_status'], litmus: LITMUS_VERSION, synthetic: true, dictated: d.dictated }, summary: summarize([r]), results: [r] }, null, 2) + '\n');
  console.error(`wrote ${file}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? `${error.constructor.name}: ${error.message.slice(0, 300)}` : String(error));
    process.exit(1);
  });
}
