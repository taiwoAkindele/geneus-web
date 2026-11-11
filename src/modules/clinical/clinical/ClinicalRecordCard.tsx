import type { ClinicalEvent } from '@shared';
import { Button } from '@/ui';
import { CLINICAL_FIELDS } from './clinicalForms';

export const clinicalTitle = (event: ClinicalEvent): string =>
  String(event.values.label ?? event.values.drug ?? event.values.allergen ?? event.values.title ?? event.values.specialty ?? 'Clinical history');

const shown = (value: unknown): string => typeof value === 'object' && value !== null
  ? Object.entries(value).map(([key, measurement]) => `${key}: ${measurement}`).join('; ')
  : String(value);

type Props = {
  event: ClinicalEvent; versions: ClinicalEvent[]; patientId: string;
  staffNames: Map<string, string>; problems: ClinicalEvent[]; canRecord: boolean; onEdit: () => void;
};
export const ClinicalRecordCard = ({ event, versions, patientId, staffNames, problems, canRecord, onEdit }: Props) => {
  const fields = CLINICAL_FIELDS[event.kind];
  const author = (version: ClinicalEvent) => staffNames.get(version.createdBy) ?? version.createdBy;
  const problem = problems.find((item) => item.recordId === event.values.problemId);
  return <article className="rounded-field border border-outline-soft p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <b>{clinicalTitle(event)}</b>
      {canRecord ? <Button variant="ghost" fullWidth={false} onClick={onEdit}>Review / update</Button> : null}
    </div>
    <dl className="space-y-1 text-sm">
      {fields.filter((field) => event.values[field.key]).map((field) => <div key={field.key}>
        <dt className="inline font-semibold">{field.label}: </dt>
        <dd className="inline whitespace-pre-wrap">{shown(event.values[field.key])}</dd>
      </div>)}
      {Object.entries((event.values.measurements ?? {}) as Record<string, string>).map(([label, value]) => <div key={label}>
        <dt className="inline font-semibold">{label}: </dt><dd className="inline">{value}</dd>
      </div>)}
    </dl>
    {event.values.problemId ? <p className="mt-2 text-sm">Related problem: {problem ? clinicalTitle(problem) : 'Not available on this device'}</p> : null}
    <p className="mt-2 text-xs text-ink-muted">
      <time dateTime={event.createdOn}>{new Date(event.createdOn).toLocaleString('en-GB')}</time>
      {' · '}{author(event)} · {event.actorRole}
      {event.patientId !== patientId ? ` · Linked ID ${event.patientId}` : ''}
    </p>
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-semibold">Version history · {versions.length}</summary>
      {[...versions].sort((a, b) => b.createdOn.localeCompare(a.createdOn)).map((version) => <div key={version.id} className="my-2 border-l-2 border-outline pl-2">
        <p>{version.id === event.id ? 'Current version · ' : ''}{new Date(version.createdOn).toLocaleString('en-GB')} · {author(version)} · {version.actorRole}</p>
        <dl>{Object.entries(version.values).map(([key, value]) => <div key={key}>
          <dt className="inline font-semibold">{fields.find((field) => field.key === key)?.label ?? key}: </dt>
          <dd className="inline whitespace-pre-wrap">{shown(value)}</dd>
        </div>)}</dl>
      </div>)}
    </details>
  </article>;
};
