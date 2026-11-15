import { useState } from 'react';
import type { PinSetupCodeIssued, RosterShift, Staff } from '@shared';
import { Button, Sheet, SheetCancelButton, SegmentedControl, TextField, useToast } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import { assignShift, removeStaff, today } from '@/data/repos/staff';
import { issuePinSetupCode } from '@/lib/api/staff';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { useAuthorizationContext } from '@/session';
import { fullDayEnd, shiftWindow } from './shiftWindow';

/**
 * Actions on one staff member, used from their profile and from Settings →
 * Staff scheduling & coverage. The repositories check every permission again.
 */
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * A sign-in window: when a shift-based staff member may start a new PIN
 * sign-in. It is an access restriction, not a duty assignment or attendance
 * record, and it never signs anyone out. Planned duty belongs in Coverage.
 */
export const SignInWindowSheet = ({ staff, shift, day: startDay, onClose }: { staff: Staff; shift?: RosterShift; day?: string; onClose: () => void }) => {
  const toast = useToast();
  const context = useAuthorizationContext();
  const [day, setDay] = useState(shift ? calendarDate(shift.startsAt) : startDay ?? today());
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const effectiveEnd = shift?.extendedUntil ?? shift?.endsAt;
  const [start, setStart] = useState(shift ? timeLabel(shift.startsAt) : '08:00');
  const [end, setEnd] = useState(effectiveEnd ? timeLabel(effectiveEnd) : '16:00');
  const [endDay, setEndDay] = useState<'same' | 'next'>(effectiveEnd && calendarDate(effectiveEnd) !== day ? 'next' : 'same');
  const [saving, setSaving] = useState(false);
  const makeFullDay = () => {
    try { const result = fullDayEnd(day, start); setEdited(true); setEnd(result.end); setEndDay(result.endsNextDay ? 'next' : 'same'); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Choose a start time'); }
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const window = shiftWindow(day, start, end, endDay === 'next');
      await assignShift({ ...window, id: shift?.id, staffId: staff.staffId }, context);
      toast(`${staff.fullName} can sign in ${start}–${end}${endDay === 'next' ? ' next day' : ''}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the sign-in window');
    } finally { setSaving(false); }
  };
  return <Sheet onClose={onClose} eyebrow="Sign-in window" title={staff.fullName} closeDisabled={saving} hasUnsavedChanges={edited}>
    <p className="mb-3 text-sm text-ink-muted">Starts on {new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
    <fieldset disabled={saving} className="space-y-4">
      <TextField label="Date" type="date" value={day} onChange={(event) => { setDay(event.target.value); setEdited(true); }} />
      <div className="flex gap-3">
        <div className="flex-1"><TextField label="Sign-in from" name="shift_start" type="time" value={start} onChange={(event) => { setStart(event.target.value); setEdited(true); }} /></div>
        <div className="flex-1"><TextField label="Sign-in until" name="shift_end" type="time" value={end} onChange={(event) => { setEnd(event.target.value); setEdited(true); }} /></div>
      </div>
      <SegmentedControl ariaLabel="Window end day" value={endDay} onChange={(value) => { setEndDay(value); setEdited(true); }} options={[{ value: 'same', label: 'Same day' }, { value: 'next', label: 'Next day' }]} />
      <Button variant="outlined" onClick={makeFullDay}>Make it a 24-hour window</Button>
    </fieldset>
    <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">This window only controls when this shift-based staff member can sign in with their PIN. It does not sign them out when it ends, record attendance or assign work.</p>
    <p className="mt-2 text-xs leading-relaxed text-ink-muted">For access every day without windows, choose 24-hour access in Edit details &amp; access.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    <div className="mt-5 flex gap-2.5"><Button fullWidth={false} className="flex-1" loading={saving} disabled={saving} onClick={() => void save()}>Save sign-in window</Button><SheetCancelButton disabled={saving} /></div>
  </Sheet>;
};

/**
 * A one-time code that lets this person set or reset their PIN on any of the
 * facility's phones — so the admin need not be there. Issued by the server on
 * request (online only); shown once and never stored on this phone.
 */
export const PinCodeSheet = ({ staff, onClose }: { staff: Staff; onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [issued, setIssued] = useState<PinSetupCodeIssued>();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const first = staff.fullName.split(' ')[0];
  const create = async () => {
    if (creating) return;
    setCreating(true); setError(undefined);
    try { setIssued(await issuePinSetupCode(context, staff.staffId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create a code'); }
    finally { setCreating(false); }
  };
  return <Sheet onClose={onClose} closeDisabled={creating} eyebrow="PIN code" title={staff.fullName}>
    {issued ? <>
      <div className="rounded-card bg-brand-tint px-4 py-5 text-center font-mono text-[28px] font-extrabold tracking-[0.2em] text-brand">{issued.code}</div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
        Read this to {first}. On the sign-in screen they tap their name, choose &ldquo;I have a code from my admin&rdquo; and set a new PIN. It works once, until{' '}
        {new Date(issued.expiresOn).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}, and replaces any earlier code. Their phone needs to sync once before the code works there.
      </p>
    </> : <>
      <p className="text-[13px] leading-relaxed text-ink-muted">Creates a one-time code that lets {first} set or reset their PIN on this facility&rsquo;s phones, without you being there. Any earlier code stops working. Needs an internet connection.</p>
      {error ? <p className="mt-3 text-[13px] font-semibold text-danger">{error}</p> : null}
    </>}
    {issued ? <Button variant="outlined" className="mt-5" onClick={onClose}>Done</Button> : <div className="mt-5 space-y-3">
      <StaffVerification requireServerSession purpose="Issuing a PIN code">
        <div className="flex flex-wrap gap-2.5">
          <Button variant="primary" fullWidth={false} className="flex-1" loading={creating} onClick={create}>Create code</Button>
          <Button variant="outlined" fullWidth={false} className="px-6" onClick={onClose}>Cancel</Button>
        </div>
      </StaffVerification>
    </div>}
  </Sheet>;
};

/**
 * Ends this person's access at this facility only. Staff records belong to one
 * facility: their membership at any other facility, and their past records
 * here, are untouched. There is no organization-wide deactivation.
 */
export const RemoveAccessSheet = ({ staff, onClose, onRemoved }: { staff: Staff; onClose: () => void; onRemoved?: () => void }) => {
  const toast = useToast();
  const context = useAuthorizationContext();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try { await removeStaff(staff, context); toast('Access at this facility removed on this device; the change will sync to other devices'); onRemoved?.(); onClose(); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not remove access', { tone: 'error' }); }
    finally { setBusy(false); }
  };
  return <Sheet title={`Remove ${staff.fullName}'s access at this facility?`} closeDisabled={busy} onClose={onClose}>
    <p className="text-sm leading-relaxed text-ink-muted">They can no longer sign in here. Their past records stay intact. Access stops on this device now and on other devices once they receive the change.</p>
    <p className="mt-2 text-sm leading-relaxed text-ink-muted">This affects this facility only. If they also work at another facility in your organization, that access is managed there and does not change.</p>
    <div className="mt-5 space-y-2"><Button variant="outlined" disabled={busy} onClick={onClose}>Keep access</Button><Button variant="danger-outline" loading={busy} onClick={() => void remove()}>Remove access at this facility</Button></div>
  </Sheet>;
};
