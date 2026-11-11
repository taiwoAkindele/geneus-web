import { useCallback } from 'react';
import { effectiveEncounterEntries } from '@shared';
import { useLiveQuery } from '@/data';
import { listStockItems } from '@/data/repos/stock';
import { entriesForPatient } from '@/data/repos/encounters';
import { clinicalEventsForPatient } from '@/data/repos/clinical';
import { currentClinicalEvents } from '@shared';
import { patientIdentityIds } from '@/data/repos/patientIdentity';
import { clinicalTitle } from '@/modules/clinical/clinical/ClinicalRecordCard';
import { Button } from '@/ui';
import { EMPTY_ENCOUNTER_DATA } from '../encounterRecord';
import { fromStepValues } from '../stepValues';
import type { RxLine } from '../types';

export const MEDICINE_LIST_ID = 'geneus-medicine-names';

/** The patient's most recent signed prescription, as editable lines. */
const lastPrescription = async (patientId: string): Promise<{ lines: RxLine[]; on: string } | undefined> => {
  const ids = await patientIdentityIds(patientId);
  const entries = effectiveEncounterEntries((await Promise.all(ids.map(entriesForPatient))).flat())
    .filter((entry) => entry.step === 'prescription' || entry.step === 'diagnosis')
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));
  for (const entry of entries) {
    const data = fromStepValues(entry.step === 'prescription' ? 'prescription' : 'diagnosis', entry.values, { ...EMPTY_ENCOUNTER_DATA, workflowVersion: entry.workflowVersion });
    const lines = entry.step === 'prescription' ? data.prescription.rx : data.diagnosis.rx;
    if (lines.length) return { lines: lines.map((line) => ({ ...line, quantity: undefined })), on: entry.createdOn };
  }
  return undefined;
};

/** Medicines confirmed as current on the patient's medication list. */
const currentMedicines = async (patientId: string): Promise<RxLine[]> => {
  const ids = await patientIdentityIds(patientId);
  const events = currentClinicalEvents((await Promise.all(ids.map(clinicalEventsForPatient))).flat());
  return events.filter((event) => event.kind === 'medication' && event.values.status === 'active').map((event) => ({
    name: clinicalTitle(event), dose: String(event.values.dose ?? ''),
    frequency: event.values.frequency ? String(event.values.frequency) : undefined, route: event.values.route ? String(event.values.route) : undefined,
  }));
};

/**
 * Shortcuts that copy known facts into the draft prescription: medicine names
 * from stock, the last prescription and current medicines. Everything copied
 * stays editable and is still reviewed and signed; quantities are never copied.
 */
export const PrescriptionHelpers = ({ patientId, onAdd }: { patientId?: string; onAdd: (lines: RxLine[]) => void }) => {
  const stock = useLiveQuery(listStockItems);
  const known = useLiveQuery(useCallback(async () => patientId ? { last: await lastPrescription(patientId), current: await currentMedicines(patientId) } : undefined, [patientId]));
  const names = [...new Set((stock.data ?? []).map((item) => item.name))].sort((a, b) => a.localeCompare(b));
  const last = known.data?.last, current = known.data?.current ?? [];
  return <>
    <datalist id={MEDICINE_LIST_ID}>{names.map((name) => <option key={name} value={name} />)}</datalist>
    {last || current.length ? <div className="mb-3 flex flex-wrap items-center gap-2 rounded-field bg-surface p-3 text-sm">
      <span className="text-ink-soft">Copy into this prescription:</span>
      {last ? <Button variant="outlined" fullWidth={false} className="min-h-[44px] px-3 py-2 text-sm" onClick={() => onAdd(last.lines)}>Last prescription ({new Date(last.on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {last.lines.length})</Button> : null}
      {current.length ? <Button variant="outlined" fullWidth={false} className="min-h-[44px] px-3 py-2 text-sm" onClick={() => onAdd(current)}>Current medicines ({current.length})</Button> : null}
      <span className="w-full text-xs text-ink-muted">Copied lines stay editable. Check dose and quantity before signing.</span>
    </div> : null}
  </>;
};
