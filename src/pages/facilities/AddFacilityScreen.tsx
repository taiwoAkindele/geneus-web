import { useEffect, useRef, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { FacilityDetails, type OrganizationFacilityDefaults } from '@shared';
import { useSession } from '@/session';
import { useDeviceContext } from '@/data';
import { suggestCode } from '@/data/repos/facility';
import { clearFacilityCreation, enrollmentProof, pendingFacilityCreation, saveFacilityCreation, type PendingFacilityCreation } from '@/data/facilitySetup';
import { switchFacilityWorkspace } from '@/data/facilityWorkspaces';
import { createOrganizationFacility, organizationFacilityDefaults } from '@/lib/api/organizations';
import { ApiError } from '@/lib/api/client';
import { AppBar, Button, TextField } from '@/ui';
import { FacilityDetailsFields } from '@/pages/facility-onboarding/FacilityDetailsFields';

const FormDetails = FacilityDetails.extend({ organizationName: z.string().trim().max(200) });
type Values = FacilityDetails & { organizationName: string };
const empty: Values = { name: '', code: '', state: '', lga: '', level: 'phc', organizationName: '' };
const valuesFor = (pending: PendingFacilityCreation | undefined): Values => pending ? { name: pending.payload.name, code: pending.payload.code, state: pending.payload.state, lga: pending.payload.lga, level: pending.payload.level, organizationName: pending.payload.organizationName ?? '' } : empty;

export const AddFacilityScreen = () => {
  const navigate = useNavigate();
  const { user } = useSession();
  const { facility } = useDeviceContext();
  const sourceId = facility?.id ?? '';
  const [pending, setPending] = useState(() => pendingFacilityCreation(sourceId, user.staffId));
  const [defaults, setDefaults] = useState<OrganizationFacilityDefaults>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(navigator.onLine !== false);
  const form = useForm<Values>({ defaultValues: valuesFor(pending), resolver: async (input) => {
    const parsed = FormDetails.safeParse(input);
    if (parsed.success) return { values: parsed.data, errors: {} };
    const errors: FieldErrors<Values> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof Values;
      if (!errors[field]) errors[field] = { type: 'validate', message: issue.message };
    }
    return { values: {}, errors };
  } });
  const values = form.watch();

  const loadDefaults = async () => {
    setLoading(true); setError('');
    try { setDefaults(await organizationFacilityDefaults(user.staffId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load administrator details'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadDefaults(); }, [user.staffId]);
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', changed); window.addEventListener('offline', changed);
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);

  const openCreated = async (receipt: PendingFacilityCreation) => {
    const created = receipt.result;
    if (!created?.admin.personId) throw new Error('The new administrator membership could not be confirmed');
    await switchFacilityWorkspace(created.device.deviceId, created.device, { sourceStaffId: user.staffId, facilityId: created.facility.id, deviceId: created.device.deviceId, staffId: created.admin.staffId, personId: created.admin.personId, createdOn: Date.now() });
  };
  const create = form.handleSubmit(async (fields) => {
    if (submitting.current || !defaults || !online) return;
    if (!pending && !defaults.organization && !fields.organizationName.trim()) { form.setError('organizationName', { message: 'Enter the organization name' }); return; }
    submitting.current = true; setBusy(true); setError('');
    let receipt = pending;
    try {
      if (!receipt) {
        receipt = { sourceFacilityId: sourceId, payload: { ...fields, name: fields.name.trim(), state: fields.state.trim(), lga: fields.lga.trim(), ...(defaults.organization ? { organizationId: defaults.organization.id, organizationName: undefined } : {}), actorStaffId: user.staffId, requestId: crypto.randomUUID(), ...enrollmentProof(), deviceLabel: 'Additional organization facility' } };
        await saveFacilityCreation(receipt);
        setPending(receipt);
      }
      if (!receipt.result) {
        receipt = { ...receipt, result: await createOrganizationFacility(receipt.payload) };
        await saveFacilityCreation(receipt);
        setPending(receipt);
      }
      await openCreated(receipt);
    } catch (cause) {
      if (!receipt?.result && cause instanceof ApiError && ['invalid_registration', 'facility_code_taken', 'device_already_enrolled', 'organization_changed', 'verified_email_required', 'forbidden'].includes(cause.code)) {
        await clearFacilityCreation(sourceId, user.staffId); setPending(undefined);
        if (cause.code === 'facility_code_taken') form.setError('code', { message: cause.message });
        if (cause.code === 'organization_changed') void loadDefaults();
      }
      setError(cause instanceof Error ? cause.message : 'Could not create this facility');
    } finally { submitting.current = false; setBusy(false); }
  });

  return <>
    <AppBar title="Add facility" onBack={() => navigate(-1)} />
    <form onSubmit={(event) => { void create(event); }} noValidate className="mx-auto max-w-2xl space-y-6 px-5 pb-10 pt-3">
      <div><h1 className="text-xl font-extrabold">Create another facility</h1><p className="mt-2 text-sm text-ink-soft">Set up its details just as you did for your first facility.</p></div>
      {error ? <div role="alert" className="space-y-3 rounded-field bg-danger-bg p-4 text-sm text-danger-strong"><p>{error}</p>{!defaults && !loading ? <Button variant="outlined" onClick={() => void loadDefaults()}>Try again</Button> : null}</div> : null}
      {loading ? <p role="status" className="text-sm text-ink-soft">Loading your organization and verified administrator details…</p> : null}
      {defaults ? <>
        <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
          <h2 className="font-bold">Organization</h2>
          {defaults.organization ? <p>{defaults.organization.name}</p> : <><p className="text-sm text-ink-soft">Name the organization that owns {facility?.name} and the new facility. You only need to do this once.</p><TextField label="Organization name" required disabled={busy || Boolean(pending)} error={form.formState.errors.organizationName?.message} {...form.register('organizationName')} /></>}
        </section>
        <FacilityDetailsFields value={values} disabled={busy || Boolean(pending)} errors={Object.fromEntries(Object.entries(form.formState.errors).map(([key, value]) => [key, value?.message]))} onChange={(patch) => {
          for (const [key, value] of Object.entries(patch)) form.setValue(key as keyof FacilityDetails, value, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
          if (patch.name !== undefined && !form.formState.dirtyFields.code) form.setValue('code', suggestCode(patch.name), { shouldValidate: form.formState.isSubmitted });
        }} />
        <section className="space-y-2 rounded-card border border-outline-soft bg-white p-4">
          <h2 className="font-bold">Your administrator account</h2><p className="font-semibold">{defaults.administrator.fullName}</p>
          {defaults.administrator.verifiedEmail ? <><p className="text-sm text-ink-soft">Verified recovery email: {defaults.administrator.verifiedEmail}</p><p className="text-sm text-ink-soft">Your identity, verified email and PIN on this device are reused. You receive a separate administrator membership at the new facility.</p></> : <p role="alert" className="text-sm text-danger-strong">Verify your recovery email in <Link className="underline" to="/admin">Administration</Link> before adding a facility.</p>}
        </section>
        <p className="text-sm text-ink-soft">The new facility starts with its own patient records, staff list and settings. Add its staff and services after creation.</p>
        {pending?.result ? <p role="status" className="rounded-field bg-brand-wash p-3 text-sm font-semibold text-brand">{pending.result.facility.name} has been created. Open it to finish its first synchronization.</p> : pending ? <p role="status" className="text-sm text-ink-soft">Your creation request is saved. Retry to confirm the same facility.</p> : null}
        {!online ? <p role="status" className="text-sm text-amber-text">Connect to the internet to create or first open a facility.</p> : null}
        <div className="flex flex-wrap gap-3"><Button type="submit" loading={busy} disabled={busy || !online || (!pending?.result && !defaults.administrator.verifiedEmail)}>{pending?.result ? 'Open new facility' : pending ? 'Retry creation' : 'Create facility'}</Button><Button variant="ghost" onClick={() => navigate('/home')} disabled={busy}>Back to facility</Button></div>
      </> : null}
    </form>
  </>;
};
