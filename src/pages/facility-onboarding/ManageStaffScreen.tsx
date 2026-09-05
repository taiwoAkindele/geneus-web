import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Avatar, Button, Card, Sheet, StatusPill, Tag, TextField, useToast } from '@/ui';
import { useWriteContext } from '@/data';
import { assignShift, removeStaff, today } from '@/data/repos/staff';
import { hasPin, useAuth, useSession, type RosterEntry } from '@/session';

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
  const { user } = useSession();
  const context = useWriteContext(user.staffId, user.canWrite);
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

export const ManageStaffScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { roster, loading } = useAuth();
  const { user } = useSession();
  const context = useWriteContext(user.staffId, user.canWrite);
  const [editing, setEditing] = useState<RosterEntry | null>(null);

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
            <StatusPill status="synced" />
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
    </div>
  );
};
