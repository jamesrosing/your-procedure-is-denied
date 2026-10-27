// Live smoke test of the provider seam: one synthetic denial through each
// configured Messages-protocol host. Costs a few cents. Prints usage and the
// parse verdict, never the draft text.
import { messagesProvider, type Provider, type ProposeRequest } from './provider.js';

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v : undefined;
}

const chart = Array.from({ length: 12 }, (_, i) => {
  const id = `note-${String(i + 1).padStart(3, '0')}`;
  return `[${id}] Synthetic visit ${i + 1}: patient SYN-001 reports upper back and neck pain ${(i % 4) + 5}/10, shoulder grooving, inframammary intertrigo; physical therapy session ${i + 1} and supportive garments continued; exam shows macromastia, grade 3 ptosis; estimated resection 650 g per side; plan reassess.`;
}).join('\n');

const request: ProposeRequest = {
  system:
    'You draft administrative appeals of insurance claim denials for a surgeon to review and sign. This is payer-policy adjudication, not clinical advice. ' +
    'Every sentence must cite exactly one chart entry id. If the chart does not support an appeal, set warranted to false with a one-sentence reason and no sentences. Synthetic chart follows.\n\n' +
    chart,
  user: 'Denial: CPT 19318 bilateral reduction mammaplasty, CARC 50. Payer criteria: symptoms for six months, three months of conservative treatment, resection above the Schnur threshold. Draft the appeal.',
  effort: 'low',
  maxTokens: 8192,
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

for (const p of providers) {
  try {
    const r = await p.propose(request);
    console.log(JSON.stringify({ provider: r.provider, model: r.model, stop: r.stopReason, latencyMs: r.latencyMs, usage: r.usage, costUsd: Number(r.costUsd.toFixed(5)), draft: r.draft.ok ? { warranted: r.draft.appeal.warranted, sentences: r.draft.appeal.sentences.length, citations: r.draft.appeal.sentences.map(s => s.citation) } : { error: r.draft.error } }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ provider: p.label, model: p.model, error: msg.slice(0, 300) }));
  }
}
