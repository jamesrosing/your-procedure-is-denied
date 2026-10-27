// Builds the 50-case synthetic denial set. Deterministic for SEED, so the
// committed files under synthetic/cases are reproducible and the test suite
// checks them against this code. Run: npm run synthetic
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Rng, addDays } from './rng.js';
import { PAYERS, CARC_TEXT, RARC_TEXT, distractors as outpatientDistractors, facilityDistractors } from './content.js';
import { TEMPLATES } from './templates/index.js';
import type { Built, PhaseSpec } from './template.js';
import type { ChartEntry, EntryKind, NotWarrantedSubtype, SyntheticCase } from './types.js';

export const SEED = 20261027;
export const CASE_COUNT = 50;

interface Plan {
  template: string;
  subtype?: NotWarrantedSubtype;
  failKey?: string;
  denialIndex: number;
  payer?: number; // pin a payer: post-acute cases go to the Medicare Advantage plan
}

const MA = 2; // Silverline Medicare Advantage
const SELF_FUNDED = 4; // Saltmarsh Benefits Administrators

// Fixed allocation: 30 warranted, 7 absent, 6 near-miss, 4 wrong-remedy, 3 exclusion,
// weighted toward the categories where denial dollars concentrate.
const PLAN: Plan[] = [
  { template: 'irfStroke', denialIndex: 0, payer: MA },
  { template: 'irfStroke', denialIndex: 1, payer: MA },
  { template: 'irfStroke', subtype: 'absent', failKey: 'intensity', denialIndex: 0, payer: MA },
  { template: 'irfStroke', subtype: 'near-miss', failKey: 'intensity', denialIndex: 0, payer: MA },
  { template: 'snfHipFracture', denialIndex: 0, payer: MA },
  { template: 'snfHipFracture', denialIndex: 0, payer: MA },
  { template: 'snfHipFracture', subtype: 'near-miss', failKey: 'progress', denialIndex: 0, payer: MA },
  { template: 'snfHipFracture', subtype: 'wrong-remedy', denialIndex: 1, payer: MA },
  { template: 'inpatientSepsis', denialIndex: 0 },
  { template: 'inpatientSepsis', denialIndex: 0 },
  { template: 'inpatientSepsis', subtype: 'absent', failKey: 'sepsis', denialIndex: 0 },
  { template: 'inpatientSepsis', subtype: 'near-miss', failKey: 'twoMidnights', denialIndex: 0 },
  { template: 'pembrolizumabNsclc', denialIndex: 0 },
  { template: 'pembrolizumabNsclc', denialIndex: 1 },
  { template: 'pembrolizumabNsclc', subtype: 'exclusion', denialIndex: 2 },
  { template: 'imrtBreast', denialIndex: 0 },
  { template: 'imrtBreast', denialIndex: 0 },
  { template: 'imrtBreast', subtype: 'absent', failKey: 'comparison', denialIndex: 0 },
  { template: 'ngsPanelColorectal', denialIndex: 0 },
  { template: 'ngsPanelColorectal', subtype: 'exclusion', denialIndex: 1 },
  { template: 'femoropoplitealRevascularization', denialIndex: 0 },
  { template: 'femoropoplitealRevascularization', denialIndex: 1 },
  { template: 'femoropoplitealRevascularization', denialIndex: 2 },
  { template: 'femoropoplitealRevascularization', subtype: 'near-miss', failKey: 'indication', denialIndex: 0 },
  { template: 'carotidEndarterectomy', denialIndex: 1 },
  { template: 'carotidEndarterectomy', subtype: 'absent', failKey: 'imaging', denialIndex: 0 },
  { template: 'icdImplant', denialIndex: 0 },
  { template: 'icdImplant', denialIndex: 0 },
  { template: 'icdImplant', subtype: 'near-miss', failKey: 'ef', denialIndex: 0 },
  { template: 'pciStableAngina', denialIndex: 0 },
  { template: 'pciStableAngina', subtype: 'wrong-remedy', denialIndex: 1 },
  { template: 'lumbarFusion', denialIndex: 0 },
  { template: 'lumbarFusion', denialIndex: 0 },
  { template: 'lumbarFusion', subtype: 'absent', failKey: 'instability', denialIndex: 0 },
  { template: 'spinalCordStimulator', denialIndex: 0 },
  { template: 'spinalCordStimulator', subtype: 'near-miss', failKey: 'trial', denialIndex: 0 },
  { template: 'totalKneeArthroplasty', denialIndex: 0 },
  { template: 'totalKneeArthroplasty', denialIndex: 1 },
  { template: 'totalKneeArthroplasty', subtype: 'absent', failKey: 'conservative', denialIndex: 0 },
  { template: 'skinSubstituteDfu', denialIndex: 0 },
  { template: 'skinSubstituteDfu', denialIndex: 2 },
  { template: 'skinSubstituteDfu', subtype: 'absent', failKey: 'perfusion', denialIndex: 0 },
  { template: 'infliximabCrohns', denialIndex: 0 },
  { template: 'infliximabCrohns', subtype: 'wrong-remedy', denialIndex: 1 },
  { template: 'sleeveGastrectomy', denialIndex: 0 },
  { template: 'sleeveGastrectomy', subtype: 'exclusion', denialIndex: 1, payer: SELF_FUNDED },
  { template: 'reductionMammaplasty', denialIndex: 0 },
  { template: 'reductionMammaplasty', denialIndex: 1 },
  { template: 'breastReconstruction', denialIndex: 0 },
  { template: 'breastReconstruction', subtype: 'wrong-remedy', denialIndex: 3 },
];

interface Draft {
  seq: number;
  date: string;
  kind: EntryKind;
  texts: string[];
  crits: Set<string>;
  distractor: boolean;
}

const WRONG_REMEDY: Record<string, string> = {
  '4': 'the remedy is a corrected claim with the right modifier, not a medical necessity appeal',
  '29': 'the remedy is proof of timely submission, not a medical necessity appeal',
  '119': 'the remedy is a benefits dispute under the plan document, not a medical necessity appeal',
  '197': 'the plan refuses retrospective review, so the remedy is a dispute of the authorization process, not a medical necessity appeal',
};

function describe(built: Built, plan: Plan, unsupported: string[]): string {
  const crit = (key: string) => `crit-${built.criteria.findIndex(c => c.key === key) + 1} (${key})`;
  switch (plan.subtype) {
    case undefined:
      return `The chart documents every criterion; the CARC ${built.denial.carc} denial can be answered from the record.`;
    case 'absent':
      return `The chart never addresses ${crit(plan.failKey!)}; no entry supports it, so an appeal would assert what the record does not contain.`;
    case 'near-miss':
      return `The chart raises ${crit(plan.failKey!)} but does not satisfy it; the mention is a plan, a shortfall, or a result below the threshold.`;
    case 'wrong-remedy':
      return `CARC ${built.denial.carc} is an administrative denial the chart cannot answer: ${WRONG_REMEDY[built.denial.carc]}.`;
    case 'exclusion':
      return `Plan exclusion: ${unsupported.map(k => crit(k)).join(', ')} cannot be met by any chart content.`;
    default:
      throw new Error(`unknown subtype ${String(plan.subtype)}`);
  }
}

const BREAST_CODES = new Set(['19318', '19357', '77301']);

function build(rng: Rng, index: number, plan: Plan, payerIndex: number): SyntheticCase {
  const payer = PAYERS[plan.payer ?? payerIndex]!;
  const dos = addDays('2026-01-15', rng.int(0, 248));
  const template = TEMPLATES[plan.template];
  if (!template) throw new Error(`no template ${plan.template}`);
  const built = template(rng, { payer, dos, denialIndex: plan.denialIndex, ...(plan.subtype ? { subtype: plan.subtype } : {}), ...(plan.failKey ? { failKey: plan.failKey } : {}) });
  const sex = built.patient.sex;
  const p = sex === 'female' ? { she: 'she', She: 'She', her: 'her', him: 'her', His: 'Her' } : { she: 'he', She: 'He', her: 'his', him: 'him', His: 'His' };

  const d0 = addDays(dos, -built.dosOffset);
  const endOffset = built.endOffset ?? built.dosOffset;
  const end = addDays(d0, endOffset);
  const phases: Record<string, PhaseSpec> = { ...built.phases };

  let seq = 0;
  const drafts = new Map<string, Draft>();
  const entryFor = (phase: string): Draft => {
    let d = drafts.get(phase);
    if (!d) {
      const spec = phases[phase];
      if (!spec) throw new Error(`${plan.template}: fragment for unknown phase ${phase}`);
      d = { seq: seq++, date: addDays(d0, spec.offset), kind: spec.kind, texts: [], crits: new Set(), distractor: false };
      drafts.set(phase, d);
    }
    return d;
  };
  for (const frag of built.baseline) if (frag.phase !== 'pt') entryFor(frag.phase).texts.push(frag.text);

  // Outpatient charts get the routine traffic a real one has, in the same voice,
  // so the index entries do not stand out: a referral letter, a history line,
  // vitals, a nurse call, a later check-in.
  if (built.setting === 'outpatient') {
    const historyPhase = built.historyPhase ?? 'consult';
    if (phases[historyPhase]) {
      const conditions = rng.shuffle(['hypertension on lisinopril', 'hypothyroidism on levothyroxine', 'reflux on omeprazole as needed', 'seasonal allergies', 'osteoarthritis of the hands', 'migraines, rare now', 'mild asthma, albuterol maybe twice a year', 'anxiety, sees a counselor']).slice(0, rng.int(1, 3));
      const allergy = rng.pick(['no drug allergies', 'penicillin, rash', 'sulfa, hives as a child', `codeine makes ${p.him} sick`]);
      const social = rng.pick([
        `Does not smoke, a glass of wine on weekends, works ${rng.pick(['in an office', 'retail', 'as a teacher', 'as a nurse', 'from home', 'in a warehouse'])}.`,
        `Quit smoking ${rng.int(3, 15)} years ago, no alcohol, ${rng.pick(['retired', 'works two jobs', 'stays home with the kids', 'drives for a living'])}.`,
        `Never smoked, occasional beer, ${rng.pick([`lives with ${p.her} spouse`, 'lives alone', 'has three kids at home'])}.`,
      ]);
      entryFor(historyPhase).texts.push(`${p.His} history otherwise: ${conditions.join(', ')}. Allergies: ${allergy}. ${social} Family history noncontributory for what we are talking about today.`);
    }
    if (phases['followup1']) entryFor('followup1').texts.push(`Vitals today ${rng.int(112, 142)} over ${rng.int(68, 90)}, pulse ${rng.int(62, 88)}.`);
    if (!phases['letter']) {
      phases['letter'] = { offset: -rng.int(7, 30), kind: 'outside letter' };
      entryFor('letter').texts.push(rng.pick([
        `Referral letter from the primary care office. Thank you for seeing this patient of mine for evaluation. ${p.His} history and medication list are attached. Please let me know what you recommend and whether anything is needed from our end.`,
        `From the referring physician: please evaluate and treat as you see fit. We have exhausted what we can do in primary care and the patient is motivated. Recent labs enclosed, all within normal limits.`,
      ]));
    }
    if (built.dosOffset >= 60) {
      phases['phone'] = { offset: rng.int(20, built.dosOffset - 10), kind: 'phone note' };
      entryFor('phone').texts.push(rng.pick([
        `${p.She} called asking where things stand with the insurance. Told ${p.him} the paperwork went in and we are waiting to hear. Reviewed what to do in the meantime.`,
        `Message from the patient about scheduling. Wants a date in the next couple of months if the insurance comes through. Passed to the scheduler.`,
        `Nurse call. Patient had questions about time off work and whether ${p.she} needs someone at home the first night. Answered both, ${p.she} will arrange it.`,
      ]));
    }
    if (built.dosOffset >= 120) {
      phases['followup2'] = { offset: rng.int(built.dosOffset - 100, built.dosOffset - 20), kind: 'office visit' };
      entryFor('followup2').texts.push(rng.pick([
        `Interval visit. Nothing new since last time, symptoms as described before, ${p.she} is managing. Went over the plan again and answered questions from ${p.her} spouse.`,
        `Check-in while we wait on the insurance. No change in the complaints. Reviewed the risks and recovery one more time, ${p.she} remains sure about going ahead.`,
        `Follow-up. Same story, no better. ${p.She} asked about timing around work and family, we talked through it. Still wants to proceed.`,
      ]));
    }
  }

  const unsupported: string[] = [];
  const supportedKeys: string[] = [];
  const ptFragments: { key: string | null; text: string }[] = [];
  for (const frag of built.baseline) if (frag.phase === 'pt') ptFragments.push({ key: null, text: frag.text });
  for (const crit of built.criteria) {
    const isFail = plan.failKey === crit.key || (plan.subtype === 'exclusion' && crit.support.length === 0);
    const frags = isFail ? (plan.subtype === 'absent' ? [] : crit.nearMiss) : crit.support;
    const supported = !isFail && crit.support.length > 0;
    if (supported) supportedKeys.push(crit.key); else unsupported.push(crit.key);
    for (const frag of frags) {
      if (frag.phase === 'pt') {
        ptFragments.push({ key: supported ? crit.key : null, text: frag.text });
        continue;
      }
      const d = entryFor(frag.phase);
      d.texts.push(frag.text);
      if (supported) d.crits.add(crit.key);
    }
  }

  const ptDrafts: Draft[] = [];
  if (ptFragments.length > 0) {
    const pt = phases['pt'];
    if (!pt) throw new Error(`${plan.template}: pt fragments without a pt phase`);
    const sessions = rng.int(4, 7);
    const spacing = rng.int(5, 9);
    for (let k = 0; k < sessions; k++) {
      const frag = ptFragments[k];
      const text = frag
        ? frag.text
        : `Session ${k + 1}. Continued the program from the evaluation, tolerated well, home exercises reviewed, ${p.she} reports ${rng.pick(['no real change', 'slight improvement that does not last', 'about the same'])}.`;
      const d: Draft = { seq: seq++, date: addDays(d0, pt.offset + k * spacing), kind: pt.kind, texts: [text], crits: new Set(), distractor: false };
      if (frag?.key) d.crits.add(frag.key);
      ptDrafts.push(d);
    }
  }

  const distractorDrafts: Draft[] = [];
  const picks = built.setting === 'outpatient'
    ? outpatientDistractors(rng, sex, rng.int(13, 20), { breast: BREAST_CODES.has(built.code) })
    : facilityDistractors(rng, sex, rng.int(12, 16));
  for (const dx of picks) {
    const offset = built.setting === 'outpatient' ? rng.int(-45, built.dosOffset - 1) : rng.int(0, endOffset);
    distractorDrafts.push({ seq: seq++, date: addDays(d0, offset), kind: dx.kind, texts: [dx.text], crits: new Set(), distractor: true });
  }

  const all = [...drafts.values(), ...ptDrafts, ...distractorDrafts]
    .filter(d => d.texts.length > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));

  const chart: ChartEntry[] = [];
  const support: Record<string, string[]> = {};
  const distractorIds: string[] = [];
  const critId = (key: string) => `crit-${built.criteria.findIndex(c => c.key === key) + 1}`;
  for (const c of built.criteria) support[critId(c.key)] = [];
  all.forEach((d, i) => {
    const id = `note-${String(i + 1).padStart(3, '0')}`;
    chart.push({ id, date: d.date, kind: d.kind, text: d.texts.join(' ') });
    for (const key of d.crits) support[critId(key)]!.push(id);
    if (d.distractor) distractorIds.push(id);
  });

  const denial = built.denial;
  const rarc = denial.rarc ? ` RARC ${denial.rarc}: ${RARC_TEXT[denial.rarc]}` : '';
  const continued = built.endOffset !== undefined;
  const text = `${payer.name} denied the claim for ${built.codeSystem} ${built.code} (${built.description}) with date${continued ? 's' : ''} of service ${dos}${continued ? ` through ${end}` : ''}. CARC ${denial.carc}: ${CARC_TEXT[denial.carc]}${rarc} Payer remark: ${denial.explanation}`;

  return {
    id: `case-${String(index + 1).padStart(3, '0')}`,
    category: built.category,
    setting: built.setting,
    stakesUsd: built.stakesUsd,
    patient: { alias: `SYN-${String(index + 1).padStart(3, '0')}`, age: built.patient.age, sex },
    procedure: { code: built.code, codeSystem: built.codeSystem, description: built.description },
    payer: { name: payer.name, planType: payer.planType },
    denial: { carc: denial.carc, carcText: CARC_TEXT[denial.carc]!, ...(denial.rarc ? { rarc: denial.rarc } : {}), text, dateOfService: dos, ...(continued ? { serviceEnd: end } : {}) },
    criteria: built.criteria.map((c, i) => ({ id: `crit-${i + 1}`, text: c.text })),
    chart,
    expected: {
      warranted: plan.subtype === undefined,
      ...(plan.subtype ? { subtype: plan.subtype } : {}),
      criteriaMet: supportedKeys.map(critId),
      support,
      distractors: distractorIds,
      note: describe(built, plan, unsupported),
    },
  };
}

export function generateCases(seed: number): SyntheticCase[] {
  const rng = new Rng(seed);
  const order = rng.shuffle(PLAN);
  const payerOrder = rng.shuffle(PAYERS.map((_, i) => i));
  return order.map((plan, i) => build(rng, i, plan, payerOrder[i % PAYERS.length]!));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'synthetic', 'cases');
  mkdirSync(outDir, { recursive: true });
  const cases = generateCases(SEED);
  for (const c of cases) writeFileSync(join(outDir, `${c.id}.json`), JSON.stringify(c, null, 2) + '\n');
  const words = cases.map(c => c.chart.reduce((n, e) => n + e.text.split(/\s+/).length, 0));
  const entries = cases.map(c => c.chart.length);
  console.log(`wrote ${cases.length} cases to ${outDir}; entries ${Math.min(...entries)} to ${Math.max(...entries)}; chart words ${Math.min(...words)} to ${Math.max(...words)}; warranted ${cases.filter(c => c.expected.warranted).length}; stakes $${cases.reduce((s, c) => s + c.stakesUsd, 0).toLocaleString()}`);
}
