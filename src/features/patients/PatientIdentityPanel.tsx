import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { canonicalPatientId, linkedPatientIds } from '@shared';
import { useLiveQuery } from '@/data';
import { listIdentityEvents } from '@/data/repos/patientIdentity';
import { getPatient } from '@/data/repos/patients';
import { useAuthorizationContext } from '@/session';
import { Button } from '@/ui';

export const PatientIdentityPanel = ({ patientId }: { patientId: string }) => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const data = useLiveQuery(useCallback(async () => { const events = await listIdentityEvents(); return { events, patients: await Promise.all(linkedPatientIds(patientId, events).map(getPatient)) }; }, [patientId]));
  if (data.error) return <p role="alert" className="my-3 text-sm text-danger">Linked identities could not be read. <button onClick={data.reload}>Try again</button></p>;
  const events = data.data?.events ?? [];
  const ids = linkedPatientIds(patientId, events);
  if (ids.length < 2) return null;
  const primary = canonicalPatientId(patientId, events);
  return <section className="my-4 space-y-2 rounded-card border border-outline bg-white p-4">
    <h2 className="font-bold">Linked patient records</h2><p className="text-sm text-ink-muted">History includes these IDs. Demographics and financial records retain their original IDs. Review any conflicting allergies or details before care.</p>
    {data.data?.patients.filter((p) => p && p.allergies.length > 0).map((p) => p ? <p key={p.id} className="text-sm font-bold text-danger">Allergies recorded under {p.id}: {p.allergies.join(', ')}</p> : null)}
    {ids.map((id) => <div key={id} className="flex flex-wrap items-center gap-2 text-xs"><button type="button" className="min-h-[44px] break-all font-mono font-bold text-brand" onClick={() => navigate('/patients/profile', { state: { patientId: id } })}>{id}{id === primary ? ' (primary)' : ''}{id === patientId ? ' (viewing)' : ''}</button>{context.permissions.some((p) => ['payment:receive', 'payment:waive', 'fee_item:manage'].includes(p)) ? <Button variant="ghost" fullWidth={false} onClick={() => navigate(`/billing?patient=${encodeURIComponent(id)}`)}>Open billing for this ID</Button> : null}</div>)}
    {context.permissions.includes('patient_identity:resolve') ? <Button variant="ghost" onClick={() => navigate('/patients/identity')}>Review identity links</Button> : null}
  </section>;
};
