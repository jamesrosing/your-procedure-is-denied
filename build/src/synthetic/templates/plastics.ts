import { f, pronouns, retroReview, type Template, type CriterionDef, type DenialDef } from '../template.js';

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

export const reductionMammaplasty: Template = (rng, spec) => {
  const { payer } = spec;
  const p = pronouns('female');
  const age = rng.int(28, 62);
  const heightIn = rng.int(60, 68);
  const weightLb = rng.int(150, 232);
  const bsa = Math.sqrt((heightIn * 2.54 * weightLb * 0.4536) / 3600);
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
  const ft = Math.floor(heightIn / 12);
  const inch = heightIn % 12;
  const dosOffset = rng.int(270, 400);
  const followup1 = rng.int(45, 80);

  const criteria: CriterionDef[] = [
    {
      key: 'symptoms',
      text: `Symptoms attributable to macromastia documented for at least ${symptomReq} months, such as neck, shoulder, or upper back pain, shoulder grooving, or inframammary intertrigo.`,
      support: [f('consult', `Going on ${symptomMonths} months of upper back and neck pain that ${p.she} ties to the weight of the breasts, worse by the end of a shift. Shoulder grooving from the straps, recurrent intertrigo in the folds.`)],
      nearMiss: [f('consult', `The neck pain started maybe ${Math.max(2, symptomReq - 3)} months back, around the time ${p.she} changed jobs.`)],
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
      text: flat ? 'Estimated resection of at least 500 grams per breast.' : "Estimated resection weight per breast at or above the 22nd percentile of the Schnur sliding scale for the patient's body surface area.",
      support: [f('consult', `${p.She} is ${ft} foot ${inch}, ${weightLb} pounds, which puts BSA right around ${bsa.toFixed(2)}. Schnur 22nd percentile at that BSA is about ${schnur} grams. I am estimating ${estR} grams on the right and ${estL} on the left.`)],
      nearMiss: [f('consult', `${p.She} is ${ft} foot ${inch}, ${weightLb} pounds, BSA about ${bsa.toFixed(2)}, Schnur 22nd percentile around ${schnur} grams. I would estimate maybe ${lowR} on the right and ${lowR - 20} on the left, so this is a modest reduction.`)],
    },
    {
      key: 'photos',
      text: 'Photographic documentation of macromastia and shoulder grooving.',
      support: [f('photos', 'Standard pre-op photo series taken today, front, both obliques, both laterals. Grooving visible at both shoulders in the AP view, grade 3 ptosis, intertrigo in both folds.')],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation submitted does not establish failure of conservative therapy or an expected resection weight meeting the policy threshold.' },
    { carc: '96', rarc: 'N130', remedy: 'fixable', explanation: 'The procedure was determined to be cosmetic and is excluded from coverage.' },
    { carc: '197', remedy: 'fixable', explanation: retroReview(payer) },
  ];

  return {
    code: '19318', codeSystem: 'CPT', description: 'bilateral reduction mammaplasty', category: 'plastic surgery', setting: 'outpatient', stakesUsd: 9000,
    patient: { age, sex: 'female' },
    dosOffset,
    phases: {
      consult: { offset: 0, kind: 'office visit' },
      pt: { offset: 7, kind: 'physical therapy' },
      followup1: { offset: followup1, kind: 'office visit' },
      photos: { offset: followup1, kind: 'photo documentation' },
      preop: { offset: dosOffset - rng.int(7, 21), kind: 'preoperative visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} here about ${p.her} breasts, referred by ${p.her} primary. Exam: large pendulous breasts, nipple to notch ${rng.int(30, 38)} on the right and a centimeter more on the left, grade 3 ptosis, intertrigo in both inframammary folds. Discussed reduction, risks, scars, sensation, the works.`),
      f('followup1', `Back to go over the plan. Symptoms unchanged. We went through the operation again and ${p.she} wants to proceed if insurance will cover it.`),
      f('preop', 'Pre-op visit. Consent signed, marked the plan in the mirror, superomedial pedicle, Wise pattern. Labs fine. Stop the ibuprofen a week out.'),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const breastReconstruction: Template = (rng, spec) => {
  const p = pronouns('female');
  const age = rng.int(32, 70);
  const months = rng.int(3, 9);
  const cm = (rng.int(12, 34) / 10).toFixed(1);
  const side = rng.pick(['right', 'left']);
  const other = side === 'right' ? 'left' : 'right';
  const exchangeMonths = rng.pick([3, 4, 6]);
  const dosOffset = rng.int(40, 90);

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
      support: [f('consult', `No radiation planned per oncology. Good skin envelope, no infection, mastectomy flap healed. Plan is a ${side} tissue expander under the pectoralis now, exchange to a permanent implant in about ${exchangeMonths} months, and a ${other} lift for symmetry later.`)],
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
    { carc: '197', remedy: 'fixable', explanation: retroReview(spec.payer) },
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish a covered indication for breast reconstruction.' },
    { carc: '11', remedy: 'fixable', explanation: 'The diagnosis reported does not support the procedure billed.' },
    { carc: '29', remedy: 'wrong-remedy', explanation: `The claim was received more than ${spec.payer.timelyFilingDays} days after the date of service.` },
  ];

  return {
    code: '19357', codeSystem: 'CPT', description: 'breast reconstruction with tissue expander', category: 'plastic surgery', setting: 'outpatient', stakesUsd: 12000,
    patient: { age, sex: 'female' },
    dosOffset,
    phases: {
      letter: { offset: -rng.int(5, 20), kind: 'outside letter' },
      consult: { offset: 0, kind: 'office visit' },
      followup1: { offset: rng.int(14, 25), kind: 'office visit' },
      preop: { offset: dosOffset - rng.int(5, 12), kind: 'preoperative visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} referred by the breast surgeon for reconstruction. Went over expanders versus flaps, ${p.she} prefers the expander route, fewer operations and no donor site.`),
      f('followup1', `Back with ${p.her} sister to go over the plan again. Questions answered. Ready to schedule.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};
