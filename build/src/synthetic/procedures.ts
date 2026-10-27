// Eight procedure templates. Each builds the clinical facts for one case in
// dictation voice: the surgeon talking, not a checklist. Numbers are chosen
// per case so that the chart either clears the payer's threshold or misses it
// by a documented margin.
import type { Rng } from './rng.js';
import { monthName } from './rng.js';
import type { Payer } from './content.js';
import type { NotWarrantedSubtype } from './types.js';

export type Phase = 'letter' | 'consult' | 'pt' | 'vft' | 'imaging' | 'ncs' | 'followup1' | 'photos' | 'phone' | 'followup2' | 'preop';

export interface Fragment {
  phase: Phase;
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

export interface Built {
  cpt: string;
  description: string;
  patient: { age: number; sex: 'female' | 'male' };
  baseline: Fragment[];
  criteria: CriterionDef[];
  denial: DenialDef;
}

export interface BuildSpec {
  payer: Payer;
  dos: string;
  subtype?: NotWarrantedSubtype;
  failKey?: string; // criterion made absent or near-miss
  denialIndex: number;
}

export type ProcedureBuilder = (rng: Rng, spec: BuildSpec) => Built;

const f = (phase: Phase, text: string): Fragment => ({ phase, text });

function pronouns(sex: 'female' | 'male') {
  return sex === 'female'
    ? { she: 'she', She: 'She', her: 'her', hers: 'her', woman: 'woman' }
    : { she: 'he', She: 'He', her: 'his', hers: 'him', woman: 'man' };
}

// Schnur sliding scale, 22nd percentile, grams per breast by body surface area.
const SCHNUR: [number, number][] = [[1.35, 199], [1.40, 218], [1.50, 260], [1.60, 310], [1.70, 370], [1.80, 440], [1.90, 525], [2.00, 628], [2.10, 750], [2.20, 895], [2.30, 1068]];
function schnurGrams(bsa: number): number {
  for (let i = 1; i < SCHNUR.length; i++) {
    const [b0, g0] = SCHNUR[i - 1]!;
    const [b1, g1] = SCHNUR[i]!;
    if (bsa <= b1) return Math.round(g0 + ((bsa - b0) / (b1 - b0)) * (g1 - g0));
  }
  return 1100;
}

const reduction: ProcedureBuilder = (rng, spec) => {
  const { payer } = spec;
  const p = pronouns('female');
  const age = rng.int(28, 62);
  const heightIn = rng.int(60, 68);
  const weightLb = rng.int(150, 232);
  const bsa = Math.sqrt((heightIn * 2.54 * weightLb * 0.4536) / 3600);
  const bsaStr = bsa.toFixed(2);
  const schnur = schnurGrams(bsa);
  const flat = payer.strict;
  const threshold = flat ? 500 : schnur;
  const symptomReq = payer.strict ? 12 : 6;
  const conservativeReq = payer.strict ? 6 : 3;
  const symptomMonths = symptomReq + rng.int(3, 14);
  const conservativeMonths = conservativeReq + rng.int(1, 5);
  const ptWeeks = rng.pick([8, 10, 12]);
  const estR = threshold + rng.int(90, 260);
  const estL = estR - rng.int(0, 60);
  const lowR = threshold - rng.int(60, 140);
  const lowL = lowR - rng.int(0, 40);
  const ft = Math.floor(heightIn / 12);
  const inch = heightIn % 12;
  const n2n = rng.int(30, 38);

  const criteria: CriterionDef[] = [
    {
      key: 'symptoms',
      text: `Symptoms attributable to macromastia documented for at least ${symptomReq} months, such as neck, shoulder, or upper back pain, shoulder grooving, or inframammary intertrigo.`,
      support: [f('consult', rng.pick([
        `${p.She} has had the neck and upper back pain for ${symptomMonths} months now, maybe longer, says it is daily by the afternoon. The bra straps have worn grooves into both shoulders and ${p.she} gets the rash under the breasts every summer.`,
        `Going on ${symptomMonths} months of upper back and neck pain that ${p.she} ties to the weight of the breasts, worse by the end of a shift. Shoulder grooving from the straps, recurrent intertrigo in the folds.`,
      ]))],
      nearMiss: [f('consult', `The neck pain started maybe ${Math.max(2, symptomReq - rng.int(3, 4))} months back, around the time ${p.she} changed jobs, and ${p.she} is not sure how much of it is the breasts and how much is the new desk.`)],
    },
    {
      key: 'conservative',
      text: `At least ${conservativeReq} months of conservative treatment, including a supportive garment plus physical therapy, analgesics, or dermatologic treatment of intertrigo, without adequate relief.`,
      support: [
        f('consult', `${p.She} has been in a fitted supportive bra from the specialty shop for months, takes ibuprofen most days, treats the rash with nystatin powder. I am sending ${p.hers} to PT for posture and scapular work.`),
        f('pt', `Eval for upper back and neck pain in the setting of large breasts. Forward shoulder posture, tight pecs, weak lower traps. Plan ${ptWeeks} weeks, twice a week, scapular stabilization and postural retraining.`),
        f('followup1', `Finished ${ptWeeks} weeks of PT across the street, says it helped while ${p.she} was there and then right back to baseline. Still in the supportive bra, still on the ibuprofen, intertrigo treated with nystatin powder with partial relief. That is ${conservativeMonths} months of conservative measures without durable relief.`),
      ],
      nearMiss: [
        f('consult', `We talked about PT and I gave ${p.hers} the referral and told ${p.hers} to get a properly fitted bra. ${p.She} has not tried anything yet.`),
        f('followup1', `Has not started PT, says the copay is a problem. Did buy a new bra, not sure it is the right size. Still symptomatic.`),
      ],
    },
    {
      key: 'threshold',
      text: flat
        ? 'Estimated resection of at least 500 grams per breast.'
        : "Estimated resection weight per breast at or above the 22nd percentile of the Schnur sliding scale for the patient's body surface area.",
      support: [f('consult', `${p.She} is ${ft} foot ${inch}, ${weightLb} pounds, which puts BSA right around ${bsaStr}. Schnur 22nd percentile at that BSA is about ${schnur} grams. I am estimating ${estR} grams on the right and ${estL} on the left.`)],
      nearMiss: [f('consult', `${p.She} is ${ft} foot ${inch}, ${weightLb} pounds, BSA about ${bsaStr}, Schnur 22nd percentile around ${schnur} grams. I would estimate maybe ${lowR} on the right and ${lowL} on the left, so this is a modest reduction.`)],
    },
    {
      key: 'photos',
      text: 'Photographic documentation of macromastia and shoulder grooving.',
      support: [f('photos', `Standard pre-op photo series taken today, front, both obliques, both laterals. Grooving visible at both shoulders in the AP view, grade 3 ptosis, intertrigo in both folds.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation submitted does not establish failure of conservative therapy or an expected resection weight meeting the policy threshold.' },
    { carc: '96', rarc: 'N130', remedy: 'fixable', explanation: 'The procedure was determined to be cosmetic and is excluded from coverage.' },
    { carc: '197', remedy: 'fixable', explanation: `No authorization is on file. A retrospective medical necessity review may be requested with supporting clinical documentation within ${payer.appealDays} days.` },
    { carc: '197', remedy: 'wrong-remedy', explanation: 'No authorization is on file. Under the plan terms, elective procedures performed without prior authorization are not eligible for retrospective review. This is an administrative determination and not a medical necessity determination.' },
    { carc: '96', rarc: 'N130', remedy: 'exclusion', explanation: 'Reduction mammaplasty is a listed plan exclusion except for symmetry procedures following a covered mastectomy.' },
  ];

  if (spec.subtype === 'exclusion') {
    criteria.unshift({
      key: 'exclusion',
      text: 'Reduction mammaplasty is excluded under this plan except when performed for symmetry after a covered mastectomy for breast cancer.',
      support: [],
      nearMiss: [f('consult', 'No prior breast surgery, no personal history of breast cancer, mammogram last year was normal.')],
    });
  }

  return {
    cpt: '19318',
    description: 'bilateral reduction mammaplasty',
    patient: { age, sex: 'female' },
    baseline: [
      f('consult', `${age} year old ${p.woman} here about ${p.her} breasts, referred by ${p.her} primary. Exam: large pendulous breasts, nipple to notch ${n2n} on the right and ${n2n + 1} on the left, grade 3 ptosis, intertrigo in both inframammary folds. Discussed reduction, risks, scars, sensation, the works.`),
      f('followup1', `Back to go over the plan. Symptoms unchanged. We went through the operation again and ${p.she} wants to proceed if insurance will cover it.`),
      f('preop', `Pre-op visit. Consent signed, marked the plan on ${p.hers} in the mirror, superomedial pedicle, Wise pattern. Labs fine. Stop the ibuprofen a week out.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

const panniculectomy: ProcedureBuilder = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.8) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(32, 66);
  const stableReq = payer.strict ? 12 : 6;
  const stableMonths = stableReq + rng.int(2, 10);
  const lost = rng.int(85, 160);
  const weight = rng.int(168, 215);
  const sleeveYear = 2026 - rng.int(2, 4);
  const grade = rng.pick([2, 3]);
  const skinMonths = rng.int(5, 14);

  const criteria: CriterionDef[] = [
    {
      key: 'pannus',
      text: 'Panniculus hangs at or below the level of the pubis (grade 2 or higher) as documented on examination.',
      support: [f('consult', `On exam the pannus hangs well below the pubis, I would call it grade ${grade}, with maceration and an odor in the fold.`)],
      nearMiss: [],
    },
    {
      key: 'skin',
      text: 'Recurrent or chronic intertrigo, cellulitis, or skin breakdown beneath the panniculus that has failed at least 3 months of conservative treatment such as topical antifungals, hygiene measures, and barrier products.',
      support: [
        f('consult', `${p.She} has been fighting the rash under the apron for better than a year, treated with nystatin, then clotrimazole, keeps it dry with powder and a cloth liner, and it comes right back. Two rounds of antibiotics from the PCP for cellulitis in the fold.`),
        f('followup1', `Rash is back again despite ${skinMonths} months of the antifungal and barrier routine. Fold is red and weeping today.`),
      ],
      nearMiss: [],
    },
    {
      key: 'weight',
      text: `Weight stable within 10 pounds for at least ${stableReq} months${payer.strict ? ' (or at least 18 months after bariatric surgery)' : ''}.`,
      support: [
        f('consult', `Down ${lost} pounds after the sleeve in ${sleeveYear}. Weight has been steady at ${weight} give or take five for the last ${stableMonths} months.`),
        f('followup1', `Weight ${weight + rng.int(-3, 3)} today, holding.`),
      ],
      nearMiss: [
        f('consult', `Down ${lost} pounds since the sleeve in ${sleeveYear} and still losing, ${weight} today.`),
        f('followup1', `Weight ${weight - 15} today, down another 15 from last visit. Still losing steadily.`),
      ],
    },
    {
      key: 'function',
      text: 'The panniculus interferes with activities of daily living or ambulation.',
      support: [f('consult', `Says ${p.she} cannot walk more than a block without the skin fold chafing raw, has to lift it to wash underneath, cannot find pants that fit over it.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'The documentation does not establish a functional impairment or failure of conservative treatment of the skin condition.' },
    { carc: '96', rarc: 'N130', remedy: 'fixable', explanation: 'Abdominoplasty and related procedures are considered cosmetic.' },
    { carc: '11', remedy: 'fixable', explanation: 'The diagnosis reported does not support the procedure billed.' },
    { carc: '119', remedy: 'wrong-remedy', explanation: 'The outpatient surgical benefit maximum for the plan year has been exhausted.' },
  ];

  return {
    cpt: '15847',
    description: 'panniculectomy with excision of excess skin and subcutaneous tissue of the abdomen',
    patient: { age, sex },
    baseline: [
      f('consult', `${age} year old ${p.woman} here about the abdominal apron after ${p.her} weight loss. Nice result on the weight. Discussed panniculectomy versus a full abdominoplasty and what insurance will and will not look at.`),
      f('followup1', `Follow-up on the abdomen. Went back over the operation, drains, the scar, recovery of four to six weeks. ${p.She} understands this is skin and fat removal for the skin problems, not a tummy tuck.`),
      f('preop', `Pre-op. Consent signed. Marked the resection with ${p.hers} standing. Nicotine negative. Hold the metformin the morning of.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

const blepharoplasty: ProcedureBuilder = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.5) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(48, 80);
  const degR = rng.int(14, 22);
  const degL = degR + rng.int(-3, 3);
  const pct = rng.int(32, 48);
  const tapedR = rng.int(2, 6);
  const tapedL = rng.int(2, 6);
  const lowDeg = rng.int(6, 9);
  const lowPct = rng.int(14, 22);
  const mrd = rng.pick(['1', '1.5', '2']);

  const criteria: CriterionDef[] = [
    {
      key: 'vft',
      text: payer.strict
        ? 'Automated visual field testing demonstrating at least 30 percent loss of the superior visual field, with improvement when the upper lids are taped.'
        : 'Visual field testing demonstrating at least 12 degrees of superior visual field loss, with improvement when the upper lids are taped.',
      support: [f('vft', `Humphrey superior field, untaped: ${degR} degrees of superior field remaining on the right and ${degL} on the left, which works out to about ${pct} percent loss of the superior field. Taped: improves to ${degR + 14 + tapedR} right and ${degL + 14 + tapedL} left. Reliable test, fixation losses low.`)],
      nearMiss: [f('vft', `Humphrey superior field, untaped: ${lowDeg} degrees of superior field loss on the right and ${lowDeg - 1} on the left, roughly ${lowPct} percent. Taped: modest improvement, about 3 degrees each side.`)],
    },
    {
      key: 'lid',
      text: 'Photographs documenting redundant upper lid skin resting on or over the lashes, or a margin reflex distance 1 of 2 millimeters or less.',
      support: [f('photos', `Frontal and lateral photos today, primary gaze, flash. Redundant upper lid skin draping onto the lashes on both sides. MRD1 about ${mrd} millimeters right and ${mrd} left.`)],
      nearMiss: [],
    },
    {
      key: 'function',
      text: 'A documented functional complaint such as difficulty reading or driving, loss of the superior field, or brow fatigue.',
      support: [f('consult', `${p.She} says ${p.she} is lifting ${p.her} brows all day to see, gets a headache by evening, has given up night driving, tilts ${p.her} head back to read the paper.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Visual field documentation submitted does not meet the policy threshold for functional impairment.' },
    { carc: '11', remedy: 'fixable', explanation: 'The diagnosis reported does not support a functional indication for the procedure.' },
    { carc: '96', rarc: 'N130', remedy: 'fixable', explanation: 'Eyelid surgery is considered cosmetic in the absence of documented visual impairment.' },
  ];

  return {
    cpt: '15823',
    description: 'bilateral upper eyelid blepharoplasty with excessive skin weighting down the lid',
    patient: { age, sex },
    baseline: [
      f('consult', `${age} year old ${p.woman} sent over by ${p.her} eye doctor for heavy upper lids. Exam: marked dermatochalasis both upper lids, skin hooding over the lashes laterally, brow ptosis mild, no true ptosis of the lid itself, levator function good. Discussed upper lid blepharoplasty.`),
      f('followup1', `Back to review the testing. Went over the operation, bruising, the scar in the crease, the small chance of dry eye. ${p.She} wants to go ahead.`),
      f('preop', `Pre-op. Consent signed. Marked the skin excision sitting up. No blood thinners. Stop the fish oil.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

const septoplasty: ProcedureBuilder = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.6) ? 'male' : 'female';
  const p = pronouns(sex);
  const age = rng.int(19, 65);
  const side = rng.pick(['left', 'right']);
  const other = side === 'left' ? 'right' : 'left';
  const months = rng.int(5, 18);
  const trialReq = payer.strict ? 6 : 4;
  const trialWeeks = trialReq + rng.int(2, 8);
  const pctOpen = rng.int(25, 40);

  const criteria: CriterionDef[] = [
    {
      key: 'symptoms',
      text: 'Nasal airway obstruction symptoms persisting for at least 3 months.',
      support: [f('consult', `Cannot breathe through the ${side} side for going on ${months} months, mouth-breathes at night, ${p.her} spouse says the snoring is worse.`)],
      nearMiss: [],
    },
    {
      key: 'medical',
      text: `Failure of at least ${trialReq} weeks of an intranasal corticosteroid together with an oral or intranasal antihistamine.`,
      support: [
        f('consult', `${p.She} has been on fluticasone two sprays each side daily plus loratadine since ${p.her} PCP started them, says it does nothing for the ${side} side.`),
        f('followup1', `${trialWeeks} weeks on the fluticasone and loratadine now, used it every day per ${p.hers}, no change in the ${side} sided obstruction.`),
      ],
      nearMiss: [
        f('consult', `Started ${p.hers} on fluticasone today, two sprays each side, see back in a few weeks.`),
        f('followup1', `Says ${p.she} used the spray for about a week and stopped because it burned. Has not tried anything else.`),
      ],
    },
    {
      key: 'anatomy',
      text: 'Physical examination or imaging documenting septal deviation obstructing the nasal airway, with symptoms not explained by mucosal disease alone.',
      support: [
        f('consult', `Anterior rhinoscopy: septum deviated to the ${side} with a caudal spur contacting the inferior turbinate, ${side} airway maybe ${pctOpen} percent of the ${other}. Turbinates decongest fine with oxymetazoline, the ${side} side does not open up.`),
        f('imaging', `CT sinus without contrast: ${side}ward septal deviation with a bony spur abutting the ${side} inferior turbinate, no significant sinus disease, no polyps.`),
      ],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish failure of medical management or an anatomic obstruction.' },
    { carc: '197', remedy: 'fixable', explanation: `No authorization is on file. A retrospective medical necessity review may be requested with supporting clinical documentation within ${payer.appealDays} days.` },
    { carc: '167', remedy: 'fixable', explanation: 'The diagnosis reported (chronic rhinitis) is not a covered indication for this procedure.' },
  ];

  return {
    cpt: '30520',
    description: 'septoplasty with or without cartilage scoring, contouring, or replacement with graft',
    patient: { age, sex },
    baseline: [
      f('consult', `${age} year old ${p.woman} here for nasal obstruction. Broke the nose playing ball as a teenager, never fixed. Discussed septoplasty, possible turbinate reduction, recovery of a week or so.`),
      f('followup1', `Follow-up on the nose. Reviewed the imaging with ${p.hers}. Still wants to proceed.`),
      f('preop', `Pre-op. Consent signed, septoplasty with possible inferior turbinate reduction. No aspirin for ten days.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

const capsulectomy: ProcedureBuilder = (rng, spec) => {
  const { payer } = spec;
  const p = pronouns('female');
  const age = rng.int(35, 70);
  const year = 2026 - rng.int(5, 14);
  const months = rng.int(4, 14);
  const exclusion = spec.subtype === 'exclusion';

  const criteria: CriterionDef[] = [
    {
      key: 'complication',
      text: 'Baker grade III or IV capsular contracture with pain or deformity, or implant rupture confirmed by imaging.',
      support: [
        f('consult', `Right breast is hard as a rock, distorted upward, tender to the touch, I would grade it Baker IV. Left is a Baker III, firm but not painful.`),
        f('imaging', `MRI breast implants: right implant with a linguine sign consistent with intracapsular rupture, thickened capsule. Left implant intact with a thickened capsule and no rupture.`),
      ],
      nearMiss: [f('consult', `Some firmness on the right, I would call it a Baker II, not painful, no distortion. Left is soft.`)],
    },
    {
      key: 'origin',
      text: exclusion
        ? 'Capsulectomy and implant removal are not covered when the original implants were placed for cosmetic augmentation, regardless of subsequent complication.'
        : payer.strict
          ? 'The original implants were placed for reconstruction after mastectomy, for a congenital deformity, or for another covered medical indication.'
          : 'The indication for the original implant placement is documented.',
      support: exclusion ? [] : [f('consult', `Implants were placed in ${year} as part of ${p.her} reconstruction after a right mastectomy for cancer, left side for symmetry.`)],
      nearMiss: [f('consult', `Implants went in in ${year}, cosmetic augmentation, saline, done out of state. No history of breast cancer.`)],
    },
    {
      key: 'duration',
      text: 'Symptoms documented for at least 3 months.',
      support: [f('consult', `The hardening on the right started about ${months} months ago and has gotten steadily worse, now hurts to lie on that side.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish a grade III or IV contracture or a confirmed rupture.' },
    { carc: '96', rarc: 'N130', remedy: 'fixable', explanation: 'Revision of breast implants is considered cosmetic.' },
    { carc: '151', rarc: 'N10', remedy: 'fixable', explanation: 'A revision procedure on the same breast was paid within the prior six years; the documentation does not support an additional procedure.' },
    { carc: '96', rarc: 'N130', remedy: 'exclusion', explanation: 'Complications of cosmetic implants are a listed plan exclusion.' },
  ];

  return {
    cpt: '19371',
    description: 'periprosthetic capsulectomy, breast, with implant removal',
    patient: { age, sex: 'female' },
    baseline: [
      f('consult', `${age} year old ${p.woman} here about ${p.her} implants. Discussed capsulectomy with implant removal and the options for replacement versus leaving them out.`),
      f('followup1', `Back to go over the MRI and the plan. ${p.She} wants the right one out and both capsules addressed.`),
      f('preop', `Pre-op. Consent signed for bilateral capsulectomy with implant removal, right side en bloc if the capsule allows. Labs fine.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

const reconstruction: ProcedureBuilder = (rng, spec) => {
  const p = pronouns('female');
  const age = rng.int(32, 70);
  const months = rng.int(3, 9);
  const cm = (rng.int(12, 34) / 10).toFixed(1);
  const side = rng.pick(['right', 'left']);
  const exchangeMonths = rng.pick([3, 4, 6]);

  const criteria: CriterionDef[] = [
    {
      key: 'mastectomy',
      text: 'Documented mastectomy for breast cancer, or prophylactic mastectomy for a qualifying risk, with reconstruction requested by the patient. Reconstruction after a covered mastectomy is a mandated benefit under the Women’s Health and Cancer Rights Act.',
      support: [
        f('letter', `From the breast surgeon: ${side} total mastectomy performed ${months} months ago for a ${cm} centimeter invasive ductal carcinoma, sentinel nodes negative, margins clear. ${p.She} has completed adjuvant chemotherapy and wishes to proceed with reconstruction.`),
        f('consult', `Status post ${side} mastectomy ${months} months ago for a ${cm} centimeter invasive ductal. Done with chemo. ${p.She} wants reconstruction and has thought hard about it.`),
      ],
      nearMiss: [],
    },
    {
      key: 'plan',
      text: 'An operative plan for staged reconstruction (tissue expander placement followed by implant exchange) appropriate to the patient’s radiation status and tissue quality.',
      support: [f('consult', `No radiation planned per oncology. Good skin envelope, no infection, mastectomy flap healed. Plan is a ${side} tissue expander under the pectoralis now, exchange to a permanent implant in about ${exchangeMonths} months, and a ${side === 'right' ? 'left' : 'right'} lift for symmetry later.`)],
      nearMiss: [],
    },
    {
      key: 'fitness',
      text: 'Medical clearance for the planned surgery is documented.',
      support: [f('preop', `Pre-op. Cleared by ${p.her} PCP, letter in the chart, labs and EKG fine. Consent signed for ${side} tissue expander placement.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '197', remedy: 'fixable', explanation: `No authorization is on file. A retrospective medical necessity review may be requested with supporting clinical documentation within ${spec.payer.appealDays} days.` },
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish a covered indication for breast reconstruction.' },
    { carc: '11', remedy: 'fixable', explanation: 'The diagnosis reported does not support the procedure billed.' },
    { carc: '29', remedy: 'wrong-remedy', explanation: `The claim was received more than ${spec.payer.timelyFilingDays} days after the date of service.` },
  ];

  return {
    cpt: '19357',
    description: 'breast reconstruction, immediate or delayed, with tissue expander',
    patient: { age, sex: 'female' },
    baseline: [
      f('consult', `${age} year old ${p.woman} referred by the breast surgeon for reconstruction. Went over expanders versus flaps, ${p.she} prefers the expander route, fewer operations and no donor site.`),
      f('followup1', `Back with ${p.her} sister to go over the plan again. Questions answered. Ready to schedule.`),
      f('phone', `Called to let ${p.hers} know the surgery date is set and that we are submitting to the insurance.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

const lipedema: ProcedureBuilder = (rng, spec) => {
  const { payer } = spec;
  const p = pronouns('female');
  const age = rng.int(25, 60);
  const stage = rng.pick([2, 3]);
  const consReq = payer.strict ? 6 : 3;
  const consMonths = consReq + rng.int(2, 9);
  const exclusion = spec.subtype === 'exclusion';

  const criteria: CriterionDef[] = exclusion
    ? [{
        key: 'coverage',
        text: 'Liposuction for lipedema is considered investigational and is not a covered benefit under this plan under any circumstances.',
        support: [],
        nearMiss: [],
      }]
    : [
        {
          key: 'diagnosis',
          text: 'Diagnosis of lipedema stage II or III documented on examination: bilateral symmetric disproportionate adiposity of the limbs sparing the feet, negative Stemmer sign, tenderness, and easy bruising.',
          support: [f('consult', `Classic picture. Column legs out of all proportion to ${p.her} waist, cuff sign at the ankles, feet spared, Stemmer negative, exquisitely tender to pinch over the thighs, bruises if you look at ${p.hers}. Stage ${stage}.`)],
          nearMiss: [],
        },
        {
          key: 'conservative',
          text: `At least ${consReq} months of conservative therapy including compression garments and manual lymphatic drainage or supervised exercise, with persistent pain or functional impairment.`,
          support: [
            f('consult', `${p.She} has been in class 2 flat-knit compression daily for ${consMonths} months, MLD weekly with the lymphedema therapist across town, water aerobics twice a week, and ${p.she} is still in pain and the legs have not budged.`),
            f('pt', `Lymphedema therapy visit. Manual lymphatic drainage both lower extremities, compression check, garments fitting well, ${p.she} reports wearing them daily. Pain unchanged at 6 out of 10.`),
          ],
          nearMiss: [f('consult', `${p.She} bought some compression stockings online, not sure ${p.she} wears them much. Has not done any lymphatic drainage. We talked about starting a real program.`)],
        },
        {
          key: 'function',
          text: 'Pain or impaired mobility attributable to lipedema.',
          support: [f('consult', `Says ${p.she} cannot stand through a shift anymore, pain in the thighs is constant, stairs are hard because the legs knock together.`)],
          nearMiss: [],
        },
      ];

  const denials: DenialDef[] = [
    { carc: '56', remedy: 'fixable', explanation: 'Coverage criteria in the medical policy for lipedema were not met based on the documentation submitted.' },
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish failure of conservative therapy.' },
    { carc: '56', rarc: 'N130', remedy: 'exclusion', explanation: 'Liposuction for lipedema is investigational under the plan and is not covered.' },
  ];

  return {
    cpt: '15877',
    description: 'suction assisted lipectomy, trunk and lower extremities, for lipedema',
    patient: { age, sex: 'female' },
    baseline: [
      f('consult', `${age} year old ${p.woman} here about ${p.her} legs, self-referred after reading about lipedema. Mother and aunt had the same legs. Discussed lymph-sparing liposuction, staged, and that it is debulking, not a cure.`),
      f('followup1', `Follow-up. Reviewed photos and measurements, legs unchanged. Went over the staged plan and the compression afterward.`),
      f('preop', `Pre-op for stage one, thighs. Consent signed. Marked standing. Garments ordered.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

const carpalTunnel: ProcedureBuilder = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.6) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(30, 70);
  const side = rng.pick(['right', 'left']);
  const splintReq = payer.strict ? 6 : 4;
  const splintWeeks = splintReq + rng.int(2, 8);
  const months = rng.int(3, 11);
  const sensLat = (rng.int(42, 56) / 10).toFixed(1);
  const motLat = (rng.int(48, 64) / 10).toFixed(1);
  const injMonth = monthName(spec.dos).slice(0, 3);

  const criteria: CriterionDef[] = [
    {
      key: 'symptoms',
      text: 'Symptoms consistent with carpal tunnel syndrome, such as nocturnal paresthesias in the median nerve distribution with a positive Tinel or Phalen sign, present for at least 6 weeks.',
      support: [f('consult', `${months} months of numbness and tingling in the thumb, index, and middle fingers on the ${side}, wakes ${p.hers} at night, shakes it out. Positive Tinel at the ${side} wrist, Phalen positive in about 20 seconds. Some early thenar weakness, no atrophy yet.`)],
      nearMiss: [],
    },
    {
      key: 'conservative',
      text: `Failure of at least ${splintReq} weeks of conservative management including neutral wrist splinting, together with NSAIDs, activity modification, or a corticosteroid injection.`,
      support: [f('consult', `Splinted at night for ${splintWeeks} weeks, naproxen twice a day, moved the mouse to the other hand, and had a steroid shot in the ${side} carpal tunnel from the PCP that helped for about three weeks and wore off.`)],
      nearMiss: [
        f('consult', `Gave ${p.hers} a wrist splint to wear at night and told ${p.hers} to try ibuprofen, and we will see.`),
        f('followup1', `Says the splint is too hot and ${p.she} has not been wearing it. Has not tried the ibuprofen regularly either.`),
      ],
    },
    {
      key: 'ncs',
      text: 'Electrodiagnostic testing (nerve conduction study or electromyography) confirming median neuropathy at the wrist, unless thenar atrophy or constant sensory loss is present.',
      support: [f('ncs', `Nerve conduction study, ${side} upper extremity. Median sensory peak latency ${sensLat} milliseconds across the wrist, prolonged. Median motor distal latency ${motLat} milliseconds, prolonged. Ulnar normal. Consistent with moderate ${side} median neuropathy at the wrist.`)],
      nearMiss: [f('consult', `We will get nerve studies ordered before we talk about surgery.`)],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish failure of conservative treatment or electrodiagnostic confirmation.' },
    { carc: '151', rarc: 'N10', remedy: 'fixable', explanation: 'Bilateral release on the same date of service is not supported by the documentation submitted.' },
    { carc: '11', remedy: 'fixable', explanation: 'The diagnosis reported does not support the procedure billed.' },
    { carc: '4', remedy: 'wrong-remedy', explanation: 'Modifier 50 was billed together with modifier RT on the same line. Resubmit a corrected claim.' },
  ];

  return {
    cpt: '64721',
    description: 'neuroplasty and/or transposition, median nerve at carpal tunnel',
    patient: { age, sex },
    baseline: [
      f('consult', `${age} year old ${p.woman} here for the ${side} hand, referred by the PCP. Works on a keyboard all day. Discussed carpal tunnel release, open versus endoscopic, recovery.`),
      f('followup1', `Back to review the plan for the ${side} hand. Still symptomatic. Wants to proceed.`),
      f('preop', `Pre-op. Consent signed for ${side} open carpal tunnel release under local with sedation. Marked.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const PROCEDURES: Record<string, ProcedureBuilder> = {
  '19318': reduction,
  '15847': panniculectomy,
  '15823': blepharoplasty,
  '30520': septoplasty,
  '19371': capsulectomy,
  '19357': reconstruction,
  '15877': lipedema,
  '64721': carpalTunnel,
};
