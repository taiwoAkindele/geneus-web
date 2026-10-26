import { useState } from 'react';
import { ClinicalKind, unreviewedLegacyAllergies, type ClinicalEvent } from '@shared';
import type { PatientClinicalRecord } from '@/data/repos/clinical';
import { Button, DataTable, Sheet, TextField } from '@/ui';
import { ClinicalRecordSheet } from '@/features/clinical/ClinicalRecordSheet';
import { ClinicalRecordCard, clinicalTitle } from '@/features/clinical/ClinicalRecordCard';
import { CLINICAL_LABELS } from '@/features/clinical/clinicalForms';
import { PrescriptionHistory, type ClinicalEditor } from '@/features/clinical/PrescriptionHistory';
import { visitDate } from '@/features/encounter/VisitTable';

const CATEGORY_LABELS: Record<ClinicalKind, string> = { problem: 'Problems', history: 'History', medication: 'Medicines', allergy: 'Allergies', care_plan: 'Care plans', specialty: 'Specialty care' };
const ADD_LABELS: Record<ClinicalKind, string> = { problem: 'problem', history: 'history / examination', medication: 'medication', allergy: 'allergy', care_plan: 'care plan', specialty: 'specialty assessment' };

export const ClinicalRecordManager = ({ patientId, data, kind, onKindChange, canRecord, onRefresh }: { patientId: string; data: PatientClinicalRecord; kind: ClinicalKind; onKindChange: (kind: ClinicalKind) => void; canRecord: boolean; onRefresh: () => void }) => {
  const [editor, setEditor] = useState<ClinicalEditor>();
  const [history, setHistory] = useState<ClinicalEvent>();
  const [search, setSearch] = useState('');
  const records = data.current.filter((event) => event.kind === kind);
  const query = search.trim().toLocaleLowerCase();
  const shown = records.filter((event) => !query || [clinicalTitle(event), ...Object.values(event.values).filter((value) => typeof value === 'string')].join(' ').toLocaleLowerCase().includes(query));
  const problems = data.current.filter((event) => event.kind === 'problem');
  const legacy = unreviewedLegacyAllergies(data.events, data.patients);
  return <section className="space-y-5" aria-label="Manage clinical record">
    <div><h2 className="text-2xl font-extrabold">Clinical record</h2><p className="mt-1 text-sm text-ink-soft">Maintain ongoing care. Earlier signed versions stay in the medical chart.</p></div>
    <nav aria-label="Clinical record categories" className="flex gap-2 overflow-x-auto border-b border-outline-soft pb-2">{ClinicalKind.options.map((category) => <button type="button" key={category} aria-current={kind === category ? 'page' : undefined} className={`min-h-[48px] shrink-0 border-b-2 px-3 text-sm font-bold ${kind === category ? 'border-brand text-brand' : 'border-transparent text-ink-soft'}`} onClick={() => onKindChange(category)}>{CATEGORY_LABELS[category]} · {data.current.filter((event) => event.kind === category).length + (category === 'allergy' ? legacy.length : 0)}</button>)}</nav>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">{CLINICAL_LABELS[kind]}</h3>{canRecord ? <Button variant="outlined" fullWidth={false} onClick={() => setEditor({ kind })}>Add {ADD_LABELS[kind]}</Button> : <p className="text-sm text-ink-soft">View access · a clinician records updates.</p>}</div>
    {kind === 'allergy' ? legacy.map((allergy) => <div key={allergy.patientId + allergy.allergen} className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-amber-border bg-amber-bg p-4 text-sm"><div><b>{allergy.allergen}</b><p>Legacy report · reaction and severity need review.</p>{allergy.patientId !== patientId ? <p className="break-all">Recorded under linked ID {allergy.patientId}</p> : null}</div>{canRecord ? <Button variant="outlined" fullWidth={false} onClick={() => setEditor({ kind: 'allergy', patientId: allergy.patientId, initial: { allergen: allergy.allergen } })}>Review legacy allergy</Button> : null}</div>) : null}
    {records.length ? <TextField label="Search clinical records" placeholder="Name, status or recorded details" value={search} onChange={(event) => setSearch(event.target.value)} /> : null}
    {shown.length ? <DataTable key={kind + query} caption={CLINICAL_LABELS[kind]} rows={shown} rowKey={(event) => event.id} columns={[
      { key: 'record', label: 'Record', sortValue: clinicalTitle, render: (event) => <button type="button" className="min-h-[44px] text-left font-bold text-brand hover:underline" onClick={() => setHistory(event)}>{clinicalTitle(event)}<span className="mt-1 block text-xs font-normal text-ink-soft md:hidden">{visitDate(event.createdOn)}</span></button> },
      { key: 'status', label: 'Status', render: (event) => <div className="text-sm">{String(event.values.status ?? 'Recorded')}{event.values.certainty ? <p className="mt-1 text-ink-soft">{String(event.values.certainty)}</p> : null}{event.values.verification ? <p className="mt-1 text-ink-soft">{String(event.values.verification)}</p> : null}</div> },
      { key: 'updated', label: 'Recorded', className: 'hidden md:table-cell', sortValue: (event) => event.createdOn, render: (event) => <div>{visitDate(event.createdOn)}<p className="mt-1 text-xs text-ink-soft">{data.staffNames.get(event.createdBy) ?? event.createdBy}</p></div> },
      { key: 'actions', label: 'Actions', render: (event) => <div className="flex flex-wrap gap-2">{canRecord ? <Button variant="ghost" fullWidth={false} className="px-1 py-2 text-sm" onClick={() => setEditor({ kind, previous: event })}>Review / update</Button> : null}<Button variant="ghost" fullWidth={false} className="px-1 py-2 text-sm" onClick={() => setHistory(event)}>Version history</Button></div> },
    ]} /> : <p className="rounded-field border border-dashed border-outline p-5 text-sm text-ink-soft">{records.length && query ? <>No records match this search. <button type="button" onClick={() => setSearch('')} className="min-h-[44px] font-bold text-brand">Clear search</button></> : kind === 'allergy' && legacy.length ? 'No structured allergy reviews recorded yet. Legacy reports above still count as recorded allergies.' : `No ${CLINICAL_LABELS[kind].toLowerCase()} recorded.`}</p>}
    {kind === 'medication' || kind === 'problem' ? <PrescriptionHistory entries={data.entries} current={data.current} canRecord={canRecord} onEdit={setEditor} /> : null}
    {editor ? <ClinicalRecordSheet key={`${editor.kind}-${editor.previous?.id ?? 'new'}-${editor.patientId ?? patientId}`} {...editor} patientId={editor.previous?.patientId ?? editor.patientId ?? patientId} problems={problems} onClose={() => { setEditor(undefined); onRefresh(); }} /> : null}
    {history ? <Sheet title={clinicalTitle(history)} eyebrow="Signed clinical record and versions" placement="side" onClose={() => setHistory(undefined)}><ClinicalRecordCard event={history} versions={data.events.filter((event) => event.recordId === history.recordId)} patientId={patientId} staffNames={data.staffNames} problems={problems} canRecord={false} onEdit={() => undefined} /></Sheet> : null}
  </section>;
};
