// Post-acute and inpatient level-of-care cases: the categories the documented
// denial algorithms target (post-acute review in Medicare Advantage, inpatient
// to observation downgrades). The chart is the facility record.
import { f, pronouns, retroReview, type Template, type CriterionDef, type DenialDef } from '../template.js';

export const irfStroke: Template = (rng, spec) => {
  const sex = rng.chance(0.5) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(66, 84);
  const side = rng.pick(['left', 'right']);
  const nihss = rng.int(7, 12);
  const acuteDays = rng.int(4, 7);
  const minutes = { pt: rng.pick([75, 90]), ot: rng.pick([60, 75]), slp: rng.pick([30, 45]) };
  const total = minutes.pt + minutes.ot + minutes.slp;

  const criteria: CriterionDef[] = [
    {
      key: 'disciplines',
      text: 'Requires active and ongoing intervention of at least two therapy disciplines, one of which is physical or occupational therapy.',
      support: [
        f('preadmit', `Preadmission screening. ${age} year old ${p.woman} with an acute ${side === 'left' ? 'right' : 'left'} middle cerebral artery ischemic stroke ${acuteDays} days ago, NIHSS ${nihss}, dense ${side} hemiparesis, ${side} neglect, and oropharyngeal dysphagia on a modified diet. Needs PT for transfers and gait, OT for ${side} upper extremity and self-care, and SLP for swallowing and cognition. Premorbidly independent, lives with ${p.her} spouse in a single-level home.`),
        f('physEval', `Post-admission physician evaluation. Confirms the preadmission findings. Three disciplines ordered: PT, OT, and SLP, each to evaluate within 24 hours.`),
      ],
      nearMiss: [],
    },
    {
      key: 'intensity',
      text: 'Requires, and can reasonably be expected to actively participate in, an intensive rehabilitation program: generally at least 3 hours of therapy per day at least 5 days per week.',
      support: [
        f('physEval', `${p.She} was sitting up at the edge of the bed with the acute PT and tolerated 45 minute sessions there without fatigue. I expect ${p.hers} to tolerate three hours a day.`),
        f('therapyWeek', `Week one therapy minutes: PT ${minutes.pt}, OT ${minutes.ot}, SLP ${minutes.slp} daily, ${total} minutes a day on 6 of 7 days. Tolerating sessions, asking for more, no sessions refused or cut short for fatigue.`),
      ],
      nearMiss: [
        f('physEval', `Lethargic in the afternoons on the acute floor and refused two of four PT sessions there. Unclear whether ${p.she} can tolerate three hours a day; we will trial it.`),
        f('therapyWeek', `Week one therapy minutes: tolerating about 90 minutes a day total before fatigue stops the session. Refused afternoon therapy on 4 of 7 days. Total PT ${Math.round(minutes.pt / 2)}, OT ${Math.round(minutes.ot / 2)}, SLP ${Math.round(minutes.slp / 2)} on the days ${p.she} participated.`),
      ],
    },
    {
      key: 'improvement',
      text: 'Reasonably expected to make measurable functional improvement of practical value within a prescribed period, documented against goals in an individualized plan of care.',
      support: [
        f('physEval', `Prognosis for functional gains is good given premorbid independence and intact comprehension. Goals in 14 days: supervision level transfers, 150 feet with a hemi-walker, modified independent feeding, regular diet with thin liquids.`),
        f('teamConf', `Team conference, day 7. Transfers improved from maximal assist of two to minimal assist of one. Gait 25 feet to 80 feet with a hemi-walker and contact guard. Swallow advanced to mechanical soft with nectar liquids. On track for the 14 day goals, continue.`),
      ],
      nearMiss: [],
    },
    {
      key: 'physician',
      text: 'Requires supervision by a rehabilitation physician with face-to-face visits at least 3 days per week to manage medical and rehabilitation needs.',
      support: [
        f('progress3', `Rehab physician progress note, day 3, seen face to face. Blood pressure labile, 168 over 94 this morning, 112 over 70 last night with lightheadedness in therapy; adjusted the amlodipine timing. Dysphagia diet reviewed with SLP. ${side} shoulder pain with range of motion, added a sling for transfers.`),
        f('progress10', `Rehab physician progress note, day 10, seen face to face. Blood pressure steadier on the new schedule. Bladder scan residuals under 100, catheter out. Spasticity in the ${side} hand, started a night splint. Reviewed therapy progress with the team.`),
      ],
      nearMiss: [],
    },
    {
      key: 'lowerLevel',
      text: 'The patient’s needs cannot be met at a less intensive level of care, such as a skilled nursing facility.',
      support: [f('preadmit', `A skilled nursing facility would not provide the daily physician oversight ${p.she} needs for the blood pressure lability and the dysphagia, nor three disciplines at this intensity. Recommend inpatient rehabilitation.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', rarc: 'N10', remedy: 'fixable', explanation: 'Documentation does not demonstrate that the member required the intensity of services provided in an inpatient rehabilitation facility; the member’s needs could have been met at a skilled nursing facility level of care.' },
    { carc: '197', remedy: 'fixable', explanation: retroReview(spec.payer) },
  ];

  return {
    code: '0104', codeSystem: 'CMG', description: 'inpatient rehabilitation facility admission, stroke', category: 'post-acute care', setting: 'post-acute', stakesUsd: 25000,
    patient: { age, sex },
    dosOffset: 0,
    endOffset: 14,
    phases: {
      preadmit: { offset: -1, kind: 'preadmission screening' },
      physEval: { offset: 0, kind: 'history and physical' },
      ptEval: { offset: 1, kind: 'therapy note' },
      otEval: { offset: 1, kind: 'therapy note' },
      slpEval: { offset: 1, kind: 'therapy note' },
      progress3: { offset: 3, kind: 'hospital progress note' },
      therapyWeek: { offset: 6, kind: 'therapy note' },
      teamConf: { offset: 7, kind: 'team conference' },
      progress10: { offset: 10, kind: 'hospital progress note' },
      discharge: { offset: 14, kind: 'discharge summary' },
    },
    baseline: [
      f('physEval', `Admitted to inpatient rehabilitation from the acute hospital. History otherwise hypertension, hyperlipidemia, ${rng.pick(['type 2 diabetes', 'atrial fibrillation on apixaban', 'remote smoking history'])}. Medications reconciled. Code status full.`),
      f('ptEval', `PT evaluation. Transfers maximal assist of two, sit to stand with ${side} knee buckling, unable to ambulate. Sitting balance fair, standing balance poor. Goals set, plan 5 to 6 days a week.`),
      f('otEval', `OT evaluation. ${side} upper extremity flaccid with trace shoulder shrug, dependent for dressing and bathing, maximal assist for grooming, ${side} neglect on cancellation testing. Goals set.`),
      f('slpEval', `SLP evaluation. Oropharyngeal dysphagia with delayed swallow and throat clearing on thin liquids, mechanical soft and nectar thick recommended. Mild word-finding difficulty, follows two-step commands. Goals set.`),
      f('discharge', `Discharge summary, day 14. Transfers supervision, ambulating 160 feet with a hemi-walker and supervision, regular diet with thin liquids, feeding modified independent. Home with spouse, home health PT and OT arranged.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const snfHipFracture: Template = (rng, spec) => {
  const sex = rng.chance(0.7) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(74, 90);
  const side = rng.pick(['left', 'right']);
  const op = rng.pick(['hemiarthroplasty', 'cephalomedullary nail fixation']);
  const stairs = rng.int(12, 16);
  const plateau = spec.subtype === 'near-miss' && spec.failKey === 'progress';

  const criteria: CriterionDef[] = [
    {
      key: 'dailySkilled',
      text: 'Requires skilled nursing or skilled rehabilitation services on a daily basis (skilled therapy at least 5 days per week).',
      support: [
        f('ptWeek2', `PT 5 days this week, 45 to 60 minutes per session, plus OT 5 days. Skilled gait training with the rolling walker, transfer training, and stair training started.`),
        f('nursing2', `Daily skilled nursing: enoxaparin 40 subcutaneous daily through day 28, incision assessment with a 2 centimeter area of serous drainage at the distal end being monitored, pain regimen titrated, oxycodone cut to 2.5 at night only.`),
      ],
      nearMiss: [],
    },
    {
      key: 'progress',
      text: 'Documented, measurable functional progress toward the goals in the plan of care during the preceding 7 days, or a documented skilled need to maintain function or prevent deterioration.',
      support: [
        f('ptWeek2', `Progress this week: transfers improved from moderate assist of two to minimal assist of one. Ambulation 40 feet to 110 feet with the rolling walker and contact guard. Able to stand at the sink for 3 minutes for grooming.`),
        f('ptWeek3', `Progress this week: ambulation 110 to 200 feet with the rolling walker and supervision. Stairs: 4 steps with one rail and minimal assist, first attempt. Transfers supervision. Goal remains ${stairs} steps to reach the apartment.`),
      ],
      nearMiss: [
        f('ptWeek2', `Ambulation 40 feet with the rolling walker, the same as last week. Transfers minimal assist of one, unchanged. No measurable gain this week; ${p.she} reports fatigue and declined the second session on two days.`),
        f('ptWeek3', `Plateau. Ambulation 40 to 50 feet, unchanged over the past 7 days, transfers unchanged. Recommend transition to a maintenance program with home health and family training.`),
      ],
    },
    {
      key: 'onlyInpatient',
      text: 'The skilled services can, as a practical matter, only be provided on an inpatient basis in a skilled nursing facility.',
      support: [
        f('admit', `Lives alone in a second-floor walk-up, ${stairs} steps, no elevator, no caregiver available during the day. Weight bearing as tolerated on the ${side} but cannot yet transfer without two people.`),
        f('progress', `Physician visit. Cannot yet manage the ${stairs} stairs to the apartment and needs assistance of one for every transfer. Home health could not provide twice daily transfer assistance and daily injections for someone living alone. Continue skilled stay.`),
      ],
      nearMiss: [],
    },
    {
      key: 'qualifyingStay',
      text: 'A qualifying inpatient hospital stay of at least 3 consecutive days preceded the admission, or the plan has waived the requirement.',
      support: [f('admit', `Admitted to the skilled unit from the hospital after a 4 day inpatient stay for a ${side} femoral neck fracture treated with ${op} on hospital day 1.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', rarc: 'N10', remedy: 'fixable', explanation: 'Based on review of the clinical record, the member no longer required daily skilled services as of day 15 and could have been safely managed at home with home health services.' },
    { carc: '119', remedy: 'wrong-remedy', explanation: 'The member\u2019s skilled nursing facility benefit of 100 days per benefit period was exhausted before day 15 of this stay. Days 15 through 28 are not a covered benefit.' },
  ];

  return {
    code: 'KDOB1', codeSystem: 'HIPPS', description: 'skilled nursing facility continued stay, days 15 through 28, after hip fracture repair', category: 'post-acute care', setting: 'post-acute', stakesUsd: 8000,
    patient: { age, sex },
    dosOffset: 14,
    endOffset: 27,
    phases: {
      admit: { offset: 0, kind: 'history and physical' },
      ptEval: { offset: 1, kind: 'therapy note' },
      nursing1: { offset: 3, kind: 'nursing note' },
      ptWeek1: { offset: 7, kind: 'therapy note' },
      progress: { offset: 8, kind: 'hospital progress note' },
      ptWeek2: { offset: 14, kind: 'therapy note' },
      nursing2: { offset: 16, kind: 'nursing note' },
      ptWeek3: { offset: 21, kind: 'therapy note' },
      ptWeek4: { offset: 27, kind: 'therapy note' },
      discharge: { offset: 27, kind: 'discharge summary' },
    },
    baseline: [
      f('admit', `${age} year old ${p.woman} admitted for skilled rehabilitation. History of osteoporosis, hypertension, ${rng.pick(['mild cognitive impairment', 'chronic kidney disease stage 3', 'macular degeneration'])}. Fell at home reaching for a cabinet.`),
      f('ptEval', `PT evaluation on admission. Transfers moderate assist of two, stood at the parallel bars for 30 seconds, ambulation not attempted. Pain 6 out of 10 with movement.`),
      f('nursing1', `Incision clean, dry, staples intact. Pain controlled on scheduled acetaminophen and oxycodone 5 as needed. Bowels moving. Appetite fair.`),
      f('ptWeek1', `Week one summary. Transfers moderate assist of two to moderate assist of one. Ambulation 15 to 40 feet with the rolling walker. Working on weight shifting and step length on the ${side}.`),
      f('ptWeek4', plateau
        ? `Week four summary. Ambulation 50 feet with the rolling walker and contact guard, unchanged for 2 weeks. Transfers minimal assist of one, unchanged. Family trained in transfers and the home program. Discharge to daughter\u2019s single-level home.`
        : `Week four summary. Ambulation 300 feet with the rolling walker, independent. Stairs ${stairs} steps with one rail and supervision. Ready for discharge home with home health.`),
      f('discharge', plateau
        ? `Discharged on day 28 to the daughter\u2019s home with home health nursing for the remaining enoxaparin doses and a maintenance exercise program. Functional status unchanged over the final 2 weeks.`
        : `Discharged home on day 28 with home health PT and nursing for the remaining enoxaparin doses. Daughter to stay for the first week.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const inpatientSepsis: Template = (rng, spec) => {
  const sex = rng.chance(0.55) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(58, 84);
  const shortStay = spec.subtype === 'near-miss' && spec.failKey === 'twoMidnights';
  const kg = rng.int(62, 94);
  const bolus = (Math.round((kg * 30) / 250) * 250) / 1000;
  const lactate = (rng.int(30, 44) / 10).toFixed(1);
  const wbc = (rng.int(150, 196) / 10).toFixed(1);

  const criteria: CriterionDef[] = [
    {
      key: 'sepsis',
      text: 'Sepsis documented by a suspected or confirmed infection with at least two systemic inflammatory response criteria or a qSOFA score of 2 or more, together with evidence of hypoperfusion or organ dysfunction such as a lactate of 2 or more or hypotension.',
      support: [
        f('ed', `On arrival temperature 39.2, heart rate 118, respiratory rate 24, blood pressure 86 over 50, oxygen saturation 94 percent on room air. Looks sick. Left flank tenderness, urine cloudy. Working diagnosis pyelonephritis with sepsis.`),
        f('labs', `Lactate ${lactate}. White count ${wbc} with 12 percent bands. Creatinine 1.8, baseline 1.0 from last year. Urinalysis: many white cells, nitrite positive. Blood and urine cultures sent.`),
      ],
      nearMiss: [],
    },
    {
      key: 'resources',
      text: 'Treatment required inpatient-level resources: intravenous fluid resuscitation of 30 mL/kg, broad-spectrum intravenous antibiotics, serial lactate measurement, and continuous hemodynamic monitoring.',
      support: [f('hp', `${bolus} liters of lactated Ringer’s given as a 30 per kilo bolus in the department, piperacillin-tazobactam started within the hour. Repeat lactate every 6 hours until cleared, telemetry, strict intake and output, hold the lisinopril.`)],
      nearMiss: [],
    },
    {
      key: 'twoMidnights',
      text: 'At the time of the admission order, the admitting physician documented a reasonable expectation that care would span at least two midnights, and the actual stay met that expectation or was shortened by an unforeseen event.',
      support: [
        f('hp', `Admit inpatient. I expect this admission to span at least two midnights: ${p.she} needs 48 hours of intravenous antibiotics pending cultures, lactate clearance, and recovery of renal function before any oral step-down is safe.`),
        f('discharge', `Hospital day 4. Afebrile 36 hours, lactate 1.1, creatinine back to 1.1, cultures grew E. coli sensitive to cefpodoxime. Discharged home on oral antibiotics.`),
      ],
      nearMiss: [
        f('hp', `Admit inpatient for now. ${p.She} will likely be able to go home tomorrow if ${p.she} responds to fluids and the repeat lactate is down.`),
        f('discharge', `Discharged the next morning, under 24 hours after arrival. Lactate normalized to 1.4 after the first liter, blood pressure 118 over 72 overnight without further fluid, afebrile. Home on oral antibiotics with a culture callback.`),
      ],
    },
    {
      key: 'notObservation',
      text: 'The condition could not be safely treated with outpatient or observation services.',
      support: shortStay ? [] : [f('progress1', `Hospital day 2. Not an observation candidate: blood pressure dipped to 84 over 48 overnight requiring a third liter, lactate 2.6 at 6 hours and 2.1 at 12 hours, creatinine 1.9 this morning. Continue intravenous antibiotics and fluids, nephrology aware.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', rarc: 'N10', remedy: 'fixable', explanation: 'Inpatient level of care is not supported by the clinical documentation. Observation services were appropriate for the services rendered; the claim is denied as billed.' },
  ];

  const baseline = [
    f('ed', `${age} year old ${p.woman} brought in by ${p.her} ${rng.pick(['daughter', 'son', 'spouse'])} with two days of fever, chills, and left-sided back pain, poor oral intake since yesterday. History of hypertension and ${rng.pick(['type 2 diabetes', 'recurrent urinary infections', 'chronic kidney disease'])}.`),
    f('hp', `Admission history and physical. Assessment: pyelonephritis. Plan as above. Family updated at the bedside.`),
    f('nursing1', `Overnight: vital signs every 2 hours, two episodes of rigors, warm blankets, acetaminophen given. Tolerating sips. Urine output recorded hourly.`),
  ];
  if (shortStay) {
    baseline.push(
      f('progress1', `Hospital day 2, morning. Responded to the first liter; blood pressure held overnight without more fluid, heart rate 88, afebrile since midnight. Repeat lactate 1.4. Creatinine 1.3. Switch to oral antibiotics and discharge today with a culture callback.`),
    );
  } else {
    baseline.push(
      f('labs2', `Hospital day 2 labs. Lactate 2.1 at 12 hours. White count 15.0. Creatinine 1.9. Blood cultures: gram-negative rods in 2 of 2 bottles, identification pending.`),
      f('progress2', `Hospital day 3. Improving. Temperature maximum 37.9, heart rate 92, blood pressure 108 over 66 without fluids since this morning. Lactate 1.6. Creatinine 1.5. Cultures pending speciation. Advance diet, continue intravenous antibiotics.`),
      f('nursing2', `Day 3 nursing. Ambulated in the hall with standby assistance twice, tolerating a regular diet, voiding without difficulty, pain 2 out of 10. Intravenous antibiotics infusing on schedule.`),
    );
  }

  return {
    code: '871', codeSystem: 'MS-DRG', description: 'inpatient admission, septicemia or severe sepsis without mechanical ventilation over 96 hours, with major complication or comorbidity', category: 'inpatient level of care', setting: 'inpatient', stakesUsd: 12000,
    patient: { age, sex },
    dosOffset: 0,
    endOffset: shortStay ? 1 : 4,
    phases: {
      ed: { offset: 0, kind: 'emergency department note' },
      labs: { offset: 0, kind: 'laboratory result' },
      hp: { offset: 0, kind: 'history and physical' },
      nursing1: { offset: 1, kind: 'nursing note' },
      progress1: { offset: 1, kind: 'hospital progress note' },
      labs2: { offset: 1, kind: 'laboratory result' },
      progress2: { offset: 2, kind: 'hospital progress note' },
      nursing2: { offset: 2, kind: 'nursing note' },
      discharge: { offset: shortStay ? 1 : 4, kind: 'discharge summary' },
    },
    baseline,
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};
