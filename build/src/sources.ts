// What the gate may treat as admissible for a case: the chart, the payer's
// criteria, the denial's own text, and the stated case facts. One function,
// shared by the harness (src/harness.ts), the re-gate and mutation scripts,
// and the viewer's in-browser recheck (viewer/src/gatecheck.ts), so the gate a
// reader runs in the page is given exactly what the harness gave it. The
// parameter is structural: a synthetic case and the viewer's case shape both fit.
import type { GateSources } from './litmus.js';
import { sha256Hex } from './hash.js';

export interface GateCase {
  chart: { id: string; date?: string; kind?: string; text: string }[];
  criteria: { id: string; text: string }[];
  denial: { carc: string; rarc?: string; text: string; dateOfService: string; serviceEnd?: string };
  patient: { alias: string; age: number; sex: string };
  procedure: { code: string; codeSystem: string; description: string };
  payer: { name: string; planType: string };
}

// A hash of the admissible sources alone: the chart, the criteria, the denial,
// and the case facts, with no draft in it. The gate's inputHash covers the draft
// too, so two live runs of one case never share it; this one they do, which is
// how a live run in a terminal is shown to be on the same record as a kept
// replay (harness --verbose, and the viewer's case header).
export function sourcesHash(s: GateSources): string {
  return sha256Hex(JSON.stringify({ chart: s.chart, criteria: s.criteria, denial: s.denial, facts: s.facts ?? [] }));
}

export function gateSources(c: GateCase): GateSources {
  return {
    chart: c.chart,
    criteria: c.criteria,
    denial: [c.denial.text, `CARC ${c.denial.carc}`, c.denial.dateOfService, ...(c.denial.serviceEnd ? [c.denial.serviceEnd] : []), ...(c.denial.rarc ? [c.denial.rarc] : [])],
    facts: [`Patient ${c.patient.alias}, ${c.patient.age} year old ${c.patient.sex}`, `${c.procedure.codeSystem} ${c.procedure.code} ${c.procedure.description}`, `${c.payer.name}, ${c.payer.planType}`],
  };
}
