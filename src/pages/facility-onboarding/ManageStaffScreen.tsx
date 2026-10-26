import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { mayApprovePin, type PinSetupCodeIssued } from '@shared';
import { ActionMenu, Button, DataTable, Sheet, SheetCancelButton, Tag, TextField, SectionTabs, SegmentedControl, useToast } from '@/ui';
import { useLiveQuery } from '@/data';
import { accessFor, accessLabel } from '@/session/accessPolicy';
import { shiftRangeLabel } from '@/session/shiftLabels';
import { calendarDate } from '@/lib/calendarDate';
import { fullDayEnd, shiftWindow } from '@/features/staff/shiftWindow';
import { roleLabel } from '@/features/staff/staffAccess';
import { assignShift, listShifts, removeStaff, today } from '@/data/repos/staff';
import { issuePinSetupCode } from '@/lib/api/staff';
import { hasPin, useAuth, useAuthorizationContext, useSession, type RosterEntry } from '@/session';

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const onShiftNow = (entry: RosterEntry): boolean => {
  if (!entry.shift) return false;
  const now = Date.now();
  return new Date(entry.shift.startsAt).getTime() <= now && now < new Date(entry.shift.extendedUntil ?? entry.shift.endsAt).getTime();
};

const ShiftSheet = ({ entry, onClose }: { entry: RosterEntry; onClose: () => void }) => {
  const toast = useToast();
  const context = useAuthorizationContext();
  const [day, setDay] = useState(entry.shift ? calendarDate(entry.shift.startsAt) : today());
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const effectiveEnd = entry.shift?.extendedUntil ?? entry.shift?.endsAt;
  const [start, setStart] = useState(entry.shift ? timeLabel(entry.shift.startsAt) : '08:00');
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
      await assignShift({ ...window, id: entry.shift?.id, staffId: entry.staff.staffId }, context);
      toast(`${entry.staff.fullName} is rostered ${start}–${end}${endDay === 'next' ? ' next day' : ''}`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the shift');
    } finally { setSaving(false); }
  };
  return <Sheet onClose={onClose} eyebrow="Roster window" title={entry.staff.fullName} closeDisabled={saving} hasUnsavedChanges={edited}>
    <p className="mb-3 text-sm text-ink-muted">Starts on {new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
    <fieldset disabled={saving} className="space-y-4">
      <TextField label="Shift date" type="date" value={day} onChange={(event) => { setDay(event.target.value); setEdited(true); }} />
      <div className="flex gap-3">
        <div className="flex-1"><TextField label="Starts" name="shift_start" type="time" value={start} onChange={(event) => { setStart(event.target.value); setEdited(true); }} /></div>
        <div className="flex-1"><TextField label="Ends" name="shift_end" type="time" value={end} onChange={(event) => { setEnd(event.target.value); setEdited(true); }} /></div>
      </div>
      <SegmentedControl ariaLabel="Shift end day" value={endDay} onChange={(value) => { setEndDay(value); setEdited(true); }} options={[{ value: 'same', label: 'Same day' }, { value: 'next', label: 'Next day' }]} />
      <Button variant="outlined" onClick={makeFullDay}>Make a 24-hour shift</Button>
    </fieldset>
    <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">This window controls new sign-ins for shift-based staff. Their session stays open when it ends; signing out is manual.</p>
    <p className="mt-2 text-xs leading-relaxed text-ink-muted">For access every day without a roster, choose 24-hour access in Edit staff.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    <div className="mt-5 flex gap-2.5"><Button fullWidth={false} className="flex-1" loading={saving} disabled={saving} onClick={() => void save()}>Save shift</Button><SheetCancelButton disabled={saving} /></div>
  </Sheet>;
};

/**
 * A one-time code that lets this person set or reset their PIN on any of the
 * facility's phones — so the admin need not be there. Issued by the server on
 * request (online only); shown once and never stored on this phone.
 */
const PinCodeSheet = ({ entry, issuedBy, onClose }: { entry: RosterEntry; issuedBy: string; onClose: () => void }) => {
  const [issued, setIssued] = useState<PinSetupCodeIssued>();
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(undefined);
    try {
      setIssued(await issuePinSetupCode(entry.staff.staffId, issuedBy));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a code');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet onClose={onClose} closeDisabled={creating} eyebrow="PIN code" title={entry.staff.fullName}>
      {issued ? (
        <>
          <div className="rounded-card bg-brand-tint px-4 py-5 text-center font-mono text-[28px] font-extrabold tracking-[0.2em] text-brand">
            {issued.code}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
            Read this to {entry.staff.fullName.split(' ')[0]}. On the sign-in screen they tap their name, choose
            &ldquo;I have a code from my admin&rdquo; and set a new PIN. It works once, until{' '}
            {new Date(issued.expiresOn).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
            , and replaces any earlier code. Their phone needs to sync once before the code works there.
          </p>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Creates a one-time code that lets {entry.staff.fullName.split(' ')[0]} set or reset their PIN on this
            facility&rsquo;s phones, without you being there. Any earlier code stops working. Needs an internet
            connection.
          </p>
          {error ? <p className="mt-3 text-[13px] font-semibold text-danger">{error}</p> : null}
        </>
      )}
      <div className="mt-5 flex flex-wrap gap-2.5">
        {issued ? null : (
          <Button variant="primary" fullWidth={false} className="flex-1" loading={creating} onClick={create}>
            Create code
          </Button>
        )}
        <Button variant="outlined" fullWidth={Boolean(issued)} className={issued ? '' : 'px-6'} onClick={onClose}>
          {issued ? 'Done' : 'Cancel'}
        </Button>
      </div>
    </Sheet>
  );
};

export const ManageStaffScreen = () => {
  useEffect(() => { document.title = 'Staff & roster - Geneus Health'; }, []);
  const [params, setParams] = useSearchParams();
  const rosterView = params.get('view') === 'roster';
  const [search, setSearch] = useState('');
  const [rosterDay, setRosterDay] = useState(today);
  const shifts = useLiveQuery(listShifts);
  const planned = (shifts.data ?? []).filter((shift) => calendarDate(shift.startsAt) === rosterDay);

  const navigate = useNavigate();
  const toast = useToast();
  const { roster, loading, error, reload } = useAuth();
  const { user } = useSession();
  const context = useAuthorizationContext();
  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const [issuingFor, setIssuingFor] = useState<RosterEntry | null>(null);
  const [removing, setRemoving] = useState<RosterEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const actor = roster.find((entry) => entry.staff.staffId === user.staffId);
  const canManage = context.permissions.includes('staff:manage');
  const canEdit = canManage || context.permissions.includes('staff:permission');
  const shown = roster.filter((entry) => (entry.staff.fullName + ' ' + roleLabel(entry.staff)).toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.staff.fullName.localeCompare(b.staff.fullName));
  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    try { await removeStaff(removing.staff, context); toast('Access removed on this device; the change will sync to other devices'); setRemoving(null); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not remove access', { tone: 'error' }); }
    finally { setBusy(false); }
  };
  const access = (entry: RosterEntry) => navigate('/admin/staff/access?staff=' + encodeURIComponent(entry.staff.staffId));
  const shift = (entry: RosterEntry) => accessFor(entry.staff) !== 'shift' ? accessLabel(accessFor(entry.staff)) : entry.shift ? shiftRangeLabel(entry.shift) : 'No shift today';
  const actions = (entry: RosterEntry) => {
    const secondary = [
      ...(context.permissions.includes('roster:assign') ? [{ label: 'Edit shift', icon: 'clock' as const, onSelect: () => setEditing(entry) }] : []),
      ...(canManage && actor && mayApprovePin(actor.staff, entry.staff) && entry.staff.staffId !== user.staffId ? [{ label: 'Issue PIN setup code', icon: 'lock' as const, onSelect: () => setIssuingFor(entry) }] : []),
      ...(context.permissions.includes('staff:deactivate') && entry.staff.staffId !== user.staffId ? [{ label: 'Remove access', onSelect: () => setRemoving(entry) }] : []),
    ];
    return <div className="flex items-center gap-2">{canEdit ? <Button variant="outlined" fullWidth={false} className="px-3 py-2" aria-label={'Edit staff ' + entry.staff.fullName} onClick={() => access(entry)}>Edit staff</Button> : null}{secondary.length ? <ActionMenu compact label={'Staff actions for ' + entry.staff.fullName} title={entry.staff.fullName} actions={secondary} /> : null}</div>;
  };
  const list = (entries: RosterEntry[], caption: string) => <>
    <div className="space-y-2 lg:hidden">{entries.map((entry) => <article key={entry.staff.staffId} className="rounded-card border border-outline-soft bg-white p-4"><button type="button" onClick={() => access(entry)} className="min-h-[44px] w-full text-left"><div className="text-[16px] font-bold">{entry.staff.fullName}</div><div className="mt-1 text-[13px] text-ink-muted">{roleLabel(entry.staff)} · {entry.staff.permission === 'read_only' ? 'Read only' : 'Read & write'}</div></button><div className="my-3 flex flex-wrap gap-2"><Tag tone={onShiftNow(entry) || accessFor(entry.staff) !== 'shift' ? 'green' : 'amber'}>{shift(entry)}</Tag><Tag tone={hasPin(entry.staff.staffId) ? 'green' : 'neutral'}>{hasPin(entry.staff.staffId) ? 'PIN ready here' : 'PIN not set here'}</Tag></div>{actions(entry)}</article>)}</div>
    <div className="hidden lg:block"><DataTable caption={caption} rows={entries} rowKey={(row) => row.staff.staffId} columns={[
      { key: 'name', label: 'Staff member', sortValue: (row) => row.staff.fullName, render: (row) => <button type="button" className="min-h-0 py-1 text-left font-bold text-brand hover:underline" onClick={() => access(row)}>{row.staff.fullName}</button> },
      { key: 'role', label: 'Roles', sortValue: (row) => roleLabel(row.staff), render: (row) => roleLabel(row.staff) },
      { key: 'shift', label: "Sign-in access / roster", render: shift },
      { key: 'pin', label: 'PIN on this device', render: (row) => hasPin(row.staff.staffId) ? 'Ready' : 'Not set here' },
      { key: 'access', label: 'Access', render: (row) => row.staff.permission === 'read_only' ? 'Read only' : 'Read & write' },
      { key: 'actions', label: 'Actions', render: actions },
    ]} /></div>
  </>;
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto w-full max-w-md space-y-4 px-5 py-3 md:max-w-2xl lg:max-w-none lg:px-8">
        <div className="flex items-center justify-between gap-3"><h1 className="text-[24px] font-extrabold">Staff &amp; roster</h1>{canManage && context.permissions.includes('staff:permission') ? <Button fullWidth={false} onClick={() => navigate('/admin/staff/invite')}>＋ Add staff</Button> : null}</div>
        <SectionTabs label="Staff sections" value={rosterView ? 'roster' : 'directory'} onChange={(view) => setParams({ view })} options={[{ value: 'directory', label: 'Staff directory' }, { value: 'roster', label: 'Duty roster' }]} />
        {!rosterView ? <TextField label="Find staff by name or role" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /> : null}
        {loading ? <div role="status" className="h-24 animate-pulse rounded-card bg-surface-muted" aria-label="Loading staff" /> : error ? <div role="alert">Staff could not be read from this device.<Button variant="ghost" onClick={reload}>Try again</Button></div> : <>
          {rosterView ? <section className="space-y-4"><div className="max-w-xs"><TextField label="Shifts starting on" type="date" value={rosterDay} onChange={(event) => setRosterDay(event.target.value)} /></div><p className="text-sm text-ink-muted">Planned sign-in windows, not attendance. Staff with 24-hour access do not require a roster.</p>{shifts.loading ? <p role="status">Reading roster...</p> : shifts.error ? <div role="alert">The roster could not be read.<Button variant="ghost" onClick={shifts.reload}>Try again</Button></div> : !planned.length ? <div className="rounded-card border border-dashed border-outline bg-white p-5 text-sm"><p className="font-bold">No shifts start on this date.</p><p className="mt-2 text-ink-muted">To assign a window for shift-based staff, open their actions in the staff directory. Staff with 24-hour access can sign in without a shift.</p><Button fullWidth={false} variant="outlined" className="mt-3" onClick={() => setParams({ view: 'directory' })}>Open staff directory</Button></div> : <DataTable caption="Planned shifts" rows={planned} rowKey={(shift) => shift.id} columns={[
            { key: 'staff', label: 'Staff member', render: (shift) => roster.find((entry) => entry.staff.staffId === shift.staffId)?.staff.fullName ?? shift.staffId },
            { key: 'start', label: 'Starts', render: (shift) => new Date(shift.startsAt).toLocaleString('en-GB') },
            { key: 'end', label: 'Ends', render: (shift) => new Date(shift.extendedUntil ?? shift.endsAt).toLocaleString('en-GB') },
            { key: 'action', label: 'Action', render: (shift) => { const person = roster.find((entry) => entry.staff.staffId === shift.staffId); return person && context.permissions.includes('roster:assign') ? <Button fullWidth={false} variant="outlined" onClick={() => setEditing({ staff: person.staff, shift })}>Edit shift</Button> : null; } },
          ]} />}</section> : shown.length ? list(shown, 'Staff directory') : <p className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-muted">No staff match this search.</p>}
          {!roster.length ? <p className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-muted">No staff yet. Add the first staff member above.</p> : null}
        </>}
        <p className="text-xs leading-relaxed text-ink-muted">PIN setup is specific to this device. Access changes reach other devices when they sync; existing records are kept.</p>
      </div>
      {editing ? <ShiftSheet entry={editing} onClose={() => setEditing(null)} /> : null}
      {issuingFor ? <PinCodeSheet entry={issuingFor} issuedBy={user.staffId} onClose={() => setIssuingFor(null)} /> : null}
      {removing ? <Sheet title={`Remove access for ${removing.staff.fullName}?`} closeDisabled={busy} onClose={() => setRemoving(null)}><p className="text-sm leading-relaxed text-ink-muted">Their past records stay intact. Access stops on this device now and on other devices once they receive the change.</p><div className="mt-5 space-y-2"><Button variant="outlined" disabled={busy} onClick={() => setRemoving(null)}>Keep access</Button><Button variant="danger-outline" loading={busy} onClick={() => void remove()}>Remove access</Button></div></Sheet> : null}
    </div>
  );
};
