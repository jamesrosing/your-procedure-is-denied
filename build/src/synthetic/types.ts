// Shape of one synthetic denial case. Every field is fabricated by
// src/synthetic/generate.ts; nothing here comes from a real record.
export type EntryKind =
  | 'office visit'
  | 'physical therapy'
  | 'imaging'
  | 'photo documentation'
  | 'phone note'
  | 'outside letter'
  | 'visual field test'
  | 'nerve conduction study'
  | 'preoperative visit';

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
  patient: { alias: string; age: number; sex: 'female' | 'male' };
  procedure: { cpt: string; description: string };
  payer: { name: string; planType: string };
  denial: Denial;
  criteria: Criterion[];
  chart: ChartEntry[];
  expected: Expected;
}
