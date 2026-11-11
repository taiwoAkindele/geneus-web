import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthorizationContext, useSession } from '@/session';
import { AuthorizationError } from '@/data';
import { ReviewSaveSheet, STEP_DEFS, StepForm, summarize, useEncounter } from '@/modules/clinical/encounter';
import { RequestHeader } from '@/modules/clinical/encounter/components/RequestHeader';
import { PatientChartAccess } from '@/modules/front-desk/patients/PatientChartAccess';
import { usePatient } from '@/modules/front-desk/search';
import { Button, Tag, useToast } from '@/ui';
import { pharmacySupported } from '@/data/pharmacySupport';
import { QuantityDispenseScreen } from '@/modules/clinical/pharmacy/QuantityDispenseScreen';

const QUEUE = '/pharmacy';
export const dispensePath = (patientId: string, encounterId: string, prescriptionId?: string) => `/pharmacy/request?${new URLSearchParams({ patient: patientId, visit: encounterId, ...(prescriptionId ? { prescription: prescriptionId } : {}) })}`;

export const DispenseScreen = () => {
  const context = useAuthorizationContext();
  const [supported, setSupported] = useState(() => pharmacySupported(context));
  useEffect(() => { const refresh = () => setSupported(pharmacySupported(context)); window.addEventListener('geneus:pharmacySupport', refresh); return () => window.removeEventListener('geneus:pharmacySupport', refresh); }, [context.facilityId, context.deviceId]);
  return <PatientChartAccess>{supported ? <QuantityDispenseScreen /> : <Dispense />}</PatientChartAccess>;
};

/**
 * One prescription, dispensed in the Pharmacy: the patient and their allergies,
 * what was prescribed, and what is handed over. Saved to the visit, as before;
 * no clinical visit steps are shown here.
 */
const Dispense = () => {
  const [params] = useSearchParams(), patientId = params.get('patient') ?? '', encounterId = params.get('visit') ?? '';
  const navigate = useNavigate(), toast = useToast(), context = useAuthorizationContext(), { user } = useSession();
  const patient = usePatient(patientId);
  const ctl = useEncounter(patientId, encounterId, undefined, 'dispense');
  const [reviewing, setReviewing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const busy = useRef(false);
  useEffect(() => { document.title = 'Dispense · Geneus Health'; }, []);

  if (!patientId || !encounterId) return <p className="p-6">Open a prescription from the Pharmacy.</p>;
  if (patient.loading || (ctl.loading && !ctl.enc.id)) return <p role="status" className="p-6">Opening the prescription…</p>;
  if (!patient.data || ctl.error) return <div role="alert" className="space-y-3 p-6"><p>{ctl.error?.message ?? 'This patient is not on this device.'}</p><Button variant="outlined" fullWidth={false} onClick={() => navigate(QUEUE)}>Back to Pharmacy</Button></div>;
  const enc = ctl.enc, done = enc.sig.dispense, canRecord = context.permissions.includes('encounter:record');
  const prescribedBy = enc.sig.prescription ?? enc.sig.diagnosis;

  const review = () => { const problems = ctl.problems('dispense'); if (problems.length) setError(problems.join(' · ')); else { setError(''); setReviewing(true); } };
  const save = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await ctl.lockStep('dispense'); toast('Dispensing signed and saved on this device'); navigate(QUEUE); }
    catch (cause) {
      if (!(cause instanceof AuthorizationError)) console.error('Dispense failed', cause);
      setError(cause instanceof Error ? cause.message : 'Could not save. Your entries are still here.'); setReviewing(false);
    } finally { busy.current = false; setSaving(false); }
  };

  return <div className="min-h-screen space-y-6 bg-white px-4 pb-8 pt-4 md:px-8">
    <RequestHeader patient={patient.data} back={{ to: QUEUE, label: 'Back to Pharmacy' }}>{done ? <Tag tone="green">Dispensed</Tag> : <Tag tone="amber">To dispense</Tag>}</RequestHeader>
    {prescribedBy ? <p className="text-sm text-ink-soft">Prescribed by {prescribedBy.actor} · {prescribedBy.date} {prescribedBy.time}</p> : null}
    <section aria-labelledby="dispense-heading" className="space-y-4">
      <h2 id="dispense-heading" className="text-xl font-extrabold">{done ? 'Dispensed' : 'Dispense medication'}</h2>
      {done ? <>
        <dl className="space-y-3 text-sm">{summarize(enc.data, 'dispense').map((row) => <div key={row.label}><dt className="font-bold text-ink-soft">{row.label}</dt><dd className="mt-1 whitespace-pre-wrap">{row.value}</dd></div>)}</dl>
        <p className="border-t border-outline-soft pt-4 text-sm">Signed by {done.actor} · {done.role} · {done.date} {done.time}</p>
      </> : canRecord ? <>
        <StepForm stepKey="dispense" ctl={ctl} patientId={patientId} />
        {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-4 text-sm text-danger-strong">{error}</p> : null}
        <p className="rounded-field bg-amber-bg p-3 text-sm text-amber-text">Draft on this device · not signed</p>
        <Button disabled={saving} onClick={review}>Review &amp; sign {STEP_DEFS.dispense.short.toLowerCase()}</Button>
      </> : <p className="text-sm text-ink-soft">You have view access. Pharmacy staff record dispensing.</p>}
    </section>
    {reviewing ? <ReviewSaveSheet title={STEP_DEFS.dispense.title} rows={summarize(enc.data, 'dispense')} actor={{ name: user.name, role: user.role }} confirmLabel="Confirm & lock" onConfirm={() => void save()} onClose={() => setReviewing(false)} saving={saving} /> : null}
  </div>;
};
