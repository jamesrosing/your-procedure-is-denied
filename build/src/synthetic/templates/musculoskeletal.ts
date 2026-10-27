import { f, pronouns, type Template, type CriterionDef, type DenialDef } from '../template.js';

export const lumbarFusion: Template = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.5) ? 'male' : 'female';
  const p = pronouns(sex);
  const age = rng.int(52, 76);
  const consReq = payer.strict ? 12 : 6;
  const months = consReq + rng.int(1, 8);
  const slip = rng.int(5, 9);
  const translation = rng.int(4, 6);
  const angle = rng.int(10, 14);
  const dosOffset = rng.int(200, 300);
  const side = rng.pick(['left', 'right']);

  const criteria: CriterionDef[] = [
    {
      key: 'conservative',
      text: `Failure of at least ${consReq} months of conservative treatment including physical therapy, anti-inflammatory or analgesic medication, activity modification, and at least one epidural steroid injection.`,
      support: [
        f('consult', `${p.She} has been on meloxicam 15 daily and gabapentin 600 three times daily, stopped lifting at work, and did a course of PT last year.`),
        f('pt', `Spine PT evaluation. Flexion-based program, core stabilization, nerve glides. Plan 12 weeks, twice a week.`),
        f('esi1', `Fluoroscopically guided transforaminal epidural steroid injection, L4-L5 ${side}. Tolerated well.`),
        f('esi2', `Second transforaminal epidural steroid injection, L4-L5 ${side}. The first gave about 2 weeks of relief.`),
        f('followup1', `Finished 12 weeks of PT, two epidurals with transient relief only, still on the meloxicam and gabapentin. That is ${months} months of conservative care without durable benefit.`),
      ],
      nearMiss: [],
    },
    {
      key: 'instability',
      text: 'Imaging documenting segmental instability or spondylolisthesis at the level to be fused: anterolisthesis of 3 millimeters or more, or translation of 4 millimeters or more or angulation of 10 degrees or more on flexion-extension radiographs, with stenosis or radiculopathy correlating with the symptoms.',
      support: [
        f('mri', `MRI lumbar spine without contrast. L4-L5: grade 1 degenerative anterolisthesis measuring ${slip} millimeters, facet effusions, severe central and bilateral lateral recess stenosis compressing the traversing L5 roots. L3-L4 and L5-S1 mild degenerative change without stenosis.`),
        f('flexExt', `Lumbar flexion-extension lateral radiographs. L4-L5: ${translation} millimeters of translation between flexion and extension, ${angle} degrees of angular motion. Other levels stable.`),
      ],
      nearMiss: [],
    },
    {
      key: 'correlation',
      text: 'Symptoms and examination findings correlate with the imaging level: radicular leg pain or neurogenic claudication with a corresponding dermatomal deficit.',
      support: [f('consult', `Bilateral leg pain into the lateral calves and the tops of the feet with standing and walking, walks about 200 feet before ${p.she} has to sit, better leaning on the cart. L5 distribution. Extensor hallucis longus 4 out of 5 on the ${side}, reflexes symmetric, straight leg raise negative.`)],
      nearMiss: [],
    },
    {
      key: 'psychosocial',
      text: 'Psychosocial screening completed with no untreated major depression or active substance use disorder, and nicotine-free or documented cessation of at least 6 weeks.',
      support: [f('followup1', `PHQ-9 score ${rng.int(3, 8)}, no substance use, never smoked. Realistic expectations about what fusion will and will not fix.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not demonstrate instability requiring fusion; decompression alone would be the covered procedure.' },
  ];

  return {
    code: '22630', codeSystem: 'CPT', description: 'posterior lumbar interbody fusion, L4-L5, with decompression', category: 'spine surgery', setting: 'outpatient', stakesUsd: 45000,
    patient: { age, sex },
    dosOffset,
    phases: {
      consult: { offset: 0, kind: 'office visit' },
      mri: { offset: 5, kind: 'imaging' },
      pt: { offset: 7, kind: 'physical therapy' },
      flexExt: { offset: 12, kind: 'imaging' },
      esi1: { offset: 40, kind: 'procedure note' },
      esi2: { offset: 75, kind: 'procedure note' },
      followup1: { offset: 100, kind: 'office visit' },
      preop: { offset: dosOffset - rng.int(7, 14), kind: 'preoperative visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in spine clinic with low back and leg pain going back about ${rng.int(2, 4)} years, much worse this past year. ${rng.pick(['Works in a warehouse', 'Retired teacher', 'Drives a delivery route', 'Works at a desk'])}. Reviewed the imaging with ${p.hers} and the options from more therapy to decompression to fusion.`),
      f('followup1', `Back to decide. Symptoms unchanged, walking distance down to about 150 feet. Recommended L4-L5 decompression and interbody fusion given the slip and the motion on the films. Risks reviewed at length.`),
      f('preop', `Pre-op. Medical clearance in the chart, A1c 6.1, stopped the meloxicam. Consent signed for L4-L5 posterior lumbar interbody fusion with instrumentation.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const spinalCordStimulator: Template = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.55) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(44, 70);
  const trialDays = payer.strict ? 7 : 5;
  const dosOffset = rng.int(70, 100);

  const criteria: CriterionDef[] = [
    {
      key: 'chronic',
      text: 'Chronic intractable neuropathic pain of the trunk or limbs (such as failed back surgery syndrome or complex regional pain syndrome) for at least 6 months despite conservative therapy including medications, physical therapy, and injections.',
      support: [f('consult', `Persistent bilateral leg and low back pain ${rng.int(14, 30)} months after an L4-S1 fusion, 8 out of 10 most days, burning quality down both legs. On gabapentin 1200 three times daily and duloxetine 60, ${rng.int(12, 20)} weeks of PT, two epidurals and a medial branch block without durable relief.`)],
      nearMiss: [],
    },
    {
      key: 'psych',
      text: 'Psychological evaluation documenting no untreated psychiatric condition or substance use disorder that would preclude benefit from neuromodulation.',
      support: [f('psych', `Psychological evaluation for neuromodulation candidacy. PHQ-9 score ${rng.int(6, 10)}, mild; no somatic symptom disorder; no substance use disorder, opioid use stable and monitored; realistic expectations about pain reduction rather than cure. Cleared for trial.`)],
      nearMiss: [],
    },
    {
      key: 'trial',
      text: `A successful trial of at least ${trialDays} days with at least 50 percent pain reduction and documented functional improvement.`,
      support: [
        f('trial', `Percutaneous trial leads placed at T8 and T9 under fluoroscopy, paresthesia coverage of both legs and the low back confirmed. Trial programmed, home with the diary.`),
        f('trialEnd', `Trial day ${trialDays}: pain down from 8 out of 10 to 3 out of 10, a 62 percent reduction. Walking 30 minutes a day, sleeping through the night, cut the oxycodone in half. Successful trial; proceed to permanent implant. Leads removed.`),
      ],
      nearMiss: [
        f('trial', `Percutaneous trial leads placed at T8 and T9 under fluoroscopy, paresthesia coverage of both legs confirmed. Trial programmed, home with the diary.`),
        f('trialEnd', `Trial day ${trialDays}: pain down from 8 out of 10 to about 5.5, roughly 30 percent, says it takes the edge off. Activity about the same, still not sleeping well, opioid use unchanged. ${p.She} wants the permanent implant anyway. Leads removed.`),
      ],
    },
    {
      key: 'noSurgical',
      text: 'No further surgically correctable lesion identified on imaging.',
      support: [f('consult', `Post-operative MRI and CT show a solid fusion, no recurrent stenosis, no hardware problem; the spine surgeon has nothing further to offer surgically.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish a successful trial meeting the plan’s definition of 50 percent pain reduction with functional improvement.' },
  ];

  return {
    code: '63685', codeSystem: 'CPT', description: 'insertion of spinal neurostimulator pulse generator with connection to leads', category: 'spine surgery', setting: 'outpatient', stakesUsd: 40000,
    patient: { age, sex },
    dosOffset,
    phases: {
      consult: { offset: 0, kind: 'office visit' },
      psych: { offset: 20, kind: 'psychological evaluation' },
      followup1: { offset: 30, kind: 'office visit' },
      trial: { offset: 45, kind: 'procedure note' },
      trialEnd: { offset: 45 + trialDays, kind: 'office visit' },
      preop: { offset: dosOffset - rng.int(5, 12), kind: 'preoperative visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in the pain clinic referred by ${p.her} spine surgeon. Discussed spinal cord stimulation, what a trial involves, and that it is for leg-predominant neuropathic pain. ${p.She} is interested.`),
      f('followup1', `Reviewed the psychological evaluation. Scheduling the trial. Anticoagulation and infection precautions reviewed.`),
      f('preop', `Pre-op for permanent implant. Labs fine, nicotine negative. Consent signed for percutaneous leads and a rechargeable generator in the ${rng.pick(['left', 'right'])} upper buttock.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const totalKneeArthroplasty: Template = (rng, spec) => {
  const { payer } = spec;
  const sex = rng.chance(0.6) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(58, 80);
  const side = rng.pick(['right', 'left']);
  const consReq = payer.strict ? 6 : 3;
  const months = consReq + rng.int(1, 6);
  const varus = rng.int(6, 11);
  const dosOffset = rng.int(120, 200);

  const criteria: CriterionDef[] = [
    {
      key: 'radiographic',
      text: 'Radiographic evidence of advanced osteoarthritis: Kellgren-Lawrence grade 3 or 4, joint space narrowing to bone-on-bone contact, or deformity.',
      support: [f('xray', `Standing AP, lateral, and sunrise views of the ${side} knee. Complete loss of the medial joint space with bone-on-bone contact, large marginal osteophytes, subchondral sclerosis and cysts, ${varus} degrees of varus. Kellgren-Lawrence grade 4.`)],
      nearMiss: [],
    },
    {
      key: 'conservative',
      text: `Failure of at least ${consReq} months of conservative treatment including anti-inflammatory or analgesic medication, physical therapy or a supervised home exercise program, activity modification, and at least one intra-articular corticosteroid injection.`,
      support: [
        f('consult', `Meloxicam 15 daily for the better part of a year, acetaminophen on top, gave up the ${rng.pick(['golf', 'walking group', 'yard work'])}, uses a cane outdoors. Sending ${p.hers} to PT.`),
        f('pt', `PT evaluation, ${side} knee osteoarthritis. Quad strengthening, range of motion, gait training with the cane. Plan 8 weeks.`),
        f('injection', `Intra-articular corticosteroid injection, ${side} knee, triamcinolone 40 with lidocaine, anterolateral approach. Tolerated well.`),
        f('followup1', `Finished 8 weeks of PT, the injection gave about 3 weeks of relief, still on the meloxicam, still using the cane. That is ${months} months of conservative care without durable benefit.`),
      ],
      nearMiss: [],
    },
    {
      key: 'function',
      text: 'Pain with weight-bearing that interferes with activities of daily living, with limited range of motion or instability on examination.',
      support: [f('consult', `Pain with every step, night pain that wakes ${p.hers}, cannot do stairs without the rail, cannot kneel or get out of a low chair without pushing up. Range of motion 5 to 105 degrees with crepitus, medial joint line tenderness, varus thrust with gait.`)],
      nearMiss: [],
    },
    {
      key: 'fitness',
      text: 'Body mass index under 40, nicotine-free, and medically optimized for surgery.',
      support: [f('followup1', `BMI ${rng.int(27, 36)}, never smoked, A1c ${(rng.int(55, 66) / 10).toFixed(1)}, dental clearance in the chart.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish failure of conservative treatment prior to arthroplasty.' },
    { carc: '11', remedy: 'fixable', explanation: 'The diagnosis reported does not support the procedure billed.' },
  ];

  return {
    code: '27447', codeSystem: 'CPT', description: 'total knee arthroplasty', category: 'orthopedic surgery', setting: 'outpatient', stakesUsd: 25000,
    patient: { age, sex },
    dosOffset,
    phases: {
      consult: { offset: 0, kind: 'office visit' },
      xray: { offset: 0, kind: 'imaging' },
      pt: { offset: 7, kind: 'physical therapy' },
      injection: { offset: 30, kind: 'procedure note' },
      followup1: { offset: 90, kind: 'office visit' },
      preop: { offset: dosOffset - rng.int(7, 14), kind: 'preoperative visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in orthopedic clinic for the ${side} knee, hurting for ${rng.int(2, 5)} years and much worse this year. Discussed the options from more conservative care to replacement.`),
      f('followup1', `Back to decide on the ${side} knee. Recommended total knee arthroplasty. Reviewed the operation, the hospital stay, the rehab, and the risks including infection and clot.`),
      f('preop', `Pre-op. Medical clearance in the chart. Hold the meloxicam a week out. Consent signed for ${side} total knee arthroplasty.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};
