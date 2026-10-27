import type { Template } from '../template.js';
import { reductionMammaplasty, breastReconstruction } from './plastics.js';
import { irfStroke, snfHipFracture, inpatientSepsis } from './facility.js';
import { pembrolizumabNsclc, imrtBreast, ngsPanelColorectal } from './oncology.js';
import { femoropoplitealRevascularization, carotidEndarterectomy, icdImplant, pciStableAngina } from './cardiovascular.js';
import { lumbarFusion, spinalCordStimulator, totalKneeArthroplasty } from './musculoskeletal.js';
import { skinSubstituteDfu, infliximabCrohns, sleeveGastrectomy } from './other.js';

export const TEMPLATES: Record<string, Template> = {
  irfStroke,
  snfHipFracture,
  inpatientSepsis,
  pembrolizumabNsclc,
  imrtBreast,
  ngsPanelColorectal,
  femoropoplitealRevascularization,
  carotidEndarterectomy,
  icdImplant,
  pciStableAngina,
  lumbarFusion,
  spinalCordStimulator,
  totalKneeArthroplasty,
  skinSubstituteDfu,
  infliximabCrohns,
  sleeveGastrectomy,
  reductionMammaplasty,
  breastReconstruction,
};
