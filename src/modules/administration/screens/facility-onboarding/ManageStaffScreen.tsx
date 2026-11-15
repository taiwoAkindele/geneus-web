import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Role } from '@shared';
import { Button, DataTable, SelectField, Tag, TextField } from '@/ui';
import { accessFor, accessLabel, type Access } from '@/session/accessPolicy';
import { shiftRangeLabel } from '@/session/shiftLabels';
import { ROLE_LABELS, roleLabel } from '@/modules/operations/staff/staffAccess';
import { usePendingEmailRequests } from './EmailConfirmationsCard';
import { onboardingTag, useOnboardingSummaries } from '@/modules/operations/staff/ContactActivation';
import type { StaffOnboardingSummary } from '@/lib/api/staff';
import { hasPin, useAuth, useAuthorizationContext, type RosterEntry } from '@/session';

const onShiftNow = (entry: RosterEntry): boolean => {
  if (!entry.shift) return false;
  const now = Date.now();
  return new Date(entry.shift.startsAt).getTime() <= now && now < new Date(entry.shift.extendedUntil ?? entry.shift.endsAt).getTime();
};
const roles = (entry: RosterEntry): Role[] => [entry.staff.role, ...(entry.staff.additionalRoles ?? [])];

const PeopleLinks = ({ people }: { people: [string, string][] }) => <>
  {people.map(([staffId, name], index) => <span key={staffId}>{index ? ', ' : ''}<Link className="font-semibold text-brand underline" to={`/admin/staff/${encodeURIComponent(staffId)}`}>{name}</Link></span>)}
</>;

/**
 * Who needs an administrator, each linking to their profile where it is done:
 * invitations that expired or could not be sent, and email confirmations left
 * from the retired confirmation flow. Read from the server; nothing shows
 * offline or without a verified session.
 */
const NeedsAttention = ({ roster, summaries }: { roster: RosterEntry[]; summaries?: Map<string, StaffOnboardingSummary> }) => {
  const { requests } = usePendingEmailRequests();
  const emails = [...new Map((requests ?? []).map((r) => [r.staffId, r.staffName])).entries()];
  const invitations: [string, string][] = roster.filter((entry) => entry.staff.active && onboardingTag(summaries?.get(entry.staff.staffId))?.tone === 'amber').map((entry) => [entry.staff.staffId, entry.staff.fullName]);
  if (!emails.length && !invitations.length) return null;
  return <div role="status" className="space-y-1 rounded-field border border-amber-border bg-amber-bg p-3 text-sm">
    {invitations.length ? <p><strong>{invitations.length === 1 ? '1 invitation needs' : `${invitations.length} invitations need`} attention:</strong> <PeopleLinks people={invitations} /></p> : null}
    {emails.length ? <p><strong>{requests!.length === 1 ? '1 email address is' : `${requests!.length} email addresses are`} waiting for confirmation:</strong> <PeopleLinks people={emails} /></p> : null}
  </div>;
};

/**
 * Staff: the directory of people at this facility. Select a person to see and
 * manage everything about them on their profile. Facility-wide planning
 * (sign-in windows, coverage) lives in Settings → Staff scheduling & coverage.
 */
export const ManageStaffScreen = () => {
  useEffect(() => { document.title = 'Staff · Geneus Health'; }, []);
  const navigate = useNavigate();
  const { roster, loading, error, reload } = useAuth();
  const context = useAuthorizationContext();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [signIn, setSignIn] = useState<Access | ''>('');
  const canAdd = context.permissions.includes('staff:manage') && context.permissions.includes('staff:permission');
  const summaries = useOnboardingSummaries();
  const invited = (entry: RosterEntry) => entry.staff.active ? onboardingTag(summaries?.get(entry.staff.staffId)) : undefined;
  const presentRoles = [...new Set(roster.flatMap(roles))].sort((a, b) => ROLE_LABELS[a].localeCompare(ROLE_LABELS[b]));
  const shown = roster
    .filter((entry) => (entry.staff.fullName + ' ' + roleLabel(entry.staff)).toLowerCase().includes(search.toLowerCase()))
    .filter((entry) => !role || roles(entry).includes(role))
    .filter((entry) => !signIn || accessFor(entry.staff) === signIn)
    .sort((a, b) => a.staff.fullName.localeCompare(b.staff.fullName));
  const profile = (entry: RosterEntry) => navigate('/admin/staff/' + encodeURIComponent(entry.staff.staffId));
  const today = (entry: RosterEntry) => accessFor(entry.staff) !== 'shift' ? accessLabel(accessFor(entry.staff)) : entry.shift ? `Can sign in ${shiftRangeLabel(entry.shift)}` : 'No sign-in window today';
  const filtered = Boolean(search || role || signIn);
  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto w-full max-w-md space-y-4 px-5 py-3 md:max-w-2xl lg:max-w-none lg:px-8">
        <div className="flex items-center justify-between gap-3"><h1 className="text-[24px] font-extrabold">Staff</h1>{canAdd ? <Button fullWidth={false} onClick={() => navigate('/admin/staff/invite')}>＋ Add staff</Button> : null}</div>
        <NeedsAttention roster={roster} summaries={summaries} />
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <TextField label="Find staff by name or role" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <SelectField label="Role" value={role} onChange={(event) => setRole(event.target.value as Role | '')} options={[{ value: '', label: 'All roles' }, ...presentRoles.map((value) => ({ value, label: ROLE_LABELS[value] }))]} />
          <SelectField label="Sign-in access" value={signIn} onChange={(event) => setSignIn(event.target.value as Access | '')} options={[{ value: '', label: 'All' }, { value: 'shift', label: accessLabel('shift') }, { value: 'always', label: accessLabel('always') }, { value: 'admin', label: accessLabel('admin') }]} />
        </div>
        {loading ? <div role="status" className="h-24 animate-pulse rounded-card bg-surface-muted" aria-label="Loading staff" /> : error ? <div role="alert">Staff could not be read from this device.<Button variant="ghost" onClick={reload}>Try again</Button></div>
          : !roster.length ? <p className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-muted">No staff yet.{canAdd ? ' Add the first staff member above.' : ''}</p>
          : !shown.length ? <p className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-muted">{filtered ? 'No staff match these filters.' : 'No staff yet.'}</p>
          : <>
            <div className="space-y-2 lg:hidden">{shown.map((entry) => <button key={entry.staff.staffId} type="button" onClick={() => profile(entry)} className="block min-h-[44px] w-full rounded-card border border-outline-soft bg-white p-4 text-left">
              <div className="text-[16px] font-bold text-brand">{entry.staff.fullName}</div><div className="mt-1 text-[13px] text-ink-muted">{roleLabel(entry.staff)} · {entry.staff.permission === 'read_only' ? 'Read only' : 'Read & write'}</div>
              <div className="mt-3 flex flex-wrap gap-2"><Tag tone={onShiftNow(entry) || accessFor(entry.staff) !== 'shift' ? 'green' : 'amber'}>{today(entry)}</Tag><Tag tone={hasPin(entry.staff.staffId) ? 'green' : 'neutral'}>{hasPin(entry.staff.staffId) ? 'PIN ready here' : 'PIN not set here'}</Tag>{invited(entry) ? <Tag tone={invited(entry)!.tone}>{invited(entry)!.label}</Tag> : null}</div>
            </button>)}</div>
            <div className="hidden lg:block"><DataTable caption="Staff directory" rows={shown} rowKey={(row) => row.staff.staffId} columns={[
              { key: 'name', label: 'Staff member', sortValue: (row) => row.staff.fullName, render: (row) => <button type="button" className="min-h-0 py-1 text-left font-bold text-brand hover:underline" onClick={() => profile(row)}>{row.staff.fullName}</button> },
              { key: 'role', label: 'Roles', sortValue: (row) => roleLabel(row.staff), render: (row) => roleLabel(row.staff) },
              { key: 'signin', label: 'Sign-in today', render: today },
              { key: 'pin', label: 'PIN on this device', render: (row) => <>{hasPin(row.staff.staffId) ? 'Ready' : 'Not set here'}{invited(row) ? <> · <Tag tone={invited(row)!.tone}>{invited(row)!.label}</Tag></> : null}</> },
              { key: 'access', label: 'Access', render: (row) => row.staff.permission === 'read_only' ? 'Read only' : 'Read & write' },
              { key: 'open', label: 'Profile', render: (row) => <Button variant="outlined" fullWidth={false} className="px-3 py-2" aria-label={'Open profile of ' + row.staff.fullName} onClick={() => profile(row)}>Open</Button> },
            ]} /></div>
          </>}
        <p className="text-xs leading-relaxed text-ink-muted">Open a person to see their details, access, sign-in windows and schedule, and to manage them. PIN setup is specific to this device; access changes reach other devices when they sync.</p>
      </div>
    </div>
  );
};
