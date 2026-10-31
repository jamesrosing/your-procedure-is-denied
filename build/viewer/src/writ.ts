// The instrument. A passing draft rendered as the document the physician would
// sign: the payer's own reason quoted at the head, each sentence with a
// footnote carrying the cited entry, its date, its kind, and the verified
// quote, the gate's version and input hash at the foot, and a blank signature
// line under a band that says what this is: a draft, unsigned, not sent. Pure
// functions over the case and the stored result; nothing here calls a model
// and nothing is saved.
import { payerRemark, type ResultsFile, type ViewerCase, type ViewerResult } from './replay.js';

export interface WritFootnote { n: number; entryId: string; date: string; kind: string; quote: string }

export interface WritDocument {
  heading: string;
  to: string;
  re: string;
  payerReason: string | null;
  opening: string;
  sentences: { n: number; text: string }[];
  footnotes: WritFootnote[];
  provenance: string;
  signature: string;
  band: string;
}

export const WRIT_BUTTON = 'the writ';
export const WRIT_HELP = 'The passing draft as the instrument the physician would sign: every sentence footnoted to the chart entry it cites, the gate’s version and input hash at the foot, and a blank signature line. A draft, unsigned, not sent. Print it or save it as text; nothing here is sent anywhere.';
export const WRIT_BAND = 'DRAFT, unsigned, not sent. Prepared by a machine and verified against the record by the gate; it becomes an appeal only under the physician’s signature, and the physician decides whether the record satisfies the criteria.';
export const WRIT_SIGNATURE = 'Reviewed and signed: ____________________________, MD        Date: ______________';
export const WRIT_OPENING = 'The payer’s stated reason is quoted above. The record, cited entry by entry below, documents the following.';

export function writDocument(c: ViewerCase, r: ViewerResult, run: ResultsFile['run']): WritDocument | null {
  const gate = r.gate;
  if (!gate || gate.verdict !== 'pass' || gate.sentences.length === 0) return null;
  if (!gate.sentences.every(s => s.status === 'verified')) return null;
  const entries = new Map(c.chart.map(e => [e.id, e]));
  const sentences = gate.sentences.map((s, i) => ({ n: i + 1, text: s.text }));
  const footnotes: WritFootnote[] = gate.sentences.map((s, i) => {
    const e = entries.get(s.citation);
    return { n: i + 1, entryId: s.citation, date: e?.date ?? '', kind: e?.kind ?? '', quote: s.quote };
  });
  const service = `${c.procedure.codeSystem} ${c.procedure.code}, ${c.procedure.description}`;
  const dates = c.denial.serviceEnd ? `${c.denial.dateOfService} to ${c.denial.serviceEnd}` : c.denial.dateOfService;
  const hash = (gate as { inputHash?: string }).inputHash;
  const version = /v\d+(?:\.\d+)?/.exec(gate.litmus ?? '')?.[0] ?? '';
  const repaired = run.repair && r.repairs && r.repairs.length > 0 ? ` after ${r.repairs.length} repair turn${r.repairs.length > 1 ? 's' : ''} (post hoc; the first verdict was blocked)` : '';
  const provenance = `Drafted by ${run.model} (${run.provider}), run started ${run.startedAt.slice(0, 10)}, from the synthetic record of ${c.patient.alias}${repaired}. Every sentence verified against its cited entry by the LITMUS gate ${version}${hash ? `; input hash ${hash}` : ''}. Synthetic data only.`;
  return {
    heading: 'Response to claim denial',
    to: `${c.payer.name}, ${c.payer.planType}`,
    re: `${service}; date of service ${dates}; denied under CARC ${c.denial.carc}${c.denial.rarc ? `, RARC ${c.denial.rarc}` : ''}; ${c.patient.alias}, ${c.patient.age} year old ${c.patient.sex}`,
    payerReason: payerRemark(c),
    opening: WRIT_OPENING,
    sentences,
    footnotes,
    provenance,
    signature: WRIT_SIGNATURE,
    band: WRIT_BAND,
  };
}

export function writText(doc: WritDocument): string {
  const lines: string[] = [];
  lines.push(doc.band, '');
  lines.push(doc.heading.toUpperCase(), '');
  lines.push(`To: ${doc.to}`);
  lines.push(`Re: ${doc.re}`, '');
  if (doc.payerReason) lines.push(`The payer’s reason: “${doc.payerReason}”`, '');
  lines.push(doc.opening, '');
  lines.push(doc.sentences.map(s => `${s.text} [${s.n}]`).join(' '), '');
  lines.push('Record cited');
  for (const f of doc.footnotes) lines.push(`[${f.n}] ${f.entryId}, ${f.date}, ${f.kind}: “${f.quote}”`);
  lines.push('', doc.provenance, '', doc.signature, '');
  return lines.join('\n');
}
