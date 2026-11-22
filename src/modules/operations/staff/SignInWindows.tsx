import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { RosterShift, Staff } from '@shared';
import { Button, DataTable, SelectField, Sheet, TextField } from '@/ui';
import { useLiveQuery } from '@/data';
import { calendarDate } from '@/lib/calendarDate';
import { listShifts, today } from '@/data/repos/staff';
import { accessFor } from '@/session/accessPolicy';
import { useAuth, useAuthorizationContext } from '@/session';
import { SignInWindowSheet } from './StaffActions';

/**
 * Settings → Staff scheduling & coverage → Sign-in windows: every shift-based
 * staff member's sign-in windows for a day. The same records are shown and
 * edited on each person's profile. Planned sign-in, not attendance.
 */
export const SignInWindows = () => {
  const context = useAuthorizationContext();
  const { roster, loading, error, reload } = useAuth();
  const shifts = useLiveQuery(listShifts);
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<{ staff: Staff; shift?: RosterShift }>();
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState('');
  const canAssign = context.permissions.includes('roster:assign');
  const planned = (shifts.data ?? []).filter((shift) => calendarDate(shift.startsAt) === day);

  const person = (staffId: string) =>
    roster.find((entry) => entry.staff.staffId === staffId)?.staff;

  const shiftBased = roster
    .filter((entry) => accessFor(entry.staff) === 'shift')
    .sort((a, b) => a.staff.fullName.localeCompare(b.staff.fullName));

  const renderWindows = () => {
    if (loading || shifts.loading) {
      return <p role="status">Reading sign-in windows…</p>;
    }

    if (error || shifts.error) {
      return (
        <div role="alert">
          Sign-in windows could not be read.
          <Button
            variant="ghost"
            onClick={() => {
              reload();
              shifts.reload();
            }}
          >
            Try again
          </Button>
        </div>
      );
    }

    if (!planned.length) {
      return (
        <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm">
          No sign-in windows start on this date.
        </p>
      );
    }

    return (
      <DataTable
        caption="Sign-in windows"
        rows={planned}
        rowKey={(shift) => shift.id}
        columns={[
          {
            key: 'staff',
            label: 'Staff member',
            render: (shift) => (
              <Link
                className="font-bold text-brand"
                to={`/admin/staff/${encodeURIComponent(shift.staffId)}?view=work`}
              >
                {person(shift.staffId)?.fullName ?? shift.staffId}
              </Link>
            ),
          },
          {
            key: 'start',
            label: 'Sign-in from',
            render: (shift) => new Date(shift.startsAt).toLocaleString('en-GB'),
          },
          {
            key: 'end',
            label: 'Sign-in until',
            render: (shift) =>
              new Date(shift.extendedUntil ?? shift.endsAt).toLocaleString('en-GB'),
          },
          {
            key: 'action',
            label: 'Action',
            render: (shift) => {
              const staff = person(shift.staffId);

              return staff && canAssign ? (
                <Button
                  fullWidth={false}
                  variant="outlined"
                  onClick={() => setEditing({ staff, shift })}
                >
                  Edit window
                </Button>
              ) : null;
            },
          },
        ]}
      />
    );
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xs flex-1">
          <TextField
            label="Windows starting on"
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>
        {canAssign ? (
          <Button
            fullWidth={false}
            disabled={!shiftBased.length}
            onClick={() => {
              setChosen('');
              setChoosing(true);
            }}
          >
            Add sign-in window
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-ink-muted">
        A sign-in window only controls when a shift-based staff member can sign in with their PIN.
        It does not sign anyone out, record attendance or assign work; plan duty under Coverage.
        Staff with 24-hour or admin access need no windows.
      </p>
      {renderWindows()}
      {choosing ? (
        <Sheet
          title="Add sign-in window"
          eyebrow="Choose a staff member"
          onClose={() => setChoosing(false)}
        >
          <SelectField
            label="Shift-based staff member"
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
            options={[
              { value: '', label: 'Choose staff' },
              ...shiftBased.map((entry) => ({
                value: entry.staff.staffId,
                label: entry.staff.fullName,
              })),
            ]}
          />
          <div className="mt-5">
            <Button
              disabled={!chosen}
              onClick={() => {
                const staff = person(chosen);
                setChoosing(false);

                if (staff) {
                  setEditing({ staff });
                }
              }}
            >
              Continue
            </Button>
          </div>
        </Sheet>
      ) : null}
      {editing ? (
        <SignInWindowSheet
          staff={editing.staff}
          shift={editing.shift}
          day={day}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </section>
  );
};
