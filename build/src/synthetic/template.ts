// Shared vocabulary for the case templates. A template builds the clinical
// facts for one case in dictation voice: the clinician talking, not a
// checklist. Numbers are chosen per case so that the chart either clears the
// payer's threshold or misses it by a documented margin.
import type { Rng } from './rng.js';
import type { Payer } from './content.js';
import type { Category, CodeSystem, EntryKind, NotWarrantedSubtype, Setting } from './types.js';

export interface Fragment {
  phase: string;
  text: string;
}

export interface CriterionDef {
  key: string;
  text: string;
  support: Fragment[]; // what the chart says when the criterion is met
  nearMiss: Fragment[]; // what it says when the topic is raised but the criterion is not met
}

export interface DenialDef {
  carc: string;
  rarc?: string;
  remedy: 'fixable' | 'wrong-remedy' | 'exclusion';
  explanation: string; // payer's own words after the CARC text
}

export interface PhaseSpec {
  offset: number; // days from the anchor date (the first index encounter)
  kind: EntryKind;
}

export interface Built {
  code: string;
  codeSystem: CodeSystem;
  description: string;
  category: Category;
  setting: Setting;
  stakesUsd: number;
  patient: { age: number; sex: 'female' | 'male' };
  dosOffset: number; // days from the anchor to the date of service
  endOffset?: number; // continued stays: days from the anchor to the last denied day
  phases: Record<string, PhaseSpec>;
  baseline: Fragment[];
  criteria: CriterionDef[];
  denial: DenialDef;
  historyPhase?: string; // outpatient only: phase that takes the generic history paragraph
}

export interface BuildSpec {
  payer: Payer;
  dos: string;
  subtype?: NotWarrantedSubtype;
  failKey?: string; // criterion made absent or near-miss
  denialIndex: number;
}

export type Template = (rng: Rng, spec: BuildSpec) => Built;

export const f = (phase: string, text: string): Fragment => ({ phase, text });

export function pronouns(sex: 'female' | 'male') {
  return sex === 'female'
    ? { she: 'she', She: 'She', her: 'her', hers: 'her', him: 'her', woman: 'woman' }
    : { she: 'he', She: 'He', her: 'his', hers: 'him', him: 'him', woman: 'man' };
}

export function retroReview(payer: Payer): string {
  return `No authorization is on file. A retrospective medical necessity review may be requested with supporting clinical documentation within ${payer.appealDays} days.`;
}

export const NO_RETRO = 'No authorization is on file. Under the plan terms, services rendered without prior authorization are not eligible for retrospective review. This is an administrative determination and not a medical necessity determination.';
