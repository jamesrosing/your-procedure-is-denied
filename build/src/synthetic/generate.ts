// Builds the 50-case synthetic denial set. Deterministic for SEED, so the
// committed files under synthetic/cases are reproducible and the test suite
// checks them against this code. Run: npm run synthetic
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Rng, addDays } from './rng.js';
import { PAYERS, CARC_TEXT, RARC_TEXT, distractors as pickDistractors } from './content.js';
import { PROCEDURES, type Phase, type Built } from './procedures.js';
import type { ChartEntry, EntryKind, NotWarrantedSubtype, SyntheticCase } from './types.js';

export const SEED = 20261026;
export const CASE_COUNT = 50;

interface Plan {
  cpt: string;
  subtype?: NotWarrantedSubtype;
  failKey?: string;
  denialIndex: number;
}

// Fixed allocation: 30 warranted, 7 absent, 6 near-miss, 4 wrong-remedy, 3 exclusion.
const PLAN: Plan[] = [
  ...[0, 1, 2, 0].map(d => ({ cpt: '19318', denialIndex: d })),
  { cpt: '19318', subtype: 'absent', failKey: 'threshold', denialIndex: 0 },
  { cpt: '19318', subtype: 'near-miss', failKey: 'conservative', denialIndex: 0 },
  { cpt: '19318', subtype: 'wrong-remedy', denialIndex: 3 },
  { cpt: '19318', subtype: 'exclusion', denialIndex: 4 },
  ...[0, 1, 2, 0].map(d => ({ cpt: '15847', denialIndex: d })),
  { cpt: '15847', subtype: 'absent', failKey: 'skin', denialIndex: 0 },
  { cpt: '15847', subtype: 'near-miss', failKey: 'weight', denialIndex: 0 },
  { cpt: '15847', subtype: 'wrong-remedy', denialIndex: 3 },
  ...[0, 1, 2, 0].map(d => ({ cpt: '15823', denialIndex: d })),
  { cpt: '15823', subtype: 'absent', failKey: 'vft', denialIndex: 0 },
  { cpt: '15823', subtype: 'near-miss', failKey: 'vft', denialIndex: 0 },
  ...[0, 1, 2, 0].map(d => ({ cpt: '30520', denialIndex: d })),
  { cpt: '30520', subtype: 'absent', failKey: 'medical', denialIndex: 0 },
  { cpt: '30520', subtype: 'near-miss', failKey: 'medical', denialIndex: 0 },
  ...[0, 1, 2].map(d => ({ cpt: '19371', denialIndex: d })),
  { cpt: '19371', subtype: 'absent', failKey: 'complication', denialIndex: 0 },
  { cpt: '19371', subtype: 'exclusion', denialIndex: 3 },
  ...[0, 1, 2, 0, 1].map(d => ({ cpt: '19357', denialIndex: d })),
  { cpt: '19357', subtype: 'wrong-remedy', denialIndex: 3 },
  ...[0, 1, 0].map(d => ({ cpt: '15877', denialIndex: d })),
  { cpt: '15877', subtype: 'absent', failKey: 'conservative', denialIndex: 1 },
  { cpt: '15877', subtype: 'near-miss', failKey: 'conservative', denialIndex: 1 },
  { cpt: '15877', subtype: 'exclusion', denialIndex: 2 },
  ...[0, 1, 2].map(d => ({ cpt: '64721', denialIndex: d })),
  { cpt: '64721', subtype: 'absent', failKey: 'ncs', denialIndex: 0 },
  { cpt: '64721', subtype: 'near-miss', failKey: 'conservative', denialIndex: 0 },
  { cpt: '64721', subtype: 'wrong-remedy', denialIndex: 3 },
];

const KIND: Record<Phase, EntryKind> = {
  letter: 'outside letter',
  consult: 'office visit',
  pt: 'physical therapy',
  vft: 'visual field test',
  imaging: 'imaging',
  ncs: 'nerve conduction study',
  followup1: 'office visit',
  photos: 'photo documentation',
  phone: 'phone note',
  followup2: 'office visit',
  preop: 'preoperative visit',
};

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
  const crit = (key: string) => {
    const i = built.criteria.findIndex(c => c.key === key);
    return `crit-${i + 1} (${key})`;
  };
  switch (plan.subtype) {
    case undefined:
      return `The chart documents every criterion; the CARC ${built.denial.carc} denial can be answered from the record.`;
    case 'absent':
      return `The chart never addresses ${crit(plan.failKey!)}; no entry supports it, so an appeal would assert what the record does not contain.`;
    case 'near-miss':
      return `The chart raises ${crit(plan.failKey!)} but does not satisfy it; the mention is a plan or a shortfall, not completed treatment or a met threshold.`;
    case 'wrong-remedy':
      return `CARC ${built.denial.carc} is an administrative denial the chart cannot answer: ${WRONG_REMEDY[built.denial.carc]}.`;
    case 'exclusion':
      return `Plan exclusion: ${unsupported.map(k => crit(k)).join(', ')} cannot be met by any chart content.`;
    default:
      throw new Error(`unknown subtype ${String(plan.subtype)}`);
  }
}

function build(rng: Rng, index: number, plan: Plan, payerIndex: number): SyntheticCase {
  const payer = PAYERS[payerIndex]!;
  const dos = addDays('2026-01-15', rng.int(0, 248));
  const spec = { payer, dos, denialIndex: plan.denialIndex, ...(plan.subtype ? { subtype: plan.subtype } : {}), ...(plan.failKey ? { failKey: plan.failKey } : {}) };
  const built = PROCEDURES[plan.cpt]!(rng, spec);
  const sex = built.patient.sex;

  const d0 = addDays(dos, -rng.int(270, 400));
  const followup1 = addDays(d0, rng.int(45, 80));
  const dateOf: Record<Phase, string> = {
    letter: addDays(d0, -rng.int(7, 30)),
    consult: d0,
    pt: addDays(d0, 7),
    vft: addDays(d0, rng.int(7, 30)),
    imaging: addDays(d0, rng.int(10, 45)),
    ncs: addDays(d0, rng.int(14, 50)),
    followup1,
    photos: followup1,
    phone: addDays(d0, rng.int(90, 160)),
    followup2: addDays(d0, rng.int(150, 230)),
    preop: addDays(dos, -rng.int(7, 21)),
  };

  let seq = 0;
  const drafts = new Map<Phase, Draft>();
  const ptDrafts: Draft[] = [];
  const entryFor = (phase: Phase): Draft => {
    let d = drafts.get(phase);
    if (!d) {
      d = { seq: seq++, date: dateOf[phase], kind: KIND[phase], texts: [], crits: new Set(), distractor: false };
      drafts.set(phase, d);
    }
    return d;
  };
  entryFor('consult');
  entryFor('followup1');
  for (const frag of built.baseline) entryFor(frag.phase).texts.push(frag.text);
  const him = sex === 'female' ? 'her' : 'him';
  const His = sex === 'female' ? 'Her' : 'His';
  const conditions = rng.shuffle(['hypertension on lisinopril', 'hypothyroidism on levothyroxine', 'reflux on omeprazole as needed', 'seasonal allergies', 'prediabetes, diet controlled', 'migraines, rare now', 'mild asthma, albuterol maybe twice a year', 'anxiety, sees a counselor']).slice(0, rng.int(1, 3));
  const surgeries = rng.pick(['tonsils as a kid', 'appendix years ago', 'a C-section', 'wisdom teeth', 'a knee scope', 'no prior surgery']);
  const hisHer = sex === 'female' ? 'her' : 'his';
  const allergy = rng.pick(['no drug allergies', 'penicillin, rash', 'sulfa, hives as a child', `codeine makes ${him} sick`]);
  const job = rng.pick(['in an office', 'retail', 'as a teacher', 'as a nurse', 'from home', 'in a warehouse']);
  const living = rng.pick([`lives with ${hisHer} spouse`, 'lives alone', 'has three kids at home']);
  const social = rng.pick([
    `Does not smoke, a glass of wine on weekends, works ${job}.`,
    `Quit smoking ${rng.int(3, 15)} years ago, no alcohol, ${rng.pick(['retired', 'works two jobs', 'stays home with the kids', 'drives for a living'])}.`,
    `Never smoked, occasional beer, ${living}.`,
  ]);
  // Procedures whose own history names the prior operation skip the generic line.
  const surgeryLine = ['19371', '19357', '15847'].includes(built.cpt) ? '' : ` Surgeries: ${surgeries}.`;
  entryFor('consult').texts.push(`${His} history otherwise: ${conditions.join(', ')}.${surgeryLine} Allergies: ${allergy}. ${social} Family history noncontributory for what we are talking about today.`);
  entryFor('followup1').texts.push(`Vitals today ${rng.int(112, 142)} over ${rng.int(68, 90)}, pulse ${rng.int(62, 88)}.`);
  if (!drafts.has('letter')) {
    entryFor('letter').texts.push(rng.pick([
      `Referral letter from the primary care office. Thank you for seeing this patient of mine for surgical evaluation. ${His} history and medication list are attached. Please let me know what you recommend and whether anything is needed from our end for clearance.`,
      `From the referring physician: please evaluate for surgical management. We have exhausted what we can do in primary care and the patient is motivated. Recent labs enclosed, all within normal limits.`,
    ]));
  }
  // Every chart gets the routine traffic a real one has: a nurse call and a
  // later check-in, in the same voice, so the index entries do not stand out.
  const pr = sex === 'female' ? { she: 'she', her: 'her' } : { she: 'he', her: 'his' };
  entryFor('phone').texts.push(rng.pick([
    `${pr.she === 'she' ? 'She' : 'He'} called asking where things stand with the insurance. Told ${pr.her === 'her' ? 'her' : 'him'} the paperwork went in and we are waiting to hear. Reviewed what to do in the meantime.`,
    `Message from the patient about scheduling. Wants a date in the next couple of months if the insurance comes through. Passed to the surgery scheduler.`,
    `Nurse call. Patient had questions about time off work after surgery and whether ${pr.she} needs someone at home the first night. Answered both, ${pr.she} will arrange it.`,
  ]));
  entryFor('followup2').texts.push(rng.pick([
    `Interval visit. Nothing new since last time, symptoms as described before, ${pr.she} is managing. Went over the plan again and answered questions from ${pr.her} spouse.`,
    `Check-in while we wait on the insurance. No change in the complaints. Reviewed the risks and recovery one more time, ${pr.she} remains sure about going ahead.`,
    `Follow-up. Same story, no better. ${pr.she === 'she' ? 'She' : 'He'} asked about timing around work and family, we talked through it. Still wants to proceed.`,
  ]));

  const unsupported: string[] = [];
  const supportedKeys: string[] = [];
  let ptFragmentCount = 0;
  const ptFragments: { key: string; text: string }[] = [];
  for (const crit of built.criteria) {
    const isFail = plan.failKey === crit.key || (plan.subtype === 'exclusion' && crit.support.length === 0);
    const frags = isFail ? (plan.subtype === 'absent' ? [] : crit.nearMiss) : crit.support;
    const supported = !isFail && crit.support.length > 0;
    if (supported) supportedKeys.push(crit.key); else unsupported.push(crit.key);
    for (const frag of frags) {
      if (frag.phase === 'pt') {
        ptFragments.push({ key: crit.key, text: frag.text });
        ptFragmentCount++;
        continue;
      }
      const d = entryFor(frag.phase);
      d.texts.push(frag.text);
      if (supported) d.crits.add(crit.key);
    }
  }

  if (ptFragmentCount > 0) {
    const sessions = rng.int(4, 7);
    const spacing = rng.int(5, 9);
    const she = sex === 'female' ? 'she' : 'he';
    for (let k = 0; k < sessions; k++) {
      const frag = ptFragments[k];
      const text = frag
        ? frag.text
        : `Session ${k + 1}. Continued the program from the evaluation, tolerated well, home exercises reviewed, ${she} reports ${rng.pick(['no real change', 'slight improvement that does not last', 'about the same'])}.`;
      const d: Draft = { seq: seq++, date: addDays(dateOf.pt, k * spacing), kind: 'physical therapy', texts: [text], crits: new Set(), distractor: false };
      if (frag && supportedKeys.includes(frag.key)) d.crits.add(frag.key);
      ptDrafts.push(d);
    }
  }

  const span = Math.round((Date.parse(dos) - Date.parse(d0)) / 86_400_000);
  const distractors: Draft[] = [];
  for (const dx of pickDistractors(rng, sex, rng.int(13, 20), { breast: ['19318', '19371', '19357'].includes(built.cpt) })) {
    distractors.push({ seq: seq++, date: addDays(d0, rng.int(-45, span - 1)), kind: dx.kind, texts: [dx.text], crits: new Set(), distractor: true });
  }

  const all = [...drafts.values(), ...ptDrafts, ...distractors]
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
  const text = `${payer.name} denied the claim for CPT ${built.cpt} (${built.description}) with date of service ${dos}. CARC ${denial.carc}: ${CARC_TEXT[denial.carc]}${rarc} Payer remark: ${denial.explanation}`;

  const warranted = plan.subtype === undefined;
  return {
    id: `case-${String(index + 1).padStart(3, '0')}`,
    patient: { alias: `SYN-${String(index + 1).padStart(3, '0')}`, age: built.patient.age, sex },
    procedure: { cpt: built.cpt, description: built.description },
    payer: { name: payer.name, planType: payer.planType },
    denial: { carc: denial.carc, carcText: CARC_TEXT[denial.carc]!, ...(denial.rarc ? { rarc: denial.rarc } : {}), text, dateOfService: dos },
    criteria: built.criteria.map((c, i) => ({ id: `crit-${i + 1}`, text: c.text })),
    chart,
    expected: {
      warranted,
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
  console.log(`wrote ${cases.length} cases to ${outDir}; chart words min ${Math.min(...words)} max ${Math.max(...words)}; warranted ${cases.filter(c => c.expected.warranted).length}`);
}
