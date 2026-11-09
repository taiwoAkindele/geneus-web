import { effectiveEncounterEntries, ENCOUNTER_STEP_VALUES, prescriptionLines, supplyState, dispensingDetails, unreturnedQuantity, dischargeHeads, type PharmacyPrescription, type WardCareEvent, type EncounterEntry, type EncounterStep } from '@shared';

/**
 * The laboratory and pharmacy work lists: each test order and each prescription is
 * one request, open until every test has a result or the prescription is dispensed.
 * Like the station queues, nothing is written to put a request here; each list is
 * read from the steps already saved, so it can never disagree with the visit.
 */
export type ServiceRequest = {
  /** The order or prescription entry this request is. */
  id: string;
  encounterId: string;
  patientId: string;
  requestedOn: string;
  /** Test or medicine names, in the order requested. */
  items: string[];
  /** Test names still without a result (laboratory only). */
  pending: string[];
  completedOn?: string;
  billingPending?: number;
  quantityTracked?: boolean;
  partSupplied?: boolean;
  superseded?: boolean;
};
export type RequestQueue = { open: ServiceRequest[]; completed: ServiceRequest[] };

export const REQUEST_STEPS: readonly EncounterStep[] = ['lab_order', 'lab_results', 'prescription', 'diagnosis', 'dispense', 'amendment'];

const latest = (entries: readonly EncounterEntry[], step: EncounterStep) => entries.filter((e) => e.step === step).sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0];
const newestFirst = (a: ServiceRequest, b: ServiceRequest) => (b.completedOn ?? b.requestedOn).localeCompare(a.completedOn ?? a.requestedOn);
const oldestFirst = (a: ServiceRequest, b: ServiceRequest) => a.requestedOn.localeCompare(b.requestedOn);
const quantityRequest = (source: PharmacyPrescription, saved: readonly EncounterEntry[]): ServiceRequest => {
  const states = prescriptionLines(source).map((line) => supplyState(source, line.lineId, saved));
  const pending = states.filter((state) => !state.complete || state.conflict).map((state) => state.line!.drug);
  const priced = new Set(saved.map((e) => dispensingDetails(e)?.priceFor).filter(Boolean));
  const billingPending = saved.filter((e) => { const d = dispensingDetails(e); return d?.prescriptionEntryId === source.id && d.action === 'supply' && d.billing === 'unpriced' && !priced.has(e.id) && unreturnedQuantity(e, saved) > 0; }).length;
  return { id: source.id, encounterId: source.encounterId, patientId: source.patientId, requestedOn: source.createdOn, items: prescriptionLines(source).map((line) => line.drug), pending, billingPending, quantityTracked: true, partSupplied: states.some((state) => state.supplied > 0) && pending.length > 0 };
};

export const requestQueues = (entries: readonly EncounterEntry[], wardEvents: readonly WardCareEvent[] = []): { lab: RequestQueue; pharmacy: RequestQueue } => {
  const byEncounter = new Map<string, EncounterEntry[]>();
  for (const entry of effectiveEncounterEntries(entries)) byEncounter.set(entry.encounterId, [...(byEncounter.get(entry.encounterId) ?? []), entry]);
  const lab: RequestQueue = { open: [], completed: [] }, pharmacy: RequestQueue = { open: [], completed: [] };
  for (const [encounterId, saved] of byEncounter) {
    const order = latest(saved, 'lab_order');
    if (order) {
      const { tests, items } = ENCOUNTER_STEP_VALUES.lab_order.parse(order.values);
      const results = saved.filter((e) => e.step === 'lab_results');
      const done = new Set(results.flatMap((e) => ENCOUNTER_STEP_VALUES.lab_results.parse(e.values).results.map((r) => r.orderItemId ?? r.test)));
      const pending = tests.filter((test, index) => !done.has(items?.[index]?.id ?? test));
      const request = { id: order.id, encounterId, patientId: order.patientId, requestedOn: order.createdOn, items: tests, pending };
      if (pending.length) lab.open.push(request);
      else lab.completed.push({ ...request, completedOn: results.map((e) => e.createdOn).sort().reverse()[0] });
    }
    // A visit recorded in the retired order carried its prescription on the diagnosis.
    const medication = latest(saved, 'prescription') ?? latest(saved, 'diagnosis');
    if (medication) {
      const { prescription } = medication.step === 'prescription' ? ENCOUNTER_STEP_VALUES.prescription.parse(medication.values) : ENCOUNTER_STEP_VALUES.diagnosis.parse(medication.values);
      if (prescription.length) {
        const quantityTracked = saved.some((e) => e.pharmacyVersion === 1);
        if (quantityTracked) {
          const request = quantityRequest(medication, saved);
          if (request.pending.length) pharmacy.open.push(request);
          else pharmacy.completed.push({ ...request, completedOn: saved.filter((e) => e.pharmacyVersion === 1).map((e) => e.createdOn).sort().slice(-1)[0] });
          continue;
        }
        const dispensed = latest(saved, 'dispense');
        const request = { id: medication.id, encounterId, patientId: medication.patientId, requestedOn: medication.createdOn, items: prescription.map((line) => line.drug), pending: [] };
        if (dispensed) pharmacy.completed.push({ ...request, completedOn: dispensed.createdOn });
        else pharmacy.open.push(request);
      }
    }
  }
  for (const summary of wardEvents.filter((e) => e.values.kind === 'discharge' && e.values.takeHome.length)) {
    const saved = entries.filter((e) => e.encounterId === summary.encounterId);
    const request = quantityRequest(summary, saved);
    const current = dischargeHeads(wardEvents.filter((e) => e.admissionId === summary.admissionId));
    if (!current.some((e) => e.id === summary.id)) pharmacy.completed.push({ ...request, superseded: true, pending: [], completedOn: summary.createdOn });
    else if (request.pending.length) pharmacy.open.push(request);
    else pharmacy.completed.push({ ...request, completedOn: saved.filter((e) => e.pharmacyVersion === 1).map((e) => e.createdOn).sort().slice(-1)[0] });
  }
  for (const queue of [lab, pharmacy]) { queue.open.sort(oldestFirst); queue.completed.sort(newestFirst); }
  return { lab, pharmacy };
};
