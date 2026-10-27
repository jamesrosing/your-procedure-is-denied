// Live smoke test of the provider seam: one synthetic denial through each
// configured Messages-protocol host, in parallel. Costs a few cents. Prints
// usage and the parse verdict, never the draft text, and exits non-zero when
// nothing was configured or any host failed.
import { messagesProvider, type Provider, type ProposeRequest } from './provider.js';

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v : undefined;
}

const chart = Array.from({ length: 12 }, (_, i) => {
  const id = `note-${String(i + 1).padStart(3, '0')}`;
  return `[${id}] 2026-0${(i % 9) + 1}-10 office visit\nSynthetic visit ${i + 1}: patient SYN-001 reports upper back and neck pain ${(i % 4) + 5} out of 10, shoulder grooving, inframammary intertrigo; physical therapy session ${i + 1} and supportive garments continued; exam shows macromastia, grade 3 ptosis; estimated resection 650 grams per side; plan reassess.`;
}).join('\n\n');

const request: ProposeRequest = {
  system: [
    {
      text:
        'You draft administrative appeals of insurance claim denials for a surgeon to review and sign. This is payer-policy adjudication, not clinical advice. ' +
        'Every sentence must cite exactly one chart entry id and carry a verbatim quote from it. If the chart does not support an appeal, set warranted to false with a one-sentence reason and no sentences.',
      cache: true,
    },
    { text: `Synthetic chart follows.\n\n${chart}` },
  ],
  user: 'Denial: CPT 19318 bilateral reduction mammaplasty, CARC 50. Payer criteria: crit-1 symptoms for six months; crit-2 three months of conservative treatment; crit-3 resection above the Schnur threshold. Draft the appeal.',
  effort: 'low',
  maxTokens: 12288,
};

const providers: Provider[] = [];
const metaKey = env('MODEL_API_KEY');
if (metaKey) providers.push(messagesProvider({ label: 'meta', baseURL: 'https://api.meta.ai', authToken: metaKey, model: 'muse-spark-1.3' }));
const basetenKey = env('BASETEN_API_KEY');
if (basetenKey) {
  for (const model of ['meta-models/muse-spark-open-1026', 'meta-models/muse-spark-open']) {
    providers.push(messagesProvider({ label: 'baseten', baseURL: 'https://inference.baseten.co', authToken: basetenKey, model, priceKey: 'muse-spark-open' }));
  }
}
if (providers.length === 0) {
  console.error('no provider configured: set MODEL_API_KEY and/or BASETEN_API_KEY in the repository .env');
  process.exit(2);
}

const outcomes = await Promise.all(
  providers.map(async p => {
    try {
      const r = await p.propose(request);
      console.log(JSON.stringify({ provider: r.provider, model: r.model, stop: r.stopReason, latencyMs: r.latencyMs, usage: r.usage, costUsd: Number(r.costUsd.toFixed(5)), draft: r.draft.ok ? { warranted: r.draft.appeal.warranted, evidence: r.draft.appeal.evidence.length, sentences: r.draft.appeal.sentences.length, citations: r.draft.appeal.sentences.map(s => s.citation) } : { error: r.draft.error } }));
      return true;
    } catch (error: unknown) {
      // Only the error class and HTTP status: SDK messages can echo the request body.
      const status = (error as { status?: number }).status;
      console.log(JSON.stringify({ provider: p.label, model: p.model, error: error instanceof Error ? error.constructor.name : 'Error', ...(status ? { status } : {}) }));
      return false;
    }
  }),
);
process.exit(outcomes.every(Boolean) ? 0 : 1);
