import { f, pronouns, type Template, type CriterionDef, type DenialDef } from '../template.js';

export const femoropoplitealRevascularization: Template = (rng, spec) => {
  const sex = rng.chance(0.6) ? 'male' : 'female';
  const p = pronouns(sex);
  const age = rng.int(58, 84);
  const side = rng.pick(['right', 'left']);
  const claudication = spec.subtype === 'near-miss' && spec.failKey === 'indication';
  const abi = claudication ? (rng.int(66, 78) / 100).toFixed(2) : (rng.int(28, 40) / 100).toFixed(2);
  const toe = claudication ? rng.int(52, 66) : rng.int(18, 28);
  const ulcerW = (rng.int(16, 26) / 10).toFixed(1);
  const ulcerL = (rng.int(12, 20) / 10).toFixed(1);
  const occlusion = rng.int(9, 16);
  const dosOffset = rng.int(28, 60);

  const criteria: CriterionDef[] = [
    {
      key: 'indication',
      text: 'Chronic limb-threatening ischemia (ischemic rest pain, non-healing ulcer, or gangrene, Rutherford 4 to 6); or lifestyle-limiting claudication (Rutherford 3) that has failed at least 12 weeks of supervised exercise therapy and optimal medical therapy.',
      support: [
        f('consult', `${side === 'right' ? 'Right' : 'Left'} heel ulcer for 3 months that will not heal despite offloading and weekly wound care, and rest pain in the ${side} foot at night relieved by hanging it off the bed. Rutherford 5.`),
        f('wound', `${side === 'right' ? 'Right' : 'Left'} heel ulcer ${ulcerW} by ${ulcerL} centimeters, pale base, no granulation tissue after 10 weeks of weekly debridement and offloading. Pedal pulses not palpable.`),
      ],
      nearMiss: [f('consult', `${side === 'right' ? 'Right' : 'Left'} calf cramping at about two blocks that goes away when ${p.she} stops, no rest pain, no wounds, Rutherford 3. Told ${p.hers} to walk more and gave ${p.hers} the handout; ${p.she} has not done a supervised exercise program.`)],
    },
    {
      key: 'hemodynamic',
      text: 'Hemodynamic confirmation: ankle-brachial index 0.4 or less, toe pressure below 30 mmHg, or TcPO2 below 30 mmHg for limb-threatening ischemia (ankle-brachial index below 0.9 for claudication).',
      support: [f('vascLab', `Arterial studies. Ankle-brachial index ${side} ${abi}, ${side === 'right' ? 'left' : 'right'} ${(rng.int(84, 96) / 100).toFixed(2)}. ${side === 'right' ? 'Right' : 'Left'} toe pressure ${toe} mmHg. ${claudication ? 'Biphasic' : 'Monophasic'} waveforms at the ${side} popliteal and tibial levels.`)],
      nearMiss: [],
    },
    {
      key: 'imaging',
      text: 'Imaging (duplex, CT angiography, or angiography) demonstrating a femoropopliteal stenosis of 50 percent or more, or an occlusion, amenable to endovascular treatment.',
      support: [f('cta', `CT angiography with runoff: ${side} superficial femoral artery occluded over ${occlusion} centimeters from the mid thigh to the adductor canal, reconstitution of the above-knee popliteal artery, two-vessel runoff via the anterior tibial and peroneal. Contralateral mild disease. Aortoiliac segments patent.`)],
      nearMiss: [],
    },
    {
      key: 'medical',
      text: 'Optimal medical therapy documented: an antiplatelet agent, a statin, and smoking cessation or cessation counseling.',
      support: [f('consult', `On aspirin 81 and atorvastatin 80. Quit smoking ${rng.int(4, 10)} weeks ago after ${rng.int(30, 45)} years; counseled again today and offered nicotine replacement.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish limb-threatening ischemia or failure of supervised exercise therapy.' },
    { carc: '56', remedy: 'fixable', explanation: 'Atherectomy is considered investigational for femoropopliteal disease.' },
    { carc: '11', remedy: 'fixable', explanation: 'The diagnosis reported does not support the procedure billed.' },
  ];

  const phases: Record<string, { offset: number; kind: 'office visit' | 'wound care visit' | 'vascular laboratory' | 'imaging' | 'preoperative visit' }> = {
    consult: { offset: 0, kind: 'office visit' },
    vascLab: { offset: 3, kind: 'vascular laboratory' },
    cta: { offset: 8, kind: 'imaging' },
    followup1: { offset: 14, kind: 'office visit' },
    preop: { offset: dosOffset - rng.int(5, 12), kind: 'preoperative visit' },
  };
  if (!claudication) phases['wound'] = { offset: -7, kind: 'wound care visit' };

  return {
    code: '37227', codeSystem: 'CPT', description: 'revascularization of the femoral-popliteal artery with atherectomy and stent placement', category: 'vascular surgery', setting: 'outpatient', stakesUsd: 15000,
    patient: { age, sex },
    dosOffset,
    phases,
    baseline: [
      f('consult', `${age} year old ${p.woman} referred by ${rng.pick(['podiatry', 'the wound center', 'the PCP'])} for the ${side} leg. Diabetic ${rng.int(10, 25)} years, hypertension, prior ${rng.pick(['coronary stent', 'carotid endarterectomy', 'cataract surgery'])}. Discussed endovascular versus bypass; endovascular first given the anatomy.`),
      f('followup1', `Back to review the imaging. Plan ${side} superficial femoral artery recanalization with atherectomy and stent, outpatient. Risks reviewed including embolization and need for bypass.`),
      f('preop', `Pre-procedure visit. Creatinine ${(rng.int(9, 14) / 10).toFixed(1)}, hold metformin, hydration protocol. Consent signed.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const carotidEndarterectomy: Template = (rng, spec) => {
  const sex = rng.chance(0.55) ? 'male' : 'female';
  const p = pronouns(sex);
  const age = rng.int(62, 82);
  const side = rng.pick(['right', 'left']);
  const other = side === 'right' ? 'left' : 'right';
  const psv = rng.int(300, 380);
  const pct = rng.int(75, 88);
  const dosOffset = rng.int(7, 9); // surgery 11 to 14 days after the event

  const criteria: CriterionDef[] = [
    {
      key: 'symptomatic',
      text: 'Symptomatic carotid stenosis: transient ischemic attack, amaurosis fugax, or non-disabling stroke in the ipsilateral territory within the past 6 months with 50 to 99 percent stenosis; or asymptomatic 70 to 99 percent stenosis with a life expectancy over 5 years and a perioperative stroke and death risk under 3 percent.',
      support: [
        f('ed', `Twenty minutes of ${other} arm weakness and slurred speech that resolved before arrival. CT head without hemorrhage or infarct. ABCD2 score 5. Aspirin given, carotid imaging ordered, neurology consulted.`),
        f('consult', `Transient ischemic attack ${rng.int(3, 5)} days ago, ${other} arm and face, now back to baseline. Symptomatic ${side} carotid disease.`),
      ],
      nearMiss: [],
    },
    {
      key: 'imaging',
      text: 'Degree of stenosis documented by duplex ultrasound using velocity criteria, confirmed by CT or MR angiography when indicated, reported by the NASCET method.',
      support: [
        f('duplex', `Carotid duplex. ${side === 'right' ? 'Right' : 'Left'} internal carotid peak systolic velocity ${psv} centimeters per second, end diastolic velocity ${rng.int(120, 140)}, ICA to CCA ratio ${(rng.int(42, 52) / 10).toFixed(1)}, consistent with 70 to 99 percent stenosis. ${other === 'right' ? 'Right' : 'Left'} 1 to 39 percent.`),
        f('cta', `CT angiography of the neck: ${side} internal carotid artery ${pct} percent stenosis by NASCET criteria with an ulcerated, partly calcified plaque at the bulb. ${other === 'right' ? 'Right' : 'Left'} 30 percent. Intracranial vessels patent.`),
      ],
      nearMiss: [],
    },
    {
      key: 'medical',
      text: 'Best medical therapy in place: antiplatelet therapy and a high-intensity statin.',
      support: [f('consult', `Aspirin 81 and clopidogrel 75 started in the emergency department, atorvastatin 80 nightly, blood pressure 138 over 82 today.`)],
      nearMiss: [],
    },
    {
      key: 'timing',
      text: 'Surgery planned within 14 days of the index event when feasible.',
      support: [f('consult', `Scheduling endarterectomy within 2 weeks of the event per guideline; the operating room is booked for ${dosOffset} days from today.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish the degree of stenosis or the symptomatic status required for coverage.' },
    { carc: '167', remedy: 'fixable', explanation: 'The diagnosis reported (cerebral atherosclerosis, unspecified) is not a covered indication for this procedure.' },
  ];

  return {
    code: '35301', codeSystem: 'CPT', description: 'carotid endarterectomy', category: 'vascular surgery', setting: 'outpatient', stakesUsd: 18000,
    patient: { age, sex },
    dosOffset,
    phases: {
      ed: { offset: -4, kind: 'emergency department note' },
      duplex: { offset: -3, kind: 'vascular laboratory' },
      cta: { offset: -2, kind: 'imaging' },
      consult: { offset: 0, kind: 'office visit' },
      followup1: { offset: 3, kind: 'office visit' },
      preop: { offset: dosOffset - 2, kind: 'preoperative visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in vascular surgery clinic after a recent neurologic event, sent by neurology. Significant plaque on the ${side}. Hypertension, hyperlipidemia, ${rng.pick(['type 2 diabetes', 'coronary disease with a remote stent', 'former smoker'])}. Discussed endarterectomy versus stenting; endarterectomy preferred for this anatomy and age.`),
      f('followup1', `Returned with ${p.her} ${rng.pick(['son', 'daughter', 'spouse'])} to go over the operation, the risk of stroke with and without surgery, cranial nerve injury, and the hospital stay of one night. Wants to proceed.`),
      f('preop', `Pre-op. Anesthesia evaluation done, EKG unchanged. Continue aspirin and clopidogrel through surgery. Consent signed.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const icdImplant: Template = (rng, spec) => {
  const sex = rng.chance(0.65) ? 'male' : 'female';
  const p = pronouns(sex);
  const age = rng.int(52, 78);
  const ef1 = rng.int(22, 30);
  const ef2 = spec.subtype === 'near-miss' && spec.failKey === 'ef' ? rng.int(37, 42) : ef1 + rng.int(0, 4);
  const miMonths = rng.int(6, 14);
  const dosOffset = rng.int(120, 150);

  const criteria: CriterionDef[] = [
    {
      key: 'ef',
      text: 'Left ventricular ejection fraction of 35 percent or less on echocardiography, nuclear study, or cardiac MRI, measured after at least 90 days of guideline-directed medical therapy.',
      support: [
        f('echo1', `Transthoracic echocardiogram. Left ventricular ejection fraction ${ef1} percent by biplane Simpson’s, anterior and apical akinesis, mild mitral regurgitation, no thrombus.`),
        f('echo2', `Repeat transthoracic echocardiogram after 3 months of optimized medical therapy. Left ventricular ejection fraction ${ef2} percent by biplane Simpson’s, unchanged. Persistent anterior and apical akinesis.`),
      ],
      nearMiss: [
        f('echo1', `Transthoracic echocardiogram. Left ventricular ejection fraction ${ef1} percent by biplane Simpson’s, anterior and apical akinesis, mild mitral regurgitation, no thrombus.`),
        f('echo2', `Repeat transthoracic echocardiogram after 3 months of optimized medical therapy. Left ventricular ejection fraction improved to ${ef2} percent by biplane Simpson’s. Anterior wall hypokinetic rather than akinetic.`),
      ],
    },
    {
      key: 'nyha',
      text: 'New York Heart Association class II or III heart failure symptoms.',
      support: [f('followup1', `Short of breath carrying groceries up one flight, fine on the flat, no orthopnea now. Class II to III.`)],
      nearMiss: [],
    },
    {
      key: 'gdmt',
      text: 'At least 90 days of guideline-directed medical therapy including a beta blocker and an ACE inhibitor, ARB, or ARNI, with a mineralocorticoid receptor antagonist and an SGLT2 inhibitor as tolerated, at maximally tolerated doses.',
      support: [
        f('medRecord', `Carvedilol 25 twice daily, sacubitril-valsartan 97/103 twice daily, spironolactone 25 daily, empagliflozin 10 daily. All four started after the infarction and titrated to these doses by the second cardiology visit; doses unchanged since.`),
        f('followup1', `${rng.int(92, 100)} days on full guideline-directed therapy at target doses, tolerating, potassium ${(rng.int(42, 48) / 10).toFixed(1)}, blood pressure ${rng.int(100, 112)} over ${rng.int(62, 72)}.`),
      ],
      nearMiss: [],
    },
    {
      key: 'timing',
      text: 'More than 40 days after any myocardial infarction and more than 90 days after any coronary revascularization.',
      support: [f('consult', `Anterior ST-elevation infarction ${miMonths} months ago, drug-eluting stent to the proximal left anterior descending at that time. No revascularization since; no residual ischemia on the follow-up stress study.`)],
      nearMiss: [],
    },
    {
      key: 'survival',
      text: 'Expected survival with good functional status of more than one year.',
      support: [f('consult', `No other life-limiting illness, independent, still working. Expected survival well over a year.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish an ejection fraction of 35 percent or less after an adequate trial of guideline-directed medical therapy.' },
  ];

  return {
    code: '33249', codeSystem: 'CPT', description: 'insertion of implantable cardioverter-defibrillator with transvenous lead', category: 'cardiology', setting: 'outpatient', stakesUsd: 35000,
    patient: { age, sex },
    dosOffset,
    phases: {
      consult: { offset: 0, kind: 'office visit' },
      echo1: { offset: 3, kind: 'echocardiogram' },
      medRecord: { offset: 5, kind: 'medication record' },
      followup1: { offset: 95, kind: 'office visit' },
      echo2: { offset: 100, kind: 'echocardiogram' },
      preop: { offset: dosOffset - 7, kind: 'preoperative visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in cardiology clinic for ischemic cardiomyopathy after ${p.her} infarction. Reviewed the plan: optimize medications, repeat the echo in 3 months, and decide on a defibrillator then. ${p.She} understands the device is for sudden death prevention, not symptoms.`),
      f('followup1', `Three-month visit. Reviewed the repeat echocardiogram with ${p.hers}. Discussed primary prevention defibrillator, risks of implant, what a shock feels like, driving rules. Decision made today.`),
      f('preop', `Pre-procedure visit for device implant. Hold the apixaban one dose, continue the rest. Chest X-ray and labs fine. Consent signed.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const pciStableAngina: Template = (rng, spec) => {
  const sex = rng.chance(0.6) ? 'male' : 'female';
  const p = pronouns(sex);
  const age = rng.int(55, 79);
  const defectPct = rng.int(11, 16);
  const stenosis = rng.int(80, 90);
  const ffr = (rng.int(68, 78) / 100).toFixed(2);
  const dosOffset = 45;

  const criteria: CriterionDef[] = [
    {
      key: 'angina',
      text: 'Angina of Canadian Cardiovascular Society class II to IV persisting despite at least two antianginal medications at optimal doses, or documented intolerance.',
      support: [
        f('medRecord', `Metoprolol succinate 100 daily, amlodipine 10 daily, isosorbide mononitrate 60 daily, all at these doses for the past ${rng.int(4, 7)} months. Aspirin 81, atorvastatin 80.`),
        f('followup1', `Still class III angina walking one block or climbing a flight despite three antianginal medications at target doses, using nitroglycerin ${rng.int(3, 6)} times a week.`),
      ],
      nearMiss: [],
    },
    {
      key: 'ischemia',
      text: 'Objective evidence of ischemia: stress imaging showing a moderate or large reversible defect (10 percent or more of the myocardium), or invasive physiology with fractional flow reserve of 0.80 or less or instantaneous wave-free ratio of 0.89 or less in the target vessel.',
      support: [
        f('stress', `Regadenoson SPECT myocardial perfusion imaging. Large reversible perfusion defect of the anterior wall and apex, ${defectPct} percent of the left ventricle, with transient ischemic dilation. Ejection fraction 54 percent post-stress.`),
        f('cath', `Coronary angiography. Proximal left anterior descending ${stenosis} percent stenosis. Fractional flow reserve across the lesion ${ffr}. Circumflex and right coronary without significant disease.`),
      ],
      nearMiss: [],
    },
    {
      key: 'anatomy',
      text: 'Angiographic stenosis of 70 percent or more in the target vessel (50 to 69 percent with abnormal invasive physiology).',
      support: [f('cath', `Proceeded to intervention of the proximal left anterior descending: predilation and a 3.5 by 18 millimeter drug-eluting stent, TIMI 3 flow, no residual stenosis.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish refractory angina on optimal medical therapy or objective ischemia in the target vessel.' },
    { carc: '4', remedy: 'wrong-remedy', explanation: 'Modifier 59 was billed on the stent line together with modifier LD; the combination is invalid for this code. Resubmit a corrected claim.' },
  ];

  return {
    code: '92928', codeSystem: 'CPT', description: 'percutaneous transcatheter placement of intracoronary stent, single major coronary artery', category: 'cardiology', setting: 'outpatient', stakesUsd: 20000,
    patient: { age, sex },
    dosOffset,
    phases: {
      consult: { offset: 0, kind: 'office visit' },
      stress: { offset: 8, kind: 'stress test' },
      medRecord: { offset: 10, kind: 'medication record' },
      followup1: { offset: 30, kind: 'office visit' },
      cath: { offset: 45, kind: 'cardiac catheterization' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in cardiology clinic with exertional chest pressure for ${rng.int(5, 9)} months, relieved by rest. Hypertension, hyperlipidemia, ${rng.pick(['type 2 diabetes', 'family history of early coronary disease', 'former smoker'])}. Stress imaging ordered, medications reviewed and continued.`),
      f('followup1', `Reviewed the stress test. Given the size of the defect and ongoing symptoms on maximal medical therapy, recommended coronary angiography with physiology and intervention if appropriate. Risks reviewed, ${p.she} agrees.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};
