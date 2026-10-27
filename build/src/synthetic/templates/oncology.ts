import { f, pronouns, type Template, type CriterionDef, type DenialDef } from '../template.js';

export const pembrolizumabNsclc: Template = (rng, spec) => {
  const sex = rng.chance(0.5) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(58, 79);
  const tps = rng.pick([55, 65, 70, 80, 90]);
  const cm = (rng.int(31, 58) / 10).toFixed(1);
  const exclusion = spec.subtype === 'exclusion';

  const criteria: CriterionDef[] = [
    {
      key: 'stage',
      text: 'Histologically confirmed non-small cell lung cancer that is metastatic (stage IV) or recurrent and not amenable to curative treatment.',
      support: [
        f('path', `Core needle biopsy, right upper lobe mass: adenocarcinoma, TTF-1 positive, napsin A positive, p40 negative. Consistent with primary lung adenocarcinoma.`),
        f('pet', `PET/CT: ${cm} centimeter hypermetabolic right upper lobe mass, hypermetabolic right hilar and subcarinal nodes, two hypermetabolic hepatic lesions in segments 6 and 7, and a lytic hypermetabolic lesion in the left iliac wing. Stage IV disease.`),
        f('consult', `Stage IV lung adenocarcinoma with liver and bone metastases. Not a surgical or curative radiation candidate.`),
      ],
      nearMiss: [],
    },
    {
      key: 'pdl1',
      text: 'PD-L1 tumor proportion score of 50 percent or greater for single-agent therapy (1 percent or greater when combined with platinum chemotherapy).',
      support: [f('molecular', `PD-L1 immunohistochemistry (22C3): tumor proportion score ${tps} percent.`)],
      nearMiss: [],
    },
    {
      key: 'biomarker',
      text: 'No EGFR sensitizing mutation and no ALK rearrangement, since targeted therapy is first-line for those tumors.',
      support: exclusion ? [] : [f('molecular', `Next-generation sequencing: EGFR, ALK, ROS1, BRAF V600E, KRAS G12C, MET exon 14, RET, and NTRK: no actionable alteration detected. Tumor mutational burden 9 per megabase.`)],
      nearMiss: [f('molecular', `Next-generation sequencing: EGFR exon 19 deletion detected. ALK, ROS1, BRAF, KRAS, MET, RET, NTRK negative.`)],
    },
    {
      key: 'performance',
      text: 'Eastern Cooperative Oncology Group performance status 0 to 2.',
      support: [f('consult', `ECOG 1. Still working part time, walks the dog every morning, some fatigue by evening and a cough.`)],
      nearMiss: [],
    },
    {
      key: 'firstLine',
      text: 'No prior systemic therapy for metastatic disease.',
      support: [f('consult', `No prior systemic therapy. This is first-line treatment for metastatic disease.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Documentation does not establish that the coverage criteria for pembrolizumab in this indication are met.' },
    { carc: '56', remedy: 'fixable', explanation: 'Use of this agent is considered investigational for the submitted diagnosis.' },
    { carc: '50', remedy: 'exclusion', explanation: 'Pembrolizumab monotherapy is not indicated in the presence of an EGFR sensitizing mutation; first-line therapy for this member is an EGFR tyrosine kinase inhibitor.' },
  ];

  return {
    code: 'J9271', codeSystem: 'HCPCS', description: 'pembrolizumab injection, 200 mg, first-line therapy for metastatic non-small cell lung cancer', category: 'oncology', setting: 'outpatient', stakesUsd: 11000,
    patient: { age, sex },
    dosOffset: 10,
    phases: {
      path: { offset: -14, kind: 'pathology report' },
      pet: { offset: -7, kind: 'imaging' },
      molecular: { offset: -3, kind: 'molecular pathology report' },
      consult: { offset: 0, kind: 'office visit' },
      tumorBoard: { offset: 2, kind: 'tumor board note' },
      followup1: { offset: 7, kind: 'office visit' },
      infusion: { offset: 10, kind: 'infusion note' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} seen in medical oncology with ${p.her} ${rng.pick(['daughter', 'wife', 'husband', 'son'])}. Presented with three months of cough and ${rng.int(8, 15)} pounds of weight loss. Long discussion of goals: ${p.she} wants treatment aimed at living longer and feeling well. Former smoker, ${rng.int(25, 50)} pack years, quit ${rng.int(5, 15)} years ago.`),
      f('tumorBoard', `Thoracic tumor board. Case presented. Consensus: single-agent immunotherapy first-line given the biomarker profile and performance status, palliative radiation to the iliac lesion if it becomes painful. Molecular results reviewed by the group.`),
      f('followup1', `Back to review the plan. Consented for pembrolizumab 200 milligrams every 3 weeks. Reviewed immune-related side effects, what to call about, and the port placement scheduled for later this week.`),
      f('infusion', `Infusion visit, cycle 1 day 1. Vitals stable, labs acceptable, pembrolizumab 200 milligrams intravenous over 30 minutes, tolerated without reaction. Return in 3 weeks.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const imrtBreast: Template = (rng, spec) => {
  const p = pronouns('female');
  const age = rng.int(42, 74);
  const cm = (rng.int(9, 24) / 10).toFixed(1);
  const heart3d = (rng.int(52, 74) / 10).toFixed(1);
  const heartImrt = (rng.int(18, 29) / 10).toFixed(1);
  const lung3d = rng.int(22, 27);
  const lungImrt = rng.int(12, 16);

  const criteria: CriterionDef[] = [
    {
      key: 'indication',
      text: 'Adjuvant radiation to the intact breast or chest wall after surgery for invasive breast carcinoma.',
      support: [
        f('path', `Left breast lumpectomy and sentinel node biopsy: ${cm} centimeter grade 2 invasive ductal carcinoma, margins negative, closest 3 millimeters, 0 of 2 sentinel nodes, estrogen receptor positive, HER2 negative.`),
        f('consult', `Status post left lumpectomy for a ${cm} centimeter invasive ductal carcinoma, node negative. Adjuvant whole-breast radiation recommended, then endocrine therapy.`),
      ],
      nearMiss: [],
    },
    {
      key: 'comparison',
      text: 'A three-dimensional conformal plan was generated and documented to exceed normal-tissue dose constraints (mean heart dose above 4 Gy, or ipsilateral lung V20 above 20 percent), such that intensity modulated planning is required to meet them.',
      support: [f('dosimetry', `Comparative plans, left breast, 42.56 Gy in 16 fractions. Three-dimensional conformal tangents with a heart block: mean heart dose ${heart3d} Gy, left anterior descending maximum ${rng.int(34, 41)} Gy, ipsilateral lung V20 ${lung3d} percent. The 3D plan fails the heart constraint. Intensity modulated plan: mean heart dose ${heartImrt} Gy, lung V20 ${lungImrt} percent, target coverage 95 percent of the volume at 95 percent of the dose. IMRT required to meet constraints.`)],
      nearMiss: [],
    },
    {
      key: 'prescription',
      text: 'Target volume, dose, and fractionation documented by the treating radiation oncologist.',
      support: [f('planning', `Treatment planning note. Prescription: whole left breast 42.56 Gy in 16 fractions of 2.66 Gy, lumpectomy cavity boost 10 Gy in 4 fractions. Target volumes contoured on the simulation scan, plan reviewed and approved today.`)],
      nearMiss: [],
    },
  ];

  const denials: DenialDef[] = [
    { carc: '50', remedy: 'fixable', explanation: 'Intensity modulated radiation therapy is not medically necessary for breast cancer; three-dimensional conformal radiation therapy is the covered standard.' },
  ];

  return {
    code: '77301', codeSystem: 'CPT', description: 'intensity modulated radiation therapy planning, left breast after lumpectomy', category: 'oncology', setting: 'outpatient', stakesUsd: 25000,
    patient: { age, sex: 'female' },
    dosOffset: 15,
    phases: {
      path: { offset: -20, kind: 'pathology report' },
      consult: { offset: 0, kind: 'radiation oncology note' },
      followup1: { offset: 7, kind: 'office visit' },
      sim: { offset: 9, kind: 'radiation oncology note' },
      dosimetry: { offset: 13, kind: 'dosimetry note' },
      planning: { offset: 15, kind: 'radiation oncology note' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in radiation oncology consultation. Reviewed the role of whole-breast radiation after lumpectomy, hypofractionation, and the left-sided heart question. ${p.She} is anxious about the heart and asked good questions.`),
      f('followup1', `Follow-up to answer questions with ${p.her} ${rng.pick(['husband', 'sister', 'daughter'])}. Reviewed the breath-hold technique we will try at simulation. Consent signed.`),
      f('sim', `Simulation. Supine on the breast board, left arm up, deep inspiration breath hold attempted and reproducible to 3 millimeters. CT acquired, isocenter set, skin marks placed. Heart sits close to the chest wall even in breath hold.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};

export const ngsPanelColorectal: Template = (rng, spec) => {
  const sex = rng.chance(0.5) ? 'female' : 'male';
  const p = pronouns(sex);
  const age = rng.int(48, 76);
  const lesions = rng.int(2, 4);
  const exclusion = spec.subtype === 'exclusion';

  const criteria: CriterionDef[] = [
    {
      key: 'advanced',
      text: 'Recurrent, relapsed, refractory, metastatic, or advanced stage III or IV cancer.',
      support: [
        f('path', `Sigmoid colon biopsy: invasive adenocarcinoma, moderately differentiated. Mismatch repair proteins intact by immunohistochemistry.`),
        f('imaging', `CT chest, abdomen, pelvis with contrast: circumferential sigmoid mass with regional nodes, ${lesions} hepatic lesions in the right lobe, largest ${(rng.int(21, 44) / 10).toFixed(1)} centimeters, consistent with metastases. No lung lesions.`),
        f('consult', `Stage IV sigmoid adenocarcinoma with synchronous liver metastases.`),
      ],
      nearMiss: [],
    },
    {
      key: 'intent',
      text: 'The patient is seeking further cancer treatment and the result will inform the selection of therapy.',
      support: [f('consult', `${p.She} wants treatment. Results will determine whether ${p.she} is a candidate for anti-EGFR antibody therapy, BRAF-directed therapy, HER2-directed therapy, or immunotherapy, and the chemotherapy backbone will start while we wait.`)],
      nearMiss: [],
    },
    {
      key: 'notRepeated',
      text: 'The same tumor panel has not previously been performed for this primary cancer.',
      support: [f('consult', `No prior molecular testing on this tumor; the biopsy block is available at pathology.`)],
      nearMiss: [],
    },
    {
      key: 'recognized',
      text: 'The panel is an FDA-approved or cleared companion diagnostic, or its use is recommended by National Comprehensive Cancer Network guidelines for the tumor type (RAS, BRAF, HER2, microsatellite instability, and NTRK status for metastatic colorectal cancer).',
      support: [f('consult', `Ordering the solid tumor next-generation sequencing panel to cover KRAS, NRAS, BRAF, HER2 amplification, microsatellite status, and NTRK fusions in one assay, per NCCN for metastatic colorectal cancer.`)],
      nearMiss: [],
    },
  ];
  if (exclusion) {
    criteria.unshift({
      key: 'coverage',
      text: 'Multi-gene next-generation sequencing panels of more than 50 genes are considered investigational for solid tumors under this plan and are not covered; single-gene or small-panel testing is the covered alternative.',
      support: [],
      nearMiss: [],
    });
  }

  const denials: DenialDef[] = [
    { carc: '56', remedy: 'fixable', explanation: 'Multi-gene panel testing is considered investigational for this diagnosis based on the documentation submitted.' },
    { carc: '56', rarc: 'N130', remedy: 'exclusion', explanation: 'Panels of more than 50 genes are investigational under the plan’s genetic testing policy and are not covered.' },
  ];

  return {
    code: '81455', codeSystem: 'CPT', description: 'targeted genomic sequence analysis panel, solid organ neoplasm, 51 or more genes', category: 'oncology', setting: 'outpatient', stakesUsd: 3500,
    patient: { age, sex },
    dosOffset: 14,
    phases: {
      path: { offset: -10, kind: 'pathology report' },
      imaging: { offset: -5, kind: 'imaging' },
      consult: { offset: 0, kind: 'office visit' },
      followup1: { offset: 13, kind: 'office visit' },
    },
    baseline: [
      f('consult', `${age} year old ${p.woman} in medical oncology after colonoscopy for ${rng.pick(['iron deficiency anemia', 'a change in bowel habits', 'rectal bleeding'])} found a sigmoid mass. Long conversation about what stage IV means and what treatment looks like. ${p.She} is realistic and motivated. ECOG 1. Port referral placed.`),
      f('followup1', `Back to start treatment. Panel sent to the reference laboratory today from the biopsy block. FOLFOX cycle 1 scheduled for next week; we will adjust the biologic once the molecular results are back.`),
    ],
    criteria,
    denial: denials[spec.denialIndex]!,
  };
};
