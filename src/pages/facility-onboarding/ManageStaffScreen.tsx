import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PinSetupCodeIssued } from '@shared';
import { AppBar, Avatar, Button, Card, Sheet, Tag, TextField, useToast } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { assignShift, removeStaff, today } from '@/data/repos/staff';
import { issuePinSetupCode } from '@/lib/api/staff';
import { hasPin, useAuth, useAuthorizationContext, useSession, type RosterEntry } from '@/session';

const ROLE_LABELS: Record<string, string> = {
  chew: 'CHEW',
  nurse: 'Nurse',
  doctor: 'Doctor',
  records_officer: 'Records',
  facility_admin: 'Facility Admin',
  supervisor: 'Supervisor',
};

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const onShiftNow = (entry: RosterEntry): boolean => {
  if (!entry.shift) return false;
  const now = Date.now();
  return new Date(entry.shift.startsAt).getTime() <= now && now < new Date(entry.shift.extendedUntil ?? entry.shift.endsAt).getTime();
};

/** Turns "14:30" on today's date into an instant. */
const atToday = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  const when = new Date();
  when.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return when.toISOString();
};

const ShiftSheet = ({ entry, onClose }: { entry: RosterEntry; onClose: () => void }) => {
  const toast = useToast();
  const context = useAuthorizationContext();
  const [start, setStart] = useState(entry.shift ? timeLabel(entry.shift.startsAt) : '08:00');
  const [end, setEnd] = useState(entry.shift ? timeLabel(entry.shift.endsAt) : '16:00');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (atToday(end) <= atToday(start)) {
      toast('The shift must end after it starts');
      return;
    }
    setSaving(true);
    try {
      await assignShift(
        { staffId: entry.staff.staffId, day: today(), startsAt: atToday(start), endsAt: atToday(end) },
        context,
      );
      toast(`${entry.staff.fullName} is rostered ${start}–${end} today`);
      onClose();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not save the shift');
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} eyebrow="Today's shift" title={entry.staff.fullName}>
      <div className="flex gap-3">
        <div className="flex-1">
          <TextField label="Starts" name="shift_start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="flex-1">
          <TextField label="Ends" name="shift_end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
        They can only sign in inside this window, and are signed out automatically when it ends.
      </p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button variant="primary" fullWidth={false} className="flex-1" loading={saving} onClick={save}>
          Save shift
        </Button>
        <Button variant="outlined" fullWidth={false} className="px-6" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
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
    <Sheet onClose={onClose} eyebrow="PIN code" title={entry.staff.fullName}>
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
  const navigate = useNavigate();
  const toast = useToast();
  const { roster, loading } = useAuth();
  const { user } = useSession();
  const context = useAuthorizationContext();
  const [editing, setEditing] = useState<RosterEntry | null>(null);
  const [issuingFor, setIssuingFor] = useState<RosterEntry | null>(null);

  const onShift = roster.filter(onShiftNow);
  const others = roster.filter((entry) => !onShiftNow(entry));

  const remove = async (entry: RosterEntry) => {
    try {
      await removeStaff(entry.staff, context);
      toast(`${entry.staff.fullName} can no longer sign in — their records stay intact`);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not remove that staff member');
    }
  };

  const row = (entry: RosterEntry) => (
    <div key={entry.staff.staffId} className="flex items-center gap-3 px-4 py-3.5">
      <Avatar tone={onShiftNow(entry) ? 'green' : 'muted'} size="sm">
        {entry.staff.fullName
          .split(' ')
          .slice(0, 2)
          .map((part) => part[0])
          .join('')}
      </Avatar>
      <button
        type="button"
        onClick={() => navigate('/admin/staff/access', { state: { staffId: entry.staff.staffId } })}
        className="min-w-0 flex-1 text-left"
      >
        <div className="text-[15px] font-bold">{entry.staff.fullName}</div>
        <div className="text-xs text-ink-muted">
          {ROLE_LABELS[entry.staff.role] ?? entry.staff.role}
          {entry.staff.permission === 'read_only' ? ' · Read only' : ''}
          {hasPin(entry.staff.staffId) ? '' : ' · PIN not set'}
        </div>
      </button>
      {entry.shift ? (
        <Tag tone={onShiftNow(entry) ? 'green' : 'amber'}>
          {timeLabel(entry.shift.startsAt)}–{timeLabel(entry.shift.endsAt)}
        </Tag>
      ) : (
        <Tag tone="amber">No shift</Tag>
      )}
      <button
        type="button"
        onClick={() => setEditing(entry)}
        className="min-h-0 flex-none rounded-lg bg-brand-tint px-2.5 py-1.5 text-[12px] font-bold text-brand"
      >
        Shift
      </button>
      {entry.staff.staffId === user.staffId ? null : (
        <button
          type="button"
          onClick={() => setIssuingFor(entry)}
          className="min-h-0 flex-none rounded-lg bg-brand-tint px-2.5 py-1.5 text-[12px] font-bold text-brand"
        >
          PIN code
        </button>
      )}
      {entry.staff.staffId === user.staffId ? null : (
        <button
          type="button"
          onClick={() => remove(entry)}
          className="min-h-0 flex-none text-[12px] font-bold text-danger"
        >
          Remove
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      <AppBar
        title="Staff"
        onBack={() => navigate(-1)}
        right={
          <div className="flex items-center gap-2">
            <SyncPill />
            <button
              type="button"
              onClick={() => navigate('/admin/staff/invite')}
              className="min-h-0 rounded-full bg-brand-tint px-3 py-1.5 text-[13px] font-bold text-brand"
            >
              ＋ Invite
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-md space-y-4 px-5 py-3 pb-24 md:max-w-2xl">
        {loading ? <div className="h-24 animate-pulse rounded-card bg-surface-muted" /> : null}

        {onShift.length > 0 ? (
          <>
            <div className="text-xs font-bold uppercase tracking-[0.06em] text-brand-strong">
              On shift now · {onShift.length}
            </div>
            <Card padded={false} className="divide-y divide-outline-soft">
              {onShift.map(row)}
            </Card>
          </>
        ) : null}

        {others.length > 0 ? (
          <>
            <div className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Off shift &amp; pending</div>
            <Card padded={false} className="divide-y divide-outline-soft">
              {others.map(row)}
            </Card>
          </>
        ) : null}

        {!loading && roster.length === 0 ? (
          <div className="rounded-card border border-dashed border-outline p-10 text-center">
            <div className="text-[15px] font-bold text-ink-soft">No staff yet</div>
            <div className="mt-1.5 text-[13px] text-ink-muted">Invite the first member of staff to this facility.</div>
          </div>
        ) : null}

        <p className="text-xs leading-relaxed text-ink-muted">
          Removing revokes access immediately, on every device — their past records stay intact.
        </p>
      </div>

      {editing ? <ShiftSheet entry={editing} onClose={() => setEditing(null)} /> : null}
      {issuingFor ? (
        <PinCodeSheet entry={issuingFor} issuedBy={user.staffId} onClose={() => setIssuingFor(null)} />
      ) : null}
    </div>
  );
};
