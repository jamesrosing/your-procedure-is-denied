import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { dictatedCase, dictationCommand, transcribeRequestParts, wavInfo } from '../src/dictation.js';
import { generateCases, SEED } from '../src/synthetic/generate.js';

const cases = generateCases(SEED);
const c1 = cases[0]!;

// A minimal RIFF/WAVE header: PCM, channels, rate, bits, and n bytes of data.
function wav(channels: number, rate: number, bits: number, dataBytes: number): Buffer {
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * (bits / 8), 28); b.writeUInt16LE(channels * (bits / 8), 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  return b;
}

describe('dictation (item 7): the physician\'s spoken words as a chart entry', () => {
  test('a WAV header is read for the format the transcription endpoint accepts: mono, 16-bit PCM, 16 or 24 kHz, with the duration', () => {
    const ok = wavInfo(wav(1, 16000, 16, 32000));
    assert.deepEqual(ok, { ok: true, channels: 1, sampleRate: 16000, bits: 16, durationMs: 1000 });
    const stereo = wavInfo(wav(2, 44100, 16, 4));
    assert.equal(stereo.ok, false);
    if (!stereo.ok) assert.match(stereo.reason, /mono|16 kHz|24 kHz/);
    const notWav = wavInfo(Buffer.from('not a wav file at all, just text'));
    assert.equal(notWav.ok, false);
    if (!notWav.ok) assert.match(notWav.reason, /RIFF|WAVE/);
  });

  test('the dictated copy replaces one entry\'s text with the transcript and records which entry, from what, and when; everything else is the case unchanged', () => {
    const d = dictatedCase(c1, 'note-013', 'P T five days this week forty five to sixty minutes per session', { audio: 'case-001-note-013.wav', model: 'muse-voice-transcribe-1.0', audioDurationMs: 8200, transcribedAt: '2026-10-31T08:00:00.000Z' });
    assert.equal(d.id, c1.id);
    assert.equal(d.chart.find(e => e.id === 'note-013')!.text, 'P T five days this week forty five to sixty minutes per session');
    for (const e of c1.chart) if (e.id !== 'note-013') assert.deepEqual(d.chart.find(x => x.id === e.id), e);
    assert.deepEqual(d.expected, c1.expected);
    assert.deepEqual(d.dictated, { entryId: 'note-013', audio: 'case-001-note-013.wav', model: 'muse-voice-transcribe-1.0', audioDurationMs: 8200, transcribedAt: '2026-10-31T08:00:00.000Z', original: c1.chart.find(e => e.id === 'note-013')!.text });
    assert.throws(() => dictatedCase(c1, 'note-999', 'x', { audio: 'a', model: 'm', audioDurationMs: 1, transcribedAt: 't' }), /note-999/);
  });

  test('the transcription request is multipart with a JSON settings part naming the model, WAV encoding, and English bias, and the audio part', () => {
    const parts = transcribeRequestParts(wav(1, 24000, 16, 4), 'clip.wav');
    assert.equal(parts.url, 'https://api.meta.ai/v1/asr/transcribe');
    assert.equal(parts.settings.model, 'muse-voice-transcribe-1.0');
    assert.equal(parts.settings.audioEncoding, 'WAV');
    assert.deepEqual(parts.settings.languageBias, ['English']);
    assert.ok(['PUSH_TO_TALK', 'ENDPOINTING'].includes(parts.settings.mode));
    const form = parts.form;
    assert.ok(form.get('request') instanceof Blob);
    assert.ok(form.get('audio') instanceof Blob);
    assert.equal((form.get('request') as Blob).type, 'application/json');
    assert.equal((form.get('audio') as Blob).type, 'audio/wav');
  });

  test('the command Jim runs names the audio file, the case, and the entry', () => {
    const cmd = dictationCommand('assets/audio/case-001-note-013.wav', 'case-001', 'note-013');
    assert.equal(cmd, 'npm run dictate -- --audio ../assets/audio/case-001-note-013.wav --case case-001 --entry note-013');
  });
});
