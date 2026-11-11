import { useState } from 'react';
import type { EncounterData } from '@/modules/clinical/encounter/types';
import { EMPTY_ENCOUNTER_DATA } from '@/modules/clinical/encounter/encounterRecord';
import type { StepFormController } from '@/modules/clinical/encounter/components/StepForm';

/** Reuse the encounter fields without inheriting yesterday's unsigned findings. */
export const useWardForm = (initial?: EncounterData) => {
  const [data, setData] = useState<EncounterData>(() => structuredClone(initial ?? EMPTY_ENCOUNTER_DATA));
  const setField: StepFormController['setField'] = (step, field, value) => setData((d) => ({ ...d, [step]: { ...d[step], [field]: value } }));
  const ctl: StepFormController = {
    enc: { data }, setField,
    toggleIn: (_step, field, value) => setData((d) => ({ ...d, lab_order: { ...d.lab_order, [field]: d.lab_order.tests.includes(value) ? d.lab_order.tests.filter((t) => t !== value) : [...d.lab_order.tests, value] } })),
    setResult: (test, value) => setData((d) => ({ ...d, lab_results: { ...d.lab_results, [test]: value } })),
    setLabReport: (key, value) => setData((d) => ({ ...d, lab_report: { ...d.lab_report, [key]: value } })),
    addRx: () => setData((d) => ({ ...d, prescription: { ...d.prescription, rx: [...d.prescription.rx, { name: '', dose: '' }] } })),
    setRx: (index, field, value) => setData((d) => ({ ...d, prescription: { ...d.prescription, rx: d.prescription.rx.map((line, i) => i === index ? { ...line, [field]: value } : line) } })),
    removeRx: (index) => setData((d) => ({ ...d, prescription: { ...d.prescription, rx: d.prescription.rx.filter((_, i) => i !== index) } })),
    setDispenseReason: (index, value) => setData((d) => ({ ...d, dispense: { ...d.dispense, reasons: { ...d.dispense.reasons, [index]: value } } })),
    toggleDispense: (index) => setData((d) => ({ ...d, dispense: { ...d.dispense, done: { ...d.dispense.done, [index]: !d.dispense.done[index] } } })),
  };
  return { data, setData, ctl };
};
