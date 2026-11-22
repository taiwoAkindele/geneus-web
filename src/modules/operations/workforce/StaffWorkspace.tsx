import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  currentFacilityRevisions,
  mayApprovePin,
  withReviewerAuthority,
  type AnyDocument,
  type RosterShift,
} from '@shared';
import { ActionMenu, Button, SectionTabs, Tag } from '@/ui';
import { useAuth, useAuthorizationContext, useSession } from '@/session';
import { accessFor, accessLabel } from '@/session/accessPolicy';
import { shiftRangeLabel } from '@/session/shiftLabels';
import {
  PinCodeSheet,
  RemoveAccessSheet,
  SignInWindowSheet,
  ContactActivationSection,
  roleLabel,
} from '@/modules/operations/staff';
import { OutgoingStaffRequest } from '@/modules/administration/screens/facilities/StaffFacilityAssignments';
import { schedulingPlanner } from '@/app/settings/settingsTabs';
import { ownProof } from '@/data/repos/workforce';
import { showInterval } from '@/lib/workforceTime';
import { RecordEditor } from './RecordEditor';
import type { EditorKind } from './editorFields';
import { RecordList, WorkspaceLoading } from './Workspaces';
import { useWorkforce } from './useWorkforce';
import { humanize } from './presentation';
import { PrivateEvidence } from './PrivateEvidence';

type Sheet = { kind: 'window'; shift?: RosterShift } | { kind: 'pin' } | { kind: 'remove' };
const panel = 'rounded-card border border-outline-soft bg-white p-5';

/**
 * One staff member: everything about them and every action on them, as far as
 * the viewer's permissions allow. Their sign-in windows and service sessions
 * are the same records planned facility-wide in Settings → Staff scheduling &
 * coverage. Access here is this facility's only.
 */
export const StaffWorkspace = () => {
  const { roster } = useAuth();
  const { user } = useSession();
  const [sheet, setSheet] = useState<Sheet>();
  const { staffId } = useParams();
  const query = useWorkforce();
  const context = useAuthorizationContext();
  const [params, setParams] = useSearchParams();

  const [editing, setEditing] = useState<{
    kind: EditorKind;
    previous?: AnyDocument;
  }>();

  const [canReview, setCanReview] = useState(false);
  const [verifiedSnapshotId, setVerifiedSnapshotId] = useState('');
  useEffect(() => {
    document.title = 'Staff profile · Geneus Health';
  }, []);

  useEffect(() => {
    let alive = true;

    if (query.data) {
      const worker = query.data.staff.find((s) => s.staffId === context.userId);

      if (worker) {
        void ownProof(context, query.data).then((proof) => {
          if (alive) {
            setCanReview(
              withReviewerAuthority(context, worker, proof, Date.now()).permissions.includes(
                'clinical_capability:review',
              ),
            );
          }
        });
      }
    }

    return () => {
      alive = false;
    };
  }, [query.data, context]);

  useEffect(() => {
    let alive = true;
    setVerifiedSnapshotId('');

    if (query.data && staffId) {
      void ownProof({ ...context, userId: staffId }, query.data).then((proof) => {
        if (alive) {
          setVerifiedSnapshotId(proof?.snapshot.id || '');
        }
      });
    }

    return () => {
      alive = false;
    };
  }, [query.data, staffId, context.lastServerContactOn]);

  if (query.loading || !query.data || query.error) {
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  }

  const data = query.data;
  const staff = data.staff.find((s) => s.staffId === staffId);
  const view = params.get('view') || 'profile';

  if (!staff) {
    return (
      <div className="p-5">
        <p>This staff identity is not available on this device.</p>
        <Link to="/admin/staff" className="text-brand underline">
          Return to Staff
        </Link>
      </div>
    );
  }

  const profile = data.profiles.find((p) => p.staffId === staff.staffId);
  const proof = data.snapshots.find((p) => p.staffId === staff.staffId);

  const assignments = currentFacilityRevisions(data.assignments).filter(
    (a) => a.staffId === staff.staffId,
  );

  const zone = data.facility?.timeZone || 'Africa/Lagos';
  const can = (permission: string) => context.permissions.includes(permission as never);
  const self = staff.staffId === context.userId;
  const actor = roster.find((entry) => entry.staff.staffId === user.staffId);
  const access = accessFor(staff);

  const windows = data.roster
    .filter(
      (s) => s.staffId === staff.staffId && Date.parse(s.extendedUntil ?? s.endsAt) > Date.now(),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, 14);

  const more = [
    ...(can('roster:assign') && staff.active && access === 'shift'
      ? [
          {
            label: 'Add sign-in window',
            icon: 'clock' as const,
            onSelect: () => setSheet({ kind: 'window' }),
          },
        ]
      : []),
    ...(can('staff:manage') && staff.active && !self && actor && mayApprovePin(actor.staff, staff)
      ? [
          {
            label: 'Issue PIN setup code',
            icon: 'lock' as const,
            onSelect: () => setSheet({ kind: 'pin' }),
          },
        ]
      : []),
    ...(can('staff:deactivate') && staff.active && !self
      ? [{ label: 'Remove access at this facility', onSelect: () => setSheet({ kind: 'remove' }) }]
      : []),
  ];

  const closeSheet = () => {
    setSheet(undefined);
    query.reload();
  };

  const signInAccess = (
    <section className={panel}>
      <h2 className="font-bold">Sign-in access</h2>
      <p className="my-2 text-sm">
        {accessLabel(access)}.{' '}
        {access === 'shift'
          ? 'They can start a PIN sign-in only during a sign-in window. A window does not sign them out, record attendance or assign work.'
          : 'They can sign in at any time; no sign-in windows are needed.'}
      </p>
      {access === 'shift' ? (
        <>
          {windows.length ? (
            <ul className="mt-3 space-y-2">
              {windows.map((w) => (
                <li
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-outline-soft p-3 text-sm"
                >
                  <span>
                    {new Date(w.startsAt).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                    })}{' '}
                    · {shiftRangeLabel(w)}
                  </span>
                  {can('roster:assign') && staff.active ? (
                    <Button
                      fullWidth={false}
                      variant="outlined"
                      className="px-3 py-2 text-sm"
                      onClick={() => setSheet({ kind: 'window', shift: w })}
                    >
                      Edit window
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No current or upcoming sign-in windows.</p>
          )}
          {can('roster:assign') && staff.active ? (
            <Button
              className="mt-3"
              fullWidth={false}
              variant="outlined"
              onClick={() => setSheet({ kind: 'window' })}
            >
              Add sign-in window
            </Button>
          ) : null}
        </>
      ) : null}
      {schedulingPlanner(context) ? (
        <p className="mt-3 text-xs text-ink-muted">
          Everyone&rsquo;s windows:{' '}
          <Link className="font-semibold text-brand underline" to="/settings/scheduling">
            Settings → Staff scheduling &amp; coverage
          </Link>
          .
        </p>
      ) : null}
    </section>
  );

  const renderView = () => {
    if (view === 'profile') {
      return (
        <>
          <ContactActivationSection staff={staff} />
          <section className="rounded-card border border-outline-soft bg-white p-5">
            <h2 className="font-bold">Professional profile</h2>
            <p className="mt-2 text-sm">
              {profile
                ? `${profile.profession.label}${profile.specialties.length ? ` · ${profile.specialties.map((s) => s.label).join(', ')}` : ''}`
                : 'No profession or specialty has been recorded. Non-clinical staff do not need invented qualifications.'}
            </p>
            <p className="my-3 text-sm text-ink-muted">
              A profession label describes training. Only independently accepted clinical scope
              permits protected activities.
            </p>
            {context.permissions.includes('practitioner:manage') ? (
              <Button
                fullWidth={false}
                variant="outlined"
                onClick={() => setEditing({ kind: 'practitioner_profile', previous: profile })}
              >
                {profile ? 'Update profile' : 'Add professional profile'}
              </Button>
            ) : null}
          </section>
          {staff.staffId === context.userId ||
          context.permissions.includes('credential:read') ||
          canReview ? (
            <PrivateEvidence
              key={`${staff.staffId}:${context.userId}`}
              staffId={staff.staffId}
              data={data}
              canReview={canReview}
            />
          ) : null}
        </>
      );
    }

    if (view === 'work') {
      return (
        <>
          <section className="rounded-card border border-outline-soft bg-white p-5">
            <h2 className="font-bold">Software access</h2>
            <p className="my-2 text-sm">
              {roleLabel(staff)} ·{' '}
              {staff.permission === 'read_only' ? 'Read only' : 'Read and write'}. These account
              duties do not verify clinical qualification.
            </p>
            {context.permissions.includes('staff:permission') ? (
              <Link
                className="inline-flex min-h-11 items-center font-bold text-brand underline"
                to={`/admin/staff/access?staff=${encodeURIComponent(staff.staffId)}`}
              >
                Manage account access
              </Link>
            ) : null}
          </section>
          {signInAccess}
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="text-lg font-bold">Service assignments</h2>
            {context.permissions.includes('staff_assignment:manage') ? (
              <Button fullWidth={false} onClick={() => setEditing({ kind: 'staff_assignment' })}>
                Add assignment
              </Button>
            ) : null}
          </div>
          <RecordList
            records={assignments}
            data={data}
            onEdit={
              context.permissions.includes('staff_assignment:manage')
                ? (previous) => setEditing({ kind: 'staff_assignment', previous })
                : undefined
            }
            detail={(r) =>
              r.type === 'staff_assignment'
                ? `${data.offerings.find((o) => o.id === r.offeringId)?.name} · ${humanize(r.duty)} · ${showInterval(r.startsAt, r.endsAt, zone)}${r.temporaryCover ? ' · Temporary cover' : ''}`
                : ''
            }
          />
          <section className="rounded-card border border-outline-soft bg-white p-5">
            <h2 className="font-bold">Accepted clinical activities</h2>
            {proof?.id === verifiedSnapshotId && proof?.grants.length ? (
              <ul className="mt-3 space-y-3">
                {proof.grants.map((g) => (
                  <li key={g.decisionId} className="text-sm">
                    <strong>{g.scope.actions.map(humanize).join(', ')}</strong>
                    <p className="text-ink-muted">
                      {g.scope.kind === 'facility'
                        ? 'Across approved facility services'
                        : g.scope.offeringIds
                            .map(
                              (id) =>
                                data.offerings.find((o) => o.id === id)?.name ||
                                'Unavailable service',
                            )
                            .join(', ')}
                      {g.supervisorId
                        ? ` · Supervisor: ${data.staff.find((s) => s.staffId === g.supervisorId)?.fullName || 'Unavailable'}`
                        : ''}
                      {g.independentCheck ? ' · Independent check required' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                No accepted activity grant is available. A software duty or assignment does not
                substitute for clinical review.
              </p>
            )}
          </section>
          {can('staff:manage') && staff.active ? (
            <OutgoingStaffRequest staffId={staff.staffId} staffName={staff.fullName} />
          ) : null}
        </>
      );
    }

    if (view === 'schedule') {
      return (
        <>
          <p className="text-sm text-ink-muted">
            Service sessions this person is planned to staff, from Coverage. When they may sign in
            is under Work &amp; access.
            {schedulingPlanner(context) ? (
              <>
                {' '}
                Plan sessions in{' '}
                <Link
                  className="font-semibold text-brand underline"
                  to="/settings/scheduling?view=coverage"
                >
                  Settings → Staff scheduling &amp; coverage
                </Link>
                .
              </>
            ) : null}
          </p>
          <RecordList
            records={currentFacilityRevisions(data.sessions).filter((s) =>
              s.participants.some((p) => p.staffId === staff.staffId),
            )}
            data={data}
            detail={(r) =>
              r.type === 'service_session'
                ? `${data.offerings.find((o) => o.id === r.offeringId)?.name} · ${showInterval(r.startsAt, r.endsAt, r.timeZone)}`
                : ''
            }
          />
        </>
      );
    }

    return (
      <RecordList
        records={data.assignments
          .filter((a) => a.staffId === staff.staffId)
          .sort((a, b) => b.createdOn.localeCompare(a.createdOn))}
        data={data}
        detail={(r) =>
          r.type === 'staff_assignment'
            ? `Version ${r.version} · ${humanize(r.status)} · ${showInterval(r.startsAt, r.endsAt, zone)} · ${data.staff.find((s) => s.staffId === r.createdBy)?.fullName || 'Recorded staff'}`
            : ''
        }
      />
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8">
      <Link
        to="/admin/staff"
        className="inline-flex min-h-11 items-center text-sm font-bold text-brand"
      >
        ← Staff
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{staff.fullName}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {profile?.profession.label || 'Professional profile not yet recorded'} ·{' '}
            {roleLabel(staff)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag tone={staff.active ? undefined : 'amber'}>
              {staff.active ? 'Active at this facility' : 'Access removed at this facility'}
            </Tag>
            <Tag>{staff.permission === 'read_only' ? 'Read only' : 'Writable account'}</Tag>
            <Tag
              tone={
                proof?.id === verifiedSnapshotId &&
                proof?.grants.length &&
                Date.parse(proof.expiresOn) > Date.now()
                  ? 'green'
                  : 'amber'
              }
            >
              {proof?.id === verifiedSnapshotId &&
              proof?.grants.length &&
              Date.parse(proof.expiresOn) > Date.now()
                ? 'Accepted clinical scope available'
                : 'Clinical approval needed'}
            </Tag>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {staff.active && (can('staff:manage') || can('staff:permission')) ? (
            <Link
              className="inline-flex min-h-[44px] items-center rounded-field bg-brand px-4 font-bold text-white"
              to={`/admin/staff/access?staff=${encodeURIComponent(staff.staffId)}`}
            >
              Edit details &amp; access
            </Link>
          ) : null}
          {more.length ? (
            <ActionMenu label="More actions" title={staff.fullName} actions={more} />
          ) : null}
        </div>
      </header>
      <SectionTabs
        label="Staff profile sections"
        value={view}
        onChange={(next) => setParams({ view: next })}
        options={[
          { value: 'profile', label: 'Profile' },
          { value: 'work', label: 'Work & access' },
          { value: 'schedule', label: 'Schedule' },
          { value: 'history', label: 'History' },
        ]}
      />
      {renderView()}
      {editing ? (
        <RecordEditor
          {...editing}
          data={data}
          preset={{ staffId: staff.staffId }}
          onClose={() => setEditing(undefined)}
          onSaved={query.reload}
        />
      ) : null}
      {sheet?.kind === 'window' ? (
        <SignInWindowSheet staff={staff} shift={sheet.shift} onClose={closeSheet} />
      ) : null}
      {sheet?.kind === 'pin' ? (
        <PinCodeSheet staff={staff} onClose={() => setSheet(undefined)} />
      ) : null}
      {sheet?.kind === 'remove' ? <RemoveAccessSheet staff={staff} onClose={closeSheet} /> : null}
    </div>
  );
};
