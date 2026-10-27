// Shape of one synthetic denial case. Every field is fabricated by
// src/synthetic/generate.ts; nothing here comes from a real record.
export type EntryKind =
  | 'office visit'
  | 'physical therapy'
  | 'imaging'
  | 'photo documentation'
  | 'phone note'
  | 'outside letter'
  | 'preoperative visit'
  | 'emergency department note'
  | 'history and physical'
  | 'hospital progress note'
  | 'nursing note'
  | 'therapy note'
  | 'consult note'
  | 'team conference'
  | 'preadmission screening'
  | 'discharge summary'
  | 'laboratory result'
  | 'pathology report'
  | 'molecular pathology report'
  | 'procedure note'
  | 'operative report'
  | 'infusion note'
  | 'radiation oncology note'
  | 'dosimetry note'
  | 'tumor board note'
  | 'wound care visit'
  | 'vascular laboratory'
  | 'echocardiogram'
  | 'stress test'
  | 'cardiac catheterization'
  | 'psychological evaluation'
  | 'nutrition evaluation'
  | 'sleep study'
  | 'medication record';

export type CodeSystem = 'CPT' | 'HCPCS' | 'MS-DRG' | 'CMG' | 'HIPPS';

export type Category =
  | 'post-acute care'
  | 'inpatient level of care'
  | 'oncology'
  | 'vascular surgery'
  | 'cardiology'
  | 'spine surgery'
  | 'orthopedic surgery'
  | 'wound care'
  | 'biologic therapy'
  | 'bariatric surgery'
  | 'plastic surgery';

export type Setting = 'outpatient' | 'inpatient' | 'post-acute';

export interface ChartEntry {
  id: string; // note-NNN, sequential in date order
  date: string; // YYYY-MM-DD
  kind: EntryKind;
  text: string; // dictation voice; the only part of an entry a quote may come from
}

export interface Criterion {
  id: string; // crit-N
  text: string;
}

export interface Denial {
  carc: string;
  carcText: string;
  rarc?: string;
  text: string;
  dateOfService: string;
  serviceEnd?: string; // continued stays: the last denied day
}

export type NotWarrantedSubtype = 'absent' | 'near-miss' | 'wrong-remedy' | 'exclusion';

export interface Expected {
  warranted: boolean;
  subtype?: NotWarrantedSubtype;
  criteriaMet: string[]; // criterion ids the chart satisfies
  support: Record<string, string[]>; // criterion id -> note ids holding the evidence
  distractors: string[]; // note ids unrelated to the denial
  note: string; // one line on why the label is what it is
}

export interface SyntheticCase {
  id: string; // case-NNN
  category: Category;
  setting: Setting;
  stakesUsd: number; // order-of-magnitude typical allowed amount at stake in the denial; synthetic reference value
  patient: { alias: string; age: number; sex: 'female' | 'male' };
  procedure: { code: string; codeSystem: CodeSystem; description: string };
  payer: { name: string; planType: string };
  denial: Denial;
  criteria: Criterion[];
  chart: ChartEntry[];
  expected: Expected;
}
