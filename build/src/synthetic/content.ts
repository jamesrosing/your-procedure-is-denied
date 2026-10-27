// Fictional payers and the bank of unrelated chart entries. None of the payer
// names belongs to a real insurer; the criteria they carry are invented for
// the benchmark and are not any company's policy.
import type { Rng } from './rng.js';
import type { EntryKind } from './types.js';

export interface Payer {
  name: string;
  planType: string;
  strict: boolean; // strict payers use the longer durations and flat thresholds
  timelyFilingDays: number;
  appealDays: number;
}

export const PAYERS: readonly Payer[] = [
  { name: 'Northwind Mutual Health', planType: 'commercial PPO', strict: false, timelyFilingDays: 180, appealDays: 180 },
  { name: 'Lanternhill Health Plan', planType: 'commercial HMO', strict: true, timelyFilingDays: 90, appealDays: 60 },
  { name: 'Silverline Medicare Advantage', planType: 'Medicare Advantage', strict: false, timelyFilingDays: 365, appealDays: 60 },
  { name: 'Prairie Commons Medicaid Plan', planType: 'Medicaid managed care', strict: true, timelyFilingDays: 180, appealDays: 60 },
  { name: 'Saltmarsh Benefits Administrators', planType: 'self-funded employer plan', strict: true, timelyFilingDays: 90, appealDays: 180 },
  { name: 'Copperfield Health', planType: 'commercial EPO', strict: false, timelyFilingDays: 120, appealDays: 180 },
];

export const CARC_TEXT: Record<string, string> = {
  '4': 'The procedure code is inconsistent with the modifier used.',
  '11': 'The diagnosis is inconsistent with the procedure.',
  '29': 'The time limit for filing has expired.',
  '50': "These are non-covered services because this is not deemed a 'medical necessity' by the payer.",
  '56': 'Procedure/treatment is deemed experimental/investigational by the payer.',
  '96': 'Non-covered charge(s).',
  '119': 'Benefit maximum for this time period or occurrence has been reached.',
  '151': 'Payment adjusted because the payer deems the information submitted does not support this many/frequency of services.',
  '167': 'This (these) diagnosis(es) is (are) not covered.',
  '197': 'Precertification/authorization/notification/pre-treatment absent.',
};

export const RARC_TEXT: Record<string, string> = {
  N10: 'Adjustment based on the findings of a review organization.',
  N130: 'Consult plan benefit documents/guidelines for information about restrictions for this service.',
};

export interface Distractor {
  kind: EntryKind;
  text: string;
}

// Unrelated to every procedure in the set on purpose. Numbers are included so
// the gate's hard-token check has something to catch if a draft borrows them.
export function distractors(rng: Rng, sex: 'female' | 'male', n: number, opts: { breast: boolean }): Distractor[] {
  const she = sex === 'female' ? 'she' : 'he';
  const She = sex === 'female' ? 'She' : 'He';
  const her = sex === 'female' ? 'her' : 'his';
  const bank: (() => Distractor)[] = [
    () => ({ kind: 'office visit', text: `Blood pressure check. ${rng.int(118, 146)} over ${rng.int(72, 92)} today, ${rng.int(120, 150)} over ${rng.int(74, 94)} on repeat. ${She} has been taking the lisinopril ${rng.pick([10, 20, 40])} most days, admits to missing weekends. Low salt talk again. Keep the dose, recheck in ${rng.pick([6, 8, 12])} weeks.` }),
    () => ({ kind: 'office visit', text: `Here with a cough and congestion for ${rng.int(4, 9)} days, low grade temp at home, no shortness of breath. Lungs clear, throat a little red, ears fine. Looks viral. Fluids, rest, honey for the cough, come back if ${she} gets a fever over 101 or it goes past two weeks.` }),
    () => ({ kind: 'phone note', text: `Called ${her} with the cholesterol results. Total ${rng.int(182, 236)}, LDL ${rng.int(104, 158)}, HDL ${rng.int(38, 62)}, triglycerides ${rng.int(96, 210)}. Discussed diet and walking. ${She} wants to try lifestyle first for six months before we talk about a statin. Agreed.` }),
    () => ({ kind: 'office visit', text: `Annual physical. Feels well overall. Sleeping fine, appetite fine, no chest pain, no shortness of breath. Flu shot given in the left arm today. Due for a tetanus booster, ${she} will think about it. Labs ordered, fasting.` }),
    () => ({ kind: 'phone note', text: `Pharmacy called about the refill on the omeprazole ${rng.pick([20, 40])}. Approved 90 days. ${She} mentioned the heartburn is better since cutting back on coffee.` }),
    () => ({ kind: 'office visit', text: `Twisted the ${rng.pick(['left', 'right'])} ankle stepping off a curb ${rng.int(2, 6)} days ago. Swelling over the lateral malleolus, tender over the ATFL, can bear weight. Ottawa negative, no film. Brace, ice, ibuprofen, elevate. Should be fine in a couple weeks.` }),
    () => ({ kind: 'outside letter', text: `Letter from the dentist's office confirming routine cleaning and exam completed, no active infection, no dental work pending. Sent at our request for the surgical file.` }),
    () => ({ kind: 'office visit', text: `Mole on the ${rng.pick(['upper back', 'left forearm', 'right calf'])} that ${her} spouse noticed. About ${rng.int(4, 7)} millimeters, even color, regular border, no change ${she} is aware of. Looks benign. Photo in the chart for comparison, recheck in a year or sooner if it changes.` }),
    () => ({ kind: 'phone note', text: `Thyroid labs back. TSH ${(rng.int(12, 38) / 10).toFixed(1)}, free T4 normal. No change to the levothyroxine ${rng.pick([50, 75, 100])}. Repeat in a year.` }),
    () => ({ kind: 'office visit', text: `Trouble sleeping for a couple of months, falls asleep fine but wakes at three and lies there. No snoring per the spouse, no daytime naps, two cups of coffee before noon. Went over sleep hygiene, no screens in bed, cut the afternoon caffeine. Will hold off on medication for now.` }),
    () => ({ kind: 'outside letter', text: `Optometry report forwarded for the record. Routine refraction, mild astigmatism, new glasses prescribed, retinas healthy, pressures ${rng.int(13, 19)} and ${rng.int(13, 19)}. No ocular pathology noted.` }),
    () => ({ kind: 'office visit', text: `Burning with urination for two days, going frequently, no fever, no back pain. Urine dip positive for leukocytes and nitrites. Nitrofurantoin for five days, push fluids, call if fever or flank pain.` }),
    () => ({ kind: 'phone note', text: `${She} called asking about travel vaccines for a trip in ${rng.pick(['the spring', 'the fall', 'early summer'])}. Advised hepatitis A and a typhoid booster, referred to the travel clinic. Nothing else needed from us.` }),
    () => ({ kind: 'office visit', text: `Seasonal allergies acting up, itchy eyes, sneezing, clear drainage, worse outdoors. No wheeze. Cetirizine at night and the saline rinse. Fine with that.` }),
    () => ({ kind: 'office visit', text: `A1c came back ${(rng.int(57, 68) / 10).toFixed(1)}. Prediabetic range, same as last year. Walking program, cut the soda, recheck in six months. ${She} is motivated.` }),
    () => ({ kind: 'outside letter', text: `Gastroenterology note received. Screening colonoscopy completed, two small polyps removed, benign on pathology, repeat in ${rng.pick([5, 7, 10])} years.` }),
    () => ({ kind: 'office visit', text: `Low back strain after moving furniture over the weekend. No radiation down the legs, no numbness, no bowel or bladder trouble. Paraspinal tenderness, straight leg raise negative. Heat, keep moving, ibuprofen with food for a week. Should settle.` }),
    () => ({ kind: 'phone note', text: `Patient called about a tick bite on the ${rng.pick(['calf', 'shoulder', 'scalp'])} after a hike. Tick removed whole, no rash, no fever. Watch for a bull's-eye rash or flu symptoms over the next month and call if either shows up.` }),
    () => ({ kind: 'office visit', text: `Ear fullness and muffled hearing on the ${rng.pick(['left', 'right'])} for a week after a cold. Canal clear, drum dull with fluid behind it, no infection. Serous otitis. Decongestant, swallow and yawn, recheck in three weeks if not better.` }),
    () => ({ kind: 'outside letter', text: `Dermatology consult note received. Two actinic keratoses on the forehead treated with cryotherapy. Annual skin check recommended, sunscreen counseling done.` }),
    () => ({ kind: 'office visit', text: `Vitamin D came back ${rng.int(14, 24)}. Started ${rng.pick([1000, 2000])} units daily, recheck in three months. Also talked about calcium from food rather than pills.` }),
    () => ({ kind: 'phone note', text: `Work note requested for a sick day last ${rng.pick(['Monday', 'Tuesday', 'Thursday'])}. Faxed to the employer.` }),
    () => ({ kind: 'office visit', text: `Knee pain going down stairs, ${rng.pick(['left', 'right'])} side, no injury, no locking or giving way. Patellar grind positive, no effusion, ligaments stable. Patellofemoral pain. Quad strengthening sheet, ice after activity, cushioned shoes.` }),
  ];
  // A normal screening mammogram makes no sense in a breast case or for a male patient.
  if (sex === 'female' && !opts.breast) {
    bank.push(() => ({ kind: 'outside letter', text: `Mammogram report forwarded for the record. Bilateral screening, BI-RADS 1, negative, routine screening in one year.` }));
  }
  const picks = rng.shuffle(bank).slice(0, Math.min(n, bank.length));
  return picks.map(make => make());
}

// Routine inpatient and facility traffic unrelated to the level-of-care
// question: the notes that fill a hospital or nursing-facility chart.
export function facilityDistractors(rng: Rng, sex: 'female' | 'male', n: number): Distractor[] {
  const she = sex === 'female' ? 'she' : 'he';
  const She = sex === 'female' ? 'She' : 'He';
  const her = sex === 'female' ? 'her' : 'his';
  const bank: (() => Distractor)[] = [
    () => ({ kind: 'nursing note', text: `Fall risk assessment completed, score ${rng.int(35, 60)}, high risk. Bed alarm on, nonskid socks, call light within reach, hourly rounding. Family at bedside this evening.` }),
    () => ({ kind: 'nursing note', text: `Skin assessment on admission. Braden ${rng.int(14, 19)}. Skin intact, no pressure injury, heels floated. Turn every two hours while in bed. Barrier cream to the sacrum as a precaution.` }),
    () => ({ kind: 'consult note', text: `Dietitian consult. Regular diet with ${rng.pick(['no added salt', 'carbohydrate consistent', 'heart healthy'])} modification. Intake about ${rng.int(50, 80)} percent of meals. Supplement shake twice daily added. Will follow.` }),
    () => ({ kind: 'medication record', text: `Pharmacy note. Renal dosing reviewed, creatinine ${(rng.int(8, 14) / 10).toFixed(1)}, no adjustments needed today. Home medication list reconciled with the daughter by phone, one duplicate statin removed.` }),
    () => ({ kind: 'nursing note', text: `Potassium ${(rng.int(31, 35) / 10).toFixed(1)} this morning, repleted with ${rng.pick([20, 40])} milliequivalents oral per protocol. Recheck with morning labs.` }),
    () => ({ kind: 'consult note', text: `Social work met with the patient and ${her} ${rng.pick(['daughter', 'son', 'spouse'])} to confirm the home address, the primary contact, and transportation for follow-up appointments. No barriers identified today.` }),
    () => ({ kind: 'nursing note', text: `Patient requested something for sleep. Melatonin ${rng.pick([3, 5])} milligrams given per order at 2130. Slept in two-hour stretches per night shift report.` }),
    () => ({ kind: 'nursing note', text: `IV site rotated from the left forearm to the right hand, old site without redness. Dressing dated. Patient tolerated well.` }),
    () => ({ kind: 'nursing note', text: `Bowel regimen started, senna and docusate at bedtime. Last bowel movement ${rng.int(2, 3)} days ago per patient. Encouraged fluids and ambulation as able.` }),
    () => ({ kind: 'nursing note', text: `Chaplain visited at the patient's request, about twenty minutes. ${She} appreciated the visit. No needs identified.` }),
    () => ({ kind: 'nursing note', text: `Glucose checks before meals and at bedtime, ranging ${rng.int(118, 150)} to ${rng.int(160, 230)}. Sliding scale given per protocol. Patient's own glucometer at bedside, sent home with family for safekeeping.` }),
    () => ({ kind: 'consult note', text: `Audiology screen at nursing's request. ${She} wears a hearing aid on the ${rng.pick(['left', 'right'])}, battery replaced, hears conversational voice well now. No further needs.` }),
    () => ({ kind: 'nursing note', text: `Pneumococcal vaccine status reviewed, up to date per state registry. Influenza vaccine offered and accepted, given left deltoid.` }),
    () => ({ kind: 'nursing note', text: `Dentures labeled and placed in the denture cup at the bedside. Patient prefers them out at night. Oral care done.` }),
    () => ({ kind: 'medication record', text: `Home ${rng.pick(['levothyroxine', 'amlodipine', 'atorvastatin', 'omeprazole'])} resumed at the home dose this morning after review with the attending. No interactions flagged.` }),
    () => ({ kind: 'nursing note', text: `Daily weight ${rng.int(140, 210)} pounds, up ${rng.int(0, 2)} from yesterday. Intake and output recorded. Repositioned per schedule, skin checked.` }),
  ];
  const picks = rng.shuffle(bank).slice(0, Math.min(n, bank.length));
  return picks.map(make => make());
}
