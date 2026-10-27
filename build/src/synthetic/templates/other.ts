import { f, pronouns, NO_RETRO, type Template, type CriterionDef, type DenialDef } from '../template.js';

export const skinSubstituteDfu: Template = (rng, spec) => {
  const sex = rng.chance(0.6) ? 'male' : 'female';
  const p = pronouns(sex);
  const age = rng.int(52, 78);
  const side = rng.pick(['right', 'left']);
  const w0 = (rng.int(28, 36) / 10).toFixed(1);
  const l0 = (rng.int(20, 26) / 10).toFixed(1);
  const area0 = (Number(w0) * Number(l0)).toFixed(1);
  const w4 = (Number(w0) - 0.2).toFixed(1);
  const l4 = (Number(l0) - 0.1).toFixed(1);
  const area4 = (Number(w4) * Number(l4)).toFixed(1);
  const pctDown = Math.round((1 - Number(area4) / Number(area0)) * 100);
  const a1c = (rng.int(72, 98) / 10).toFixed(1);
  const weeksPresent = rng.int(6, 10);

  const criteria: CriterionDef[] = [
    {
      key: 'ulcer',
      text: 'Full-thickness diabetic foot ulcer, Wagner grade 1 or 2, present for at least 4 weeks, without exposed bone or tendon, active infection, or osteomyelitis.',
      support: [
        f('wound1', `Plantar ${side} forefoot ulcer under the first metatarsal head, present ${weeksPresent} weeks, ${w0} by ${l0} centimeters and 0.3 deep, full thickness into subcutaneous tissue, does not probe to bone, no exposed tendon, Wagner grade 2. No cellulitis, no drainage, no odor.`),
        f('xray', `${side === 'right' ? 'Right' : 'Left'} foot three views: no osteomyelitis, no soft tissue gas, no foreign body. Neuropathic changes at the midfoot.`),
      ],
      nearMiss: [],
    },
    {
      key: 'standardCare',
      text: 'At least 4 weeks of standard wound care with documented serial measurements showing less than 50 percent reduction in wound area: sharp debridement, offloading, moist wound dressings, infection control, and glycemic management.',
      support: [
        f('wound2', `Week 1 of standard care. Sharp debridement to healthy bleeding tissue, collagen dressing, offloading boot worn per patient. ${w0} by ${l0}.`),
        f('wound3', `Week 2. Sharp debridement, collagen dressing. ${(Number(w0) - 0.1).toFixed(1)} by ${l0}. Boot compliance good.`),
        f('wound4', `Week 3. Sharp debridement, collagen dressing. ${w4} by ${(Number(l0) - 0.1).toFixed(1)}. Slow.`),
        f('wound5', `Week 4. ${w4} by ${l4}, area ${area4} square centimeters, down from ${area0} at the start, about ${pctDown} percent reduction after 4 weeks of standard care with debridement, offloading, and moist dressings. Less than 50 percent; qualifies for a cellular tissue product. Sharp debridement today.`),
      ],
      nearMiss: [],
    },
    {
      key: 'perfusion',
      text: 'Adequate arterial perfusion documented: ankle-brachial index of 0.7 or greater, toe pressure of 40 mmHg or greater, or transcutaneous oxygen pressure of 30 mmHg or greater.',
      support: [f('vascLab', `Arterial studies. Ankle-brachial index ${side} ${(rng.int(88, 104) / 100).toFixed(2)}, ${side === 'right' ? 'left' : 'right'} ${(rng.int(90, 106) / 100).toFixed(2)}, triphasic waveforms, ${side} toe pressure ${rng.int(58, 76)} mmHg. Adequate perfusion for healing.`)],
      nearMiss: [],
    },
    {
      key: 'control',
      text: 'Hemoglobin A1c of 12 percent or less, an offloading device in place, and tobacco cessation counseling where applicable.',
      support: [
        f('labs', `Hemoglobin A1c ${a1c} percent. Creatinine ${(rng.int(9, 15) / 10).toFixed(1)}. Albumin 3.8.`),
        f('wound1', `Offloading boot dispensed today, fitted, ${p.she} agrees to wear it for all weight bearing. Nonsmoker.`),
      ],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not meet coverage criteria for cellular and tissue-based products for wounds.' },
    { carc: '56', remedy: 'fixable', explanation: 'The skin substitute product billed is considered investigational for this indication.' },
    { carc: '151', rarc: 'N10', remedy: 'fixable', explanation: 'The number of applications billed exceeds what the documentation supports for this wound.' },
  ];

  return {
    code: '15271', codeSystem: 'CPT', description: 'application of skin substitute graft to the foot, first 25 square centimeters, diabetic foot ulcer', category: 'wound care', setting: 'outpatient', stakesUsd: 8000,
    patient: { age, sex },
    dosOffset: 35,
    historyPhase: 'wound1',
    phases: {
      wound1: { offset: 0, kind: 'wound care visit' },
      labs: { offset: 2, kind: 'laboratory result' },
      vascLab: { offset: 7, kind: 'vascular laboratory' },
      xray: { offset: 7, kind: 'imaging' },
      wound2: { offset: 7, kind: 'wound care visit' },
      wound3: { offset: 14, kind: 'wound care visit' },
      wound4: { offset: 21, kind: 'wound care visit' },
      wound5: { offset: 28, kind: 'wound care visit' },
      application: { offset: 35, kind: 'procedure note' },
    },
    baseline: [
      f('wound1', `${age} year old ${p.woman} with type 2 diabetes for ${rng.int(12, 25)} years and peripheral neuropathy, new to the wound center, referred by podiatry. Did not notice the ulcer until ${p.her} ${rng.pick(['spouse', 'daughter', 'podiatrist'])} saw blood on the sock.`),
      f('application', `Application of a cellular tissue-based product to the ${side} plantar forefoot ulcer after sharp debridement, 4 square centimeters, secured with a nonadherent dressing and the offloading boot. Weekly follow-up.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const infliximabCrohns: Template = (rng, spec) => {
  const sex = rng.chance(0.5) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(22, 48);
  const hbi = rng.int(9, 13);
  const kg = rng.int(55, 92);
  const dose = Math.round((kg * 5) / 100) * 100;

  const criteria: CriterionDef[] = [
    {
      key: 'severity',
      text: 'Moderately to severely active Crohn disease documented by a Harvey-Bradshaw Index of 8 or more (or Crohn Disease Activity Index of 220 or more), or endoscopic evidence of active disease.',
      support: [
        f('consult', `Harvey-Bradshaw Index ${hbi} today: ${rng.int(5, 8)} liquid stools a day, abdominal pain most days, feels generally unwell, down ${rng.int(8, 14)} pounds in 3 months.`),
        f('colonoscopy', `Colonoscopy with ileal intubation. Deep serpiginous ulcers with cobblestoning in the terminal ileum and ascending colon, normal rectum and left colon. Simple Endoscopic Score for Crohn Disease 14. Biopsies taken.`),
        f('path', `Terminal ileum and ascending colon biopsies: chronic active ileocolitis with crypt distortion and a non-necrotizing granuloma. Consistent with Crohn disease.`),
      ],
      nearMiss: [],
    },
    {
      key: 'stepTherapy',
      text: 'Inadequate response, intolerance, or contraindication to conventional therapy with a corticosteroid course and an immunomodulator (azathioprine, 6-mercaptopurine, or methotrexate), unless the disease is fistulizing.',
      support: [f('medRecord', `Prednisone 40 daily with a taper starting ${rng.int(7, 9)} months ago, flared at 10 milligrams; second taper ${rng.int(4, 5)} months ago, flared again at 15. Azathioprine 150 daily (2.5 per kilo) for 5 months with therapeutic metabolite levels and no improvement in the Harvey-Bradshaw Index. Mesalamine stopped as ineffective.`)],
      nearMiss: [f('medRecord', `Prednisone 40 daily started 3 weeks ago, improving. Azathioprine discussed, not yet started; thiopurine methyltransferase pending.`)],
    },
    {
      key: 'screening',
      text: 'Negative tuberculosis and hepatitis B screening before the first dose.',
      support: [f('labs', `Interferon-gamma release assay negative. Hepatitis B surface antigen negative, core antibody negative, surface antibody positive from vaccination. Chest X-ray clear. Hepatitis C antibody negative.`)],
      nearMiss: [],
    },
    {
      key: 'prescriber',
      text: 'Prescribed by or in consultation with a gastroenterologist, at weight-based dosing of 5 mg/kg at weeks 0, 2, and 6 for induction.',
      support: [f('infusion', `Infliximab induction dose 1, ${dose} milligrams (5 per kilo at ${kg} kilograms) intravenous over 2 hours per gastroenterology, premedicated, tolerated without reaction. Week 2 and week 6 doses scheduled.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish failure of conventional therapy as required by the step therapy policy.' },
    { carc: '197', remedy: 'wrong-remedy', explanation: NO_RETRO },
  ];

  return {
    code: 'J1745', codeSystem: 'HCPCS', description: 'infliximab injection, 10 mg units, induction for moderate to severe Crohn disease', category: 'biologic therapy', setting: 'outpatient', stakesUsd: 6000,
    patient: { age, sex },
    dosOffset: 21,
    phases: {
      colonoscopy: { offset: -20, kind: 'procedure note' },
      path: { offset: -18, kind: 'pathology report' },
      consult: { offset: 0, kind: 'office visit' },
      medRecord: { offset: 0, kind: 'medication record' },
      labs: { offset: 3, kind: 'laboratory result' },
      followup1: { offset: 14, kind: 'office visit' },
      infusion: { offset: 21, kind: 'infusion note' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in gastroenterology follow-up for ileocolonic Crohn disease diagnosed ${rng.int(1, 3)} years ago. Missing work, up at night. Discussed moving to an anti-TNF agent, the infusion schedule, infection risk, and screening before the first dose.`),
      f('followup1', `Screening labs reviewed and negative. Consent for infliximab signed. First infusion scheduled next week; the prior authorization request went in today.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const sleeveGastrectomy: Template = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.7) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(28, 58);
  const heightIn = rng.int(61, 70);
  const bmi = (rng.int(400, 470) / 10).toFixed(1);
  const weight = Math.round((Number(bmi) * heightIn * heightIn) / 703);
  const programReq = payer.strict ? 6 : 3;
  const exclusion = spec.subtype === 'exclusion';

  const visitFragments = Array.from({ length: 6 }, (_, k) => f(`program${k + 1}`, `Supervised weight management visit ${k + 1} of 6. Weight ${weight + 12 - k * 2} pounds. Reviewed the food log, 1,500 calorie plan, walking 30 minutes 5 days a week. ${rng.pick(['Doing well with breakfast', 'Struggling with evening snacking', 'Drinking more water', 'Added a second walk on weekends'])}.`));

  const criteria: CriterionDef[] = [
    {
      key: 'bmi',
      text: 'Body mass index of 40 or more, or 35 or more with at least one obesity-related comorbidity (type 2 diabetes, obstructive sleep apnea, or hypertension).',
      support: [
        f('consult', `BMI ${bmi} at ${Math.floor(heightIn / 12)} foot ${heightIn % 12} and ${weight} pounds. Type 2 diabetes on metformin with an A1c of ${(rng.int(70, 84) / 10).toFixed(1)}, obstructive sleep apnea on CPAP, hypertension on two agents.`),
        f('sleep', `Polysomnography. Apnea-hypopnea index ${rng.int(22, 41)} per hour, oxygen nadir ${rng.int(78, 85)} percent. Moderate to severe obstructive sleep apnea. CPAP titrated to ${rng.int(9, 13)} centimeters of water.`),
      ],
      nearMiss: [],
    },
    {
      key: 'program',
      text: `Participation in a physician-supervised weight management program for at least ${programReq} consecutive months within the past 2 years, with monthly visits documenting diet, exercise, and weight.`,
      support: visitFragments,
      nearMiss: [],
    },
    {
      key: 'psych',
      text: 'Psychological evaluation finding no untreated eating disorder, substance use disorder, or psychiatric condition that would impair adherence to the postoperative regimen.',
      support: [f('psych', `Pre-bariatric psychological evaluation. No binge eating disorder, no purging, no substance use, depression in remission on sertraline with a PHQ-9 of ${rng.int(2, 6)}. Understands the lifelong dietary changes. Cleared for surgery.`)],
      nearMiss: [],
    },
    {
      key: 'nutrition',
      text: 'Nutrition evaluation and education on the postoperative diet completed.',
      support: [f('nutrition', `Registered dietitian evaluation. Reviewed the staged postoperative diet, protein goals of 60 to 80 grams, vitamin and mineral supplementation for life, and fluid separation from meals. Teach-back successful.`)],
      nearMiss: [],
    },
  ];
  if (exclusion) {
    criteria.unshift({
      key: 'coverage',
      text: 'Bariatric surgery for the treatment of obesity is excluded under this plan regardless of body mass index or comorbid conditions.',
      support: [],
      nearMiss: [],
    });
  }

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not demonstrate completion of the required supervised weight management program.' },
    { carc: '96', rarc: 'N130', remedy: 'exclusion', explanation: 'Bariatric surgery is a listed plan exclusion.' },
  ];

  const dosOffset = rng.int(70, 110);
  const phases: Record<string, { offset: number; kind: 'office visit' | 'sleep study' | 'psychological evaluation' | 'nutrition evaluation' | 'preoperative visit' }> = {
    sleep: { offset: -30, kind: 'sleep study' },
    consult: { offset: 0, kind: 'office visit' },
    psych: { offset: 15, kind: 'psychological evaluation' },
    nutrition: { offset: 20, kind: 'nutrition evaluation' },
    followup1: { offset: 40, kind: 'office visit' },
    preop: { offset: dosOffset - rng.int(7, 14), kind: 'preoperative visit' },
  };
  for (let k = 0; k < 6; k++) phases[`program${k + 1}`] = { offset: -170 + k * 30, kind: 'office visit' };

  return {
    code: '43775', codeSystem: 'CPT', description: 'laparoscopic sleeve gastrectomy', category: 'bariatric surgery', setting: 'outpatient', stakesUsd: 18000,
    patient: { age, sex },
    dosOffset,
    phases,
    baseline: [
      f('consult', `${age} year old ${p.woman} in bariatric surgery clinic after finishing the supervised program with ${p.her} primary. Discussed sleeve versus bypass; sleeve preferred given reflux is mild and ${p.she} wants the simpler operation.`),
      f('followup1', `Back with the psychology and nutrition evaluations done. Reviewed the operation, the leak risk, and the postoperative diet again. Ready to schedule.`),
      f('preop', `Pre-op. Clear liquids for 2 days before, hold the metformin the morning of, CPAP to come with ${p.hers}. Consent signed for laparoscopic sleeve gastrectomy.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};
