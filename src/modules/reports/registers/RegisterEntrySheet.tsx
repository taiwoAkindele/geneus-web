import { useEffect, useRef, useState } from 'react';
import { validateRegisterEntry, type RegisterEntry } from '@shared';
import { Button, Sheet, SheetCancelButton, useToast } from '@/ui';
import { useSession } from '@/session';
import { RegisterField } from './RegisterField';
import { useRegisters } from './RegistersProvider';
import type { EntryValue, EntryValues, RegisterDef } from './types';

/** A register value as text: lists joined, yes/no for checkboxes, a dash when empty. */
export const fmtCell = (v: EntryValue | undefined): string => {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return v === undefined || v === '' ? '—' : String(v);
};

/** The visit an entry completes: its saved staff entry and, from the register, the values the visit filled. */
export type EntryVisit = { encounterId: string; patientId: string; completion?: RegisterEntry; values?: Record<string, EntryValue> };

/**
 * A new entry, or, given a `visit`, the fields staff record for it in a register
 * filled from visits — from the register's row, or inside the visit itself.
 */
export const RegisterEntrySheet = ({ register, visit, inVisit = false, onClose }: { register: RegisterDef; visit?: EntryVisit; inVisit?: boolean; onClose: () => void }) => {
  const { addEntry } = useRegisters();
  const fields = visit ? register.fields.filter((field) => !field.fromVisit) : register.fields;
  const { user } = useSession();
  const toast = useToast();

  const [draft, setDraft] = useState<EntryValues>(() => {
    const seed: EntryValues = {};
    fields.forEach((f) => {
      if (f.type === 'section') return;
      seed[f.id] = visit?.completion?.values[f.id] ?? (f.type === 'multiselect' ? [] : f.type === 'checkbox' ? false : '');
    });
    return seed;
  });

  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [edited, setEdited] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  useEffect(() => { if (issues.length || reviewing) summary.current?.focus(); }, [issues, reviewing]);
  const review = () => {
    const errors = validateRegisterEntry(fields, draft);
    setIssues(errors);
    if (!errors.length) setReviewing(true);
  };

  const save = async () => {
    if (savingRef.current || !reviewing) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const issues = await addEntry(register.id, { values: draft, ...(visit ? { visit: { encounterId: visit.encounterId, patientId: visit.patientId } } : {}) });
      if (issues.length > 0) {
        setIssues(issues); setReviewing(false);
        return;
      }
      toast(visit ? `${inVisit ? register.name + ' details saved' : 'Visit row completed'} — recorded by ${user.name}` : `Entry saved & locked — recorded by ${user.name}`);
      onClose();
    } catch (cause) { setIssues([cause instanceof Error ? cause.message : 'Could not save the entry. Try again.']); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <Sheet onClose={onClose} closeDisabled={saving} hasUnsavedChanges={edited} eyebrow={`${register.category} · ${inVisit ? 'Details for this visit' : visit ? 'Complete visit row' : 'New entry'}`} title={reviewing ? `Review · ${register.name}` : register.name}>
      {issues.length ? <div ref={summary} tabIndex={-1} role="alert" className="mb-4 rounded-field border border-danger bg-danger-bg p-4 text-sm text-danger"><p className="font-bold">Check this entry</p><ul className="mt-2 list-disc pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
      {visit?.values ? <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-field bg-surface-muted p-3 text-sm">{register.fields.filter((field) => field.fromVisit).slice(0, 6).map((field) => <div key={field.id} className="min-w-0"><dt className="text-xs font-bold text-ink-muted">{field.label}</dt><dd className="break-words">{fmtCell(visit.values?.[field.id])}</dd></div>)}</dl> : null}
      {reviewing ? <div ref={summary} tabIndex={-1} className="space-y-4 outline-none"><p className="text-sm text-ink-muted">Check the answers before signing. The saved entry is permanent and attributed to {user.name}.</p><dl className="divide-y divide-outline-soft">{fields.filter((field) => field.type !== 'section').map((field) => <div key={field.id} className="py-3"><dt className="text-xs font-bold text-ink-muted">{field.label}</dt><dd className="mt-1 break-words text-sm">{fmtCell(draft[field.id])}</dd></div>)}</dl></div> : <div className="flex flex-col gap-4">
        {fields.map((f) => (
          <RegisterField
            key={f.id}
            field={f}
            value={draft[f.id]}
            error={issues.length ? validateRegisterEntry([f], draft)[0] : undefined}
            onChange={(v) => { const next = { ...draft, [f.id]: v }; setEdited(true); setDraft(next); if (issues.length) setIssues(validateRegisterEntry(fields, next)); }}
          />
        ))}
      </div>}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button variant="primary" fullWidth={false} className="flex-1" loading={saving} onClick={reviewing ? save : review}>
          {reviewing ? 'Sign & save entry' : 'Review entry'}
        </Button>
        {reviewing ? <Button variant="outlined" fullWidth={false} className="px-6" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : <SheetCancelButton disabled={saving} />}
      </div>
    </Sheet>
  );
};
