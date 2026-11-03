import { labPatientFacts } from '@shared';
import { TextField } from '@/ui';
import type { EncounterData, LabItemDraft } from '@/features/encounter/types';
import { orderKey, templateForOrder, useLabSetup } from './labEntry';
import { ResultEntryForm } from './ResultEntryForm';

/**
 * The laboratory's results for the tests ordered in this visit. A test with a
 * result template is entered part by part; any other test takes a free-text
 * result. Tests left empty stay pending for a later entry.
 */
export const LabResultsForm = ({ patientId, data, setResult, setReport, help }: {
  patientId: string; data: EncounterData; help?: Parameters<typeof TextField>[0]['help'];
  setResult: (key: string, value: string) => void; setReport: (key: string, draft: LabItemDraft) => void;
}) => {
  const setup = useLabSetup(patientId);
  if (data.lab_order.tests.length === 0) return <div className="text-[13px] text-ink-muted">No investigations were ordered for this encounter — skip this step.</div>;
  if (setup.loading && !setup.data) return <p role="status">Reading result templates…</p>;
  const templates = setup.data?.templates ?? [], patient = setup.data?.patient;
  const facts = patient ? labPatientFacts(patient, new Date().toISOString()) : {};
  return <div className="space-y-4">
    {data.lab_order.tests.map((test, index) => {
      const key = orderKey(data, index), template = templateForOrder(data, index, templates);
      return template ? <ResultEntryForm key={key} test={test} template={template} draft={data.lab_report[key]} facts={facts} onChange={(draft) => setReport(key, draft)} />
        : <TextField key={key} label={test} help={help} name={`lr_${index}`} value={data.lab_results[key] || ''} placeholder="Enter result…" onChange={(e) => setResult(key, e.target.value)} />;
    })}
    <p className="text-sm text-ink-soft">Leave a test empty if its result is not ready. It stays on the laboratory's open requests.</p>
  </div>;
};
