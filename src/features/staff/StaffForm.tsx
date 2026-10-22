import { useState, type FormEvent } from 'react';
import { AssignablePermission, Role, ROLE_PERMISSIONS, rolesFor, staffPermissions, type Staff } from '@shared';
import { Button, TextField, ToggleSwitch } from '@/ui';
import type { StaffDetails } from '@/data/repos/staff';
import { PERMISSION_LABELS, ROLE_LABELS } from './staffAccess';

type Props = {
  initial?: Staff;
  canEditName: boolean;
  canEditAccess: boolean;
  submitLabel: string;
  onSave: (details: StaffDetails) => Promise<void>;
};

/** One form for adding and editing staff; inherited access is visibly distinct from extra grants. */
export const StaffForm = ({ initial, canEditName, canEditAccess, submitLabel, onSave }: Props) => {
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(initial ? rolesFor(initial) : []);
  const [primaryRole, setPrimaryRole] = useState<Role>(initial?.role ?? 'chew');
  const [additionalPermissions, setAdditionalPermissions] = useState<AssignablePermission[]>(initial?.additionalPermissions ?? []);
  const [permission, setPermission] = useState<Staff['permission']>(initial?.permission ?? 'read_write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const inherited = new Set(selectedRoles.flatMap((role) => ROLE_PERMISSIONS[role]));
  const effective = selectedRoles.length ? staffPermissions({
    role: primaryRole, additionalRoles: selectedRoles.filter((role) => role !== primaryRole),
    additionalPermissions, permission,
  }) : [];

  const toggleRole = (role: Role) => {
    const next = selectedRoles.includes(role) ? selectedRoles.filter((item) => item !== role) : [...selectedRoles, role];
    setSelectedRoles(next);
    if (!next.includes(primaryRole)) setPrimaryRole(next[0] ?? 'chew');
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!fullName.trim()) { setError('Enter the staff member’s full name'); return; }
    if (!selectedRoles.length) { setError('Choose at least one role'); return; }
    setSaving(true); setError(undefined);
    try {
      await onSave({
        fullName: fullName.trim(), role: primaryRole, permission,
        additionalRoles: canEditAccess ? selectedRoles.filter((role) => role !== primaryRole) : initial?.additionalRoles,
        additionalPermissions: canEditAccess ? additionalPermissions.filter((item) => !inherited.has(item)) : initial?.additionalPermissions,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this staff member');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={(event) => void save(event)} noValidate className="space-y-5">
      <TextField label="Full name" name="staff_name" value={fullName} disabled={!canEditName || saving}
        autoComplete="off" onChange={(event) => setFullName(event.target.value)} />
      <fieldset disabled={!canEditAccess || saving} className="space-y-3 disabled:opacity-70">
        <legend className="mb-2 text-[15px] font-bold">Roles</legend>
        <p className="text-sm text-ink-muted">Choose every duty this person performs. Their roles combine to give them access.</p>
        <div className="grid grid-cols-2 gap-2">
          {Role.options.map((role) => <label key={role} className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-card border border-outline-soft bg-white px-3 py-2 text-sm font-semibold">
            <input type="checkbox" name="staff_roles" value={role} checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} className="h-5 w-5 accent-brand" />
            {ROLE_LABELS[role]}
          </label>)}
        </div>
        {selectedRoles.length > 1 ? <label className="block text-sm font-semibold">Primary role
          <select name="staff_primary_role" value={primaryRole} onChange={(event) => setPrimaryRole(event.target.value as Role)} className="mt-2 block w-full rounded-field border border-outline bg-white p-3">
            {selectedRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
          </select><span className="mt-1 block text-xs font-normal text-ink-muted">This role appears on new clinical records. All selected roles still contribute access.</span>
        </label> : null}
        <div className="flex items-center justify-between gap-3 rounded-card border border-outline-soft bg-white p-4">
          <div><div className="font-semibold">Read &amp; write</div><p className="mt-1 text-xs text-ink-muted">Turn off for view-only access. Roles and extra permissions stay configured.</p></div>
          <ToggleSwitch checked={permission === 'read_write'} ariaLabel="Read and write access" onChange={(on) => setPermission(on ? 'read_write' : 'read_only')} />
        </div>
        <details className="rounded-card border border-outline-soft bg-white p-4">
          <summary className="cursor-pointer py-1 font-bold">Additional permissions</summary>
          <p className="my-3 text-sm text-ink-muted">Grant extra actions without adding another role. Actions included by a role are already selected.</p>
          {AssignablePermission.options.map((item) => {
            const included = inherited.has(item);
            return <label key={item} className="flex min-h-[44px] items-center justify-between gap-3 border-t border-outline-soft py-2 text-sm">
              <span className="flex items-center gap-3"><input type="checkbox" name="staff_permissions" value={item}
                checked={included || additionalPermissions.includes(item)} disabled={included || !canEditAccess || saving}
                onChange={() => setAdditionalPermissions((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}
                className="h-5 w-5 flex-none accent-brand" />{PERMISSION_LABELS[item]}</span>
              {included ? <span className="text-right text-xs text-ink-muted">From role</span> : null}
            </label>;
          })}
        </details>
      </fieldset>
      <section aria-label="Effective access" className="rounded-card bg-brand-wash p-4">
        <h2 className="font-bold">{permission === 'read_only' ? 'View-only access' : `${effective.length} actions allowed`}</h2>
        <p className="mt-1 text-sm text-ink-muted">{permission === 'read_only' ? 'This person can view records but cannot create or change anything.' : 'Combined access from the selected roles and any additional permissions.'}</p>
        {permission === 'read_write' && effective.length ? <details className="mt-2"><summary className="cursor-pointer py-2 text-sm font-semibold">Review allowed actions</summary><ul className="list-disc space-y-1 pl-5 text-sm">{effective.map((item) => item !== 'pin_setup_code:claim' ? <li key={item}>{PERMISSION_LABELS[item]}</li> : null)}</ul></details> : null}
      </section>
      {error ? <p role="alert" className="rounded-card bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
      {(canEditName || canEditAccess) ? <Button type="submit" loading={saving} disabled={saving || !fullName.trim() || !selectedRoles.length}>{submitLabel}</Button> : <p className="text-sm text-ink-muted">You have view access. Ask a facility admin to change this staff member.</p>}
      <p className="text-xs leading-relaxed text-ink-muted">Access changes apply on this device first and reach other devices when they sync.</p>
    </form>
  );
};
