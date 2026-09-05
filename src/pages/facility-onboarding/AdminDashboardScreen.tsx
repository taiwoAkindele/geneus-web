import { useNavigate } from 'react-router-dom';
import { Avatar, Stat, StatusPill, Tag } from '@/ui';
import { hasPin, useAuth, useSession, type RosterEntry } from '@/session';

/** A setup-checklist row: done = filled amber check, todo = amber ring. */
const ChecklistItem = ({ done, children }: { done?: boolean; children: string }) => (
  <div className="flex items-center gap-2.5 text-[13px] text-amber-text">
    {done ? (
      <span className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-amber text-[11px] font-extrabold text-white">
        ✓
      </span>
    ) : (
      <span className="h-[18px] w-[18px] flex-none rounded-full border-2 border-[#c9a24a]" />
    )}
    {children}
  </div>
);

const ActionTile = ({ label, primary, onClick }: { label: string; primary?: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-card p-4 text-left text-[15px] font-bold ${
      primary ? 'bg-brand text-white' : 'border border-outline-soft bg-white text-ink'
    }`}
  >
    {label}
  </button>
);

const onShiftNow = (entry: RosterEntry): boolean => {
  if (!entry.shift) return false;
  const now = Date.now();
  return (
    new Date(entry.shift.startsAt).getTime() <= now &&
    now < new Date(entry.shift.extendedUntil ?? entry.shift.endsAt).getTime()
  );
};

const ROLE_LABELS: Record<string, string> = {
  chew: 'CHEW',
  nurse: 'Nurse',
  doctor: 'Doctor',
  records_officer: 'Records',
  facility_admin: 'Facility Admin',
  supervisor: 'Supervisor',
};

const initialsOf = (fullName: string) =>
  fullName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

/**
 * 2.3 Admin dashboard — the facility admin's landing page, inside the same shell
 * as everything else. Every tile deep-links to the screen that performs the
 * action; nothing here is decorative.
 */
export const AdminDashboardScreen = () => {
  const navigate = useNavigate();
  const { facility } = useSession();
  const { roster } = useAuth();

  const onShift = roster.filter(onShiftNow);
  const awaitingPin = roster.filter((entry) => !hasPin(entry.staff.staffId));
  const rostered = roster.filter((entry) => entry.shift);

  const FacilityCode = () => (
    <div className="flex items-center justify-between rounded-[18px] bg-brand px-5 py-4 text-white">
      <div>
        <div className="text-xs text-brand-accent-soft">Your facility code</div>
        <div className="mt-0.5 font-mono text-[22px] font-semibold">{facility.code}</div>
      </div>
      <span className="rounded-full bg-white/15 px-2.5 py-1.5 text-[11px]">Every Patient ID starts with this</span>
    </div>
  );

  const Checklist = () => (
    <div className="rounded-card border border-amber-border bg-amber-bg p-4">
      <div className="text-sm font-bold text-amber-text">Finish setting up your facility</div>
      <div className="mt-3 space-y-2">
        <ChecklistItem done>Facility registered</ChecklistItem>
        <ChecklistItem done={roster.length > 1}>Invite your staff</ChecklistItem>
        <ChecklistItem done={awaitingPin.length === 0}>Everyone has set a PIN</ChecklistItem>
        <ChecklistItem done={rostered.length > 0}>Put staff on today&rsquo;s roster</ChecklistItem>
      </div>
    </div>
  );

  const Counts = ({ className = '' }: { className?: string }) => (
    <div className={className}>
      <Stat value={String(roster.length)} label="Staff" />
      <Stat value={String(awaitingPin.length)} label="Awaiting PIN" tone="amber" />
      <Stat value={String(onShift.length)} label="On shift now" />
    </div>
  );

  const StaffOnShift = () => (
    <div className="rounded-card border border-outline-soft bg-white p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-brand-strong">On shift now</div>
      {onShift.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-muted">
          Nobody is on shift. Put staff on today&rsquo;s roster from the Staff screen.
        </p>
      ) : (
        <div className="divide-y divide-outline-soft">
          {onShift.map((entry) => (
            <button
              key={entry.staff.staffId}
              type="button"
              onClick={() => navigate('/admin/staff/access', { state: { staffId: entry.staff.staffId } })}
              className="flex w-full items-center gap-3 py-3 text-left"
            >
              <Avatar tone="green" size="sm">
                {initialsOf(entry.staff.fullName)}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">{entry.staff.fullName}</div>
                <div className="text-xs text-ink-muted">
                  {ROLE_LABELS[entry.staff.role] ?? entry.staff.role} ·{' '}
                  {entry.staff.permission === 'read_write' ? 'Read & write' : 'Read only'}
                </div>
              </div>
              {entry.shift ? (
                <Tag tone="green">
                  {new Date(entry.shift.startsAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </Tag>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const Tiles = () => (
    <div className="grid grid-cols-2 gap-3">
      <ActionTile label="＋ Invite staff" primary onClick={() => navigate('/admin/staff/invite')} />
      <ActionTile label="Manage staff" onClick={() => navigate('/admin/staff')} />
      <ActionTile label="Roster & shifts" onClick={() => navigate('/admin/staff')} />
      <ActionTile label="Registers" onClick={() => navigate('/registers')} />
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto w-full max-w-md px-5 pb-24 pt-4 sm:max-w-none sm:px-7 sm:pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] text-ink-muted">Facility admin</div>
            <h1 className="text-[21px] font-extrabold tracking-[-0.02em] sm:text-2xl">{facility.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status="synced" />
            <Tag tone="amber">ADMIN</Tag>
          </div>
        </div>

        {/* Phone: one column. Tablet/desktop: the same blocks in a two-column grid. */}
        <div className="mt-4 space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
          <FacilityCode />
          <Counts className="flex items-center justify-around rounded-[18px] border border-outline-soft bg-white px-5 py-4" />
          <Checklist />
          <StaffOnShift />
          <div className="sm:col-span-2">
            <Tiles />
          </div>
        </div>
      </div>
    </div>
  );
};
