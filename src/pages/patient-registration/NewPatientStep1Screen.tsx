import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { VisitType, validCalendarDate, yearsBetween } from '@shared';
import { AppBar, Avatar, Button, ChoiceChip, SegmentedControl, SelectField, TextField } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { calendarDate } from '@/lib/calendarDate';
import { formatMoney } from '@/lib/money';
import { useLiveQuery } from '@/data';
import { listFeeItems } from '@/data/repos/billing';
import { listPatients, type PatientDetails } from '@/data/repos/patients';
import { recordExistingSelection } from '@/data/repos/patientIdentity';
import { useAuthorizationContext } from '@/session';
import { VISIT_TYPE_LABELS } from '@/features/billing/feeForm';
import {
  EMPTY_REGISTRATION, amountsDue, factsFromForm, newPatientFees, parseAge, toPatientDetails, useNextPatientNumber, useRegistrationDraft, useSavePatient, visitFor,
  type RegistrationNavState, type RegistrationValues,
} from '@/features/registration';
import { currentAge, findLikelyMatches, usePatients, type MatchReason } from '@/features/search';
import { RegistrationRecoveryGate, RegistrationRecoveryStatus } from '@/features/registration/RegistrationRecoveryPrompt';
import type { DuplicateNavState } from './DuplicateCheckScreen';

const todayIso = (): string => calendarDate();
const OCCUPATIONS = ['Trader', 'Farmer', 'Student', 'Civil servant', 'Artisan'];
const REASON_LABEL: Record<MatchReason, string> = { name: 'Name', phone: 'Phone', age: 'Age', sex: 'Sex', address: 'Address' };

type FormValues = Omit<RegistrationValues, 'identificationNote'>;

/** What has been typed so far, as matching input; undefined until there is a name to compare. */
const typedDetails = (values: FormValues): PatientDetails | undefined => {
  if (values.identityStatus === 'provisional' || values.fullName.trim().length < 3) return undefined;
  const age = parseAge(values.age);
  return {
    fullName: values.fullName.trim(),
    sex: values.sex === 'F' ? 'female' : values.sex === 'M' ? 'male' : undefined,
    ageYears: age !== undefined && Number.isInteger(age) && age >= 0 && age <= 130 ? age : undefined,
    ageObservedOn: todayIso(),
    dateOfBirth: values.dateOfBirth && validCalendarDate(values.dateOfBirth) ? values.dateOfBirth : undefined,
    phone: values.phone.trim() || undefined,
    address: values.address.trim() || undefined,
    occupation: undefined, religion: undefined, legacyPaperRef: undefined,
  };
};

/**
 * New patient (PRD §10) on one screen: the essential NASADOR fields first, the
 * rest under "More details". A likely existing record is offered while typing,
 * and the duplicate check still runs before anything is saved. A visit chosen
 * here is booked in the same save, with its fees shown before saving. Reused
 * for editing — opened with the patient's values and id from their profile.
 */
const RegistrationForm = ({ state }: { state: NonNullable<RegistrationNavState> }) => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const { values, keep, clear } = useRegistrationDraft(state);
  const editing = Boolean(state.patientId);
  const savePatient = useSavePatient();
  const nextNumber = useNextPatientNumber();
  const patients = usePatients();
  const fees = useLiveQuery(listFeeItems);
  const canBook = context.permissions.includes('appointment:create');
  const [visitChoice, setVisitChoice] = useState<VisitType | ''>(canBook ? 'general' : '');
  const [saveError, setSaveError] = useState('');
  const [opening, setOpening] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => editing || Boolean(values.occupation || values.religion || values.folder || values.nin || values.identityEvidence === 'document_seen'));

  const { control, register, handleSubmit, getValues, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ defaultValues: values });
  const live = watch();
  const provisional = live.identityStatus === 'provisional';
  const visitType = !editing && !provisional && canBook && visitChoice ? visitChoice : undefined;

  useEffect(() => {
    const subscription = watch((partial) => keep(partial));
    return () => subscription.unsubscribe();
  }, [watch, keep]);

  const typed = typedDetails(live);
  const matches = useMemo(() => (!editing && typed && patients.data ? findLikelyMatches(typed, patients.data).slice(0, 2) : []), [editing, JSON.stringify(typed), patients.data]);
  const lines = newPatientFees(fees.data ?? [], factsFromForm(live, visitType), Boolean(visitType));
  const due = amountsDue(lines);
  const ageUnknown = factsFromForm(live).ageYears === undefined;

  const openExisting = async (patientId: string) => {
    if (opening) return;
    setOpening(true); setSaveError('');
    try { await recordExistingSelection(patientId, context); await clear(); navigate('/patients/profile', { state: { patientId }, replace: true }); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not open the existing record. Try again.'); }
    finally { setOpening(false); }
  };

  const save = async (form: FormValues) => {
    setSaveError('');
    keep(form);
    const complete: RegistrationValues = { ...values, ...form };
    const visit = visitType ? visitFor(visitType) : undefined;
    try {
      if (provisional || editing) return await savePatient(complete, state.patientId);
      const found = findLikelyMatches(toPatientDetails(complete), await listPatients());
      if (found.length > 0) {
        const duplicate: DuplicateNavState = { matchIds: found.map((match) => match.patient.patientId), visit };
        return navigate('/patients/duplicate', { state: duplicate });
      }
      return await savePatient(complete, undefined, undefined, visit);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'The duplicate check could not be completed. Try again.'); }
  };
  const revealHidden = () => { if (errors.nin || errors.identityEvidenceNote) setMoreOpen(true); };

  // Age or date of birth: an elderly patient with no records still gets registered (PRD §10).
  const ageOrBirth = () => (provisional || getValues('age').trim() || getValues('dateOfBirth') ? true : 'Give an age or a date of birth');

  if (editing && values.identityStatus !== 'provisional' && (!values.fullName || !values.sex)) return <Navigate to="/patients/profile" state={{ patientId: state.patientId }} replace />;

  const submitLabel = provisional ? editing ? 'Save provisional details' : 'Create provisional record'
    : editing ? 'Save changes'
    : !visitType ? 'Register patient'
    : fees.loading ? 'Register & book visit'
    : due.length ? 'Register & send to cashier' : 'Register & send to nurse station';

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title={editing ? 'Edit patient' : 'New patient'}
        onBack={() => navigate(-1)}
        right={<div className="flex items-center gap-2"><SyncPill />{provisional ? <span className="font-mono text-[11px] text-ink-muted">Provisional registration</span> : null}</div>}
      />
      <form
        noValidate
        onSubmit={handleSubmit(save, revealHidden)}
        className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:my-8 lg:min-h-0 lg:flex-none lg:overflow-hidden lg:rounded-card lg:border lg:border-outline-soft lg:bg-white lg:shadow-card"
      >
        <div className="flex-1 space-y-4 px-5 py-3">
          <RegistrationRecoveryStatus />
          {!editing ? <div className="flex justify-end text-xs"><button type="button" onClick={() => { void clear().catch(() => {}); reset(EMPTY_REGISTRATION); }} className="min-h-11 font-bold text-brand">Clear form</button></div> : null}
          {!editing ? <Controller control={control} name="identityStatus" render={({ field }) => <label className="flex min-h-11 items-start gap-3 rounded-field border border-outline p-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={field.value === 'provisional'} onChange={(event) => field.onChange(event.target.checked ? 'provisional' : 'identified')} /><span className="font-semibold">Patient identity is not known<span className="mt-1 block font-normal text-ink-muted">Emergency registration. Record only what is known and add identity later.</span></span></label>} /> : null}
          {provisional ? <div className="space-y-3"><p className="text-sm text-ink-soft">A distinct temporary label and patient ID will be created. Leave unknown details blank; care can begin immediately.</p><TextField label="Reason for provisional registration" maxLength={500} hint="Why identity is unknown and any details that help distinguish this patient." error={errors.provisionalReason?.message} {...register('provisionalReason', { validate: (value) => !provisional || value.trim().length >= 3 || 'Explain why identity is not yet known' })} /></div> : <TextField
            label="Full name"
            placeholder="e.g. Amaka Okoro"
            autoComplete="off"
            error={errors.fullName?.message}
            {...register('fullName', { validate: (name) => provisional || Boolean(name.trim()) || 'Enter the patient’s name' })}
          />}

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="mb-1.5 text-[13px] font-semibold text-ink-soft">Sex</div>
              <Controller
                control={control}
                name="sex"
                rules={{ validate: (value) => provisional || Boolean(value) || 'Choose the patient’s sex' }}
                render={({ field }) => (
                  <SegmentedControl
                    ariaLabel="Sex"
                    value={field.value}
                    onChange={field.onChange}
                    options={[...(provisional ? [{ value: '' as const, label: 'Unknown' }] : []), { value: 'F', label: 'F' }, { value: 'M', label: 'M' }]}
                  />
                )}
              />
              {errors.sex ? <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors.sex.message}</p> : null}
            </div>
            <div className="w-24">
              <TextField
                label="Age"
                type="number"
                inputMode="numeric"
                placeholder="32"
                error={errors.age?.message}
                {...register('age', {
                  validate: {
                    ageOrBirth,
                    wholeYears: (age) => age.trim() === '' || (Number.isInteger(Number(age)) && Number(age) >= 0 && Number(age) <= 130) || '0–130 years',
                  },
                })}
              />
            </div>
          </div>

          {matches.length ? (
            <section aria-label="Possible existing record" className="space-y-3 rounded-card border-2 border-slate bg-slate-bg p-4 text-slate-text">
              <h2 className="font-extrabold">Is this the same person?</h2>
              {matches.map((match) => (
                <div key={match.patient.patientId} className="flex flex-wrap items-center gap-3">
                  <Avatar tone="green" size="sm">{match.patient.fullName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase()}</Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{match.patient.fullName}</div>
                    <div className="text-[13px]">{[match.patient.sex === 'female' ? 'F' : match.patient.sex === 'male' ? 'M' : 'Sex not recorded', currentAge(match.patient), match.patient.phone].filter((part) => part !== undefined && part !== '').join(' · ')}</div>
                    <div className="break-all font-mono text-xs">{match.patient.patientId} · matches on {match.reasons.map((reason) => REASON_LABEL[reason].toLowerCase()).join(', ')}</div>
                  </div>
                  <Button type="button" fullWidth={false} className="px-4" disabled={opening} loading={opening} onClick={() => void openExisting(match.patient.patientId)}>Yes — open this record</Button>
                </div>
              ))}
              <p className="text-xs">If not, carry on. You will be asked once more before anything is saved.</p>
            </section>
          ) : null}
          <TextField
            label="Date of birth"
            type="date"
            hint={provisional ? 'Leave blank when unknown' : 'Leave blank if only an estimated age is known'}
            max={todayIso()}
            error={errors.dateOfBirth?.message}
            {...register('dateOfBirth', {
              validate: (date) => !date || (validCalendarDate(date) && date <= todayIso() && (!getValues('age').trim() || yearsBetween(date, todayIso()) === Number(getValues('age')))) || 'Check the birth date and age; they must agree',
            })}
          />
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" {...register('dobEstimated')} />The date of birth is estimated</label>
          <p className="text-xs text-ink-muted">An age recorded without a birth date is treated as estimated.</p>
          <TextField label="Phone" type="tel" inputMode="tel" hint="Best way to find them again" placeholder="0803 555 0147" {...register('phone')} />
          <TextField
            label="Address"
            placeholder="e.g. 14 Odo-Ona Elewe, Ibadan"
            error={errors.address?.message}
            {...register('address', { validate: (address) => provisional || Boolean(address.trim()) || 'Enter where the patient lives' })}
          />


          {!provisional ? (
            <details open={moreOpen} onToggle={(event) => setMoreOpen(event.currentTarget.open)} className="rounded-field border border-outline-soft bg-white px-4">
              <summary className="flex min-h-[48px] cursor-pointer items-center text-sm font-bold text-brand">More details · occupation, religion, folder number, NIN</summary>
              <div className="space-y-4 pb-4">
                <div>
                  <TextField label="Occupation" placeholder="e.g. Trader" autoComplete="off" {...register('occupation')} />
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {OCCUPATIONS.map((o) => <ChoiceChip key={o} selected={live.occupation === o} onClick={() => setValue('occupation', live.occupation === o ? '' : o)}>{o}{live.occupation === o ? ' ✓' : ''}</ChoiceChip>)}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[13px] font-semibold text-ink-soft">Religion</div>
                  <Controller control={control} name="religion" render={({ field }) => (
                    <SegmentedControl ariaLabel="Religion" value={field.value} onChange={(religion) => field.onChange(field.value === religion ? '' : religion)} options={[{ value: 'christianity', label: 'Christianity' }, { value: 'islam', label: 'Islam' }, { value: 'other', label: 'Other' }]} />
                  )} />
                </div>
                <TextField label="Old folder / card number" hint="Optional — kept so nothing from the paper file is lost" placeholder="e.g. paper file 2023/1187" autoComplete="off" {...register('folder')} />
                <TextField label="NIN (optional)" inputMode="numeric" autoComplete="off" hint="11 digits. Registration does not require a NIN." error={errors.nin?.message} {...register('nin', { validate: (value) => !value.trim() || /^\d{11}$/.test(value.replace(/\s/g, '')) || 'Enter 11 digits or leave blank' })} />
                <label className="block text-sm font-semibold">Identity information
                  <select className="mt-2 w-full rounded-field border border-outline bg-white p-3" {...register('identityEvidence')}>
                    <option value="reported">Reported by patient / representative</option>
                    <option value="document_seen">Staff checked an identity document</option>
                  </select>
                </label>
                {live.identityEvidence === 'document_seen' ? <TextField label="Evidence checked" hint="Document type and what was checked. Do not copy the full identifier here." error={errors.identityEvidenceNote?.message} {...register('identityEvidenceNote', { validate: (value) => getValues('identityEvidence') !== 'document_seen' || Boolean(value.trim()) || 'Describe the evidence checked' })} /> : null}
                <p className="text-xs text-ink-muted">A checked document is a staff observation, not verification by an identity provider.</p>
              </div>
            </details>
          ) : null}

          {!editing && !provisional && canBook ? (
            <section aria-label="Visit today" className="space-y-3">
              <SelectField
                label="Visit today"
                value={visitChoice}
                onChange={(event) => setVisitChoice(event.target.value as VisitType | '')}
                options={[...VisitType.options.map((value) => ({ value, label: VISIT_TYPE_LABELS[value] })), { value: '', label: 'No visit today — register only' }]}
              />
              {fees.loading ? <p role="status" className="text-sm text-ink-muted">Reading fees…</p>
                : fees.error ? <p role="alert" className="text-sm text-amber-text">Fees could not be read. They are still applied when you save.</p>
                : lines.length ? (
                  <div className="rounded-field bg-surface-muted p-3 text-sm">
                    <table className="w-full">
                      <caption className="sr-only">Fees for this registration</caption>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line.feeId} className="border-b border-outline-soft last:border-0">
                            <td className="py-1.5 pr-3">{line.name}{line.exemptReason ? <span className="block text-xs text-ink-muted">Exempt · {line.exemptReason}</span> : null}</td>
                            <td className="whitespace-nowrap py-1.5 text-right font-mono">{line.exemptReason ? <><s className="text-ink-muted">{formatMoney(line.listPriceMinor, line.currency)}</s> {formatMoney(0, line.currency)}</> : formatMoney(line.amountMinor, line.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr><td className="pt-2 font-bold">To pay now</td><td className="pt-2 text-right font-mono font-bold">{due.length ? due.join(' + ') : 'Nothing'}</td></tr></tfoot>
                    </table>
                    {ageUnknown && lines.some((line) => !line.exemptReason) ? <p className="mt-2 text-xs text-ink-muted">Age-based exemptions apply once an age or birth date is entered.</p> : null}
                  </div>
                ) : visitType ? <p className="text-sm text-ink-muted">Nothing to pay for this visit. The patient goes straight to the nurse station.</p> : null}
            </section>
          ) : null}

          {/* Patient ID preview — only when creating; an existing patient keeps its ID. */}
          {!editing && !provisional && nextNumber ? (
            <div className="rounded-[14px] bg-brand-tint px-4 py-3.5">
              <div className="text-xs text-brand-strong">A Patient ID will be created</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-brand">{nextNumber}-<span className="opacity-50">••</span></div>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          {saveError ? <p role="alert" className="mb-3 text-sm text-danger">{saveError}</p> : null}
          <Button variant="primary" type="submit" disabled={isSubmitting} loading={isSubmitting}>{submitLabel}</Button>
          {visitType && !editing ? <p className="mt-2 text-xs text-ink-muted">Registers the patient and books a {VISIT_TYPE_LABELS[visitType].toLowerCase()} visit for now, in one save. Payment never blocks care.</p> : null}
        </footer>
      </form>
    </div>
  );
};

export const NewPatientStep1Screen = () => {
  const state = (useLocation().state as RegistrationNavState) ?? {};
  return <RegistrationRecoveryGate key={state.patientId ?? 'new'} draftKey={state.patientId ?? 'new'}><RegistrationForm key={state.patientId ?? 'new'} state={state} /></RegistrationRecoveryGate>;
};
