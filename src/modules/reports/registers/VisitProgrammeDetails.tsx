import { useState } from 'react';
import type { VisitType } from '@shared';
import { useAuthorizationContext } from '@/session';
import { Button, Tag } from '@/ui';
import { RegisterEntrySheet } from './RegisterEntrySheet';
import { useRegisters } from './RegistersProvider';
import type { RegisterDef } from './types';

/**
 * Inside a visit, the registers that take this type of visit and ask staff for
 * details the visit does not record (gestational age, vaccines given, method).
 * Saved as the register entry for this visit; nothing here is required to close it.
 */
export const VisitProgrammeDetails = ({ patientId, encounterId, visitType }: { patientId: string; encounterId: string; visitType: VisitType }) => {
  const { registers } = useRegisters(), context = useAuthorizationContext();
  const [open, setOpen] = useState<RegisterDef>();
  const shown = registers.filter((register) => register.status === 'published' && register.visitLink?.visits === 'visit_types'
    && register.visitLink.visitTypes.includes(visitType) && register.fields.some((field) => field.type !== 'section' && !field.fromVisit));
  if (!shown.length) return null;
  const canRecord = context.permissions.includes('register_entry:create');
  const latest = (register: RegisterDef) => register.completions.filter((entry) => entry.encounterId === encounterId).sort((a, b) => a.createdOn.localeCompare(b.createdOn)).pop();
  return <section aria-labelledby="programme-details-heading" className="mb-5 space-y-3 rounded-card border border-outline-soft p-4">
    <div><h3 id="programme-details-heading" className="font-extrabold">Programme details</h3><p className="mt-1 text-sm text-ink-soft">What the register books need beyond the visit record. Optional; record it now or later from the register.</p></div>
    <ul className="divide-y divide-outline-soft">{shown.map((register) => {
      const saved = latest(register);
      return <li key={register.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="font-bold">{register.name}</p><p className="text-sm text-ink-soft">{saved ? `Recorded ${new Date(saved.createdOn).toLocaleString('en-GB')}` : 'Not recorded yet'}</p></div>
        {canRecord ? <Button variant={saved ? 'outlined' : 'primary'} fullWidth={false} className="px-4" onClick={() => setOpen(register)}>{saved ? 'Update details' : 'Record details'}</Button> : <Tag tone={saved ? 'green' : 'amber'}>{saved ? 'Recorded' : 'Not recorded'}</Tag>}
      </li>;
    })}</ul>
    {open ? <RegisterEntrySheet key={open.id} register={open} inVisit visit={{ encounterId, patientId, completion: latest(open) }} onClose={() => setOpen(undefined)} /> : null}
  </section>;
};
