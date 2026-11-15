import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AssignablePermission, Role, ROLE_PERMISSIONS, rolesFor, staffPermissions, type Staff } from '@shared';
import { Button, SelectField, TextField, ToggleSwitch } from '@/ui';
import type { StaffDetails } from '@/data/repos/staff';
import { PERMISSION_LABELS, ROLE_LABELS } from './staffAccess';

type Props = {
  initial?: Staff;
  canEditName: boolean;
  canEditAccess: boolean;
  submitLabel: string;
  onSave: (details: StaffDetails) => Promise<void>;
  /** Contact fields owned by the caller, shown beside the name. */
  children?: ReactNode;
  layout?: 'stacked' | 'split';
  summaryContent?: ReactNode;
};

/** One form for adding and editing staff; inherited access is visibly distinct from extra grants. */
export const StaffForm = ({ initial, canEditName, canEditAccess, submitLabel, onSave, children, layout = 'stacked', summaryContent }: Props) => {
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const split = layout === 'split';
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(initial ? rolesFor(initial) : []);
  const [primaryRole, setPrimaryRole] = useState<Role>(initial?.role ?? 'chew');
  const [additionalPermissions, setAdditionalPermissions] = useState<AssignablePermission[]>(initial?.additionalPermissions ?? []);
  const [loginAccess, setLoginAccess] = useState<NonNullable<Staff['loginAccess']>>(initial?.loginAccess ?? 'shift');
  const [permission, setPermission] = useState<Staff['permission']>(initial?.permission ?? 'read_write');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const inherited = new Set(selectedRoles.flatMap((role) => ROLE_PERMISSIONS[role]));
  const effective = selectedRoles.length ? staffPermissions({
    role: primaryRole, additionalRoles: selectedRoles.filter((role) => role !== primaryRole),
    additionalPermissions, permission,
  }) : [];
  const extraGrants = additionalPermissions.filter((item) => !inherited.has(item));
  const signInLabel = selectedRoles.includes('facility_admin') || loginAccess === 'always' ? '24-hour access' : 'Scheduled shifts';

  // Keep the phone action above the app's dock, including any shift countdown.
  useEffect(() => {
    if (!split) return;
    const dock = document.querySelector('nav[aria-label$="mobile navigation"]')?.parentElement;
    if (!dock) return;
    const update = () => form.current?.style.setProperty('--staff-nav-offset', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [split]);

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
        loginAccess: canEditAccess ? loginAccess : initial?.loginAccess,
        additionalRoles: canEditAccess ? selectedRoles.filter((role) => role !== primaryRole) : initial?.additionalRoles,
        additionalPermissions: canEditAccess ? additionalPermissions.filter((item) => !inherited.has(item)) : initial?.additionalPermissions,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this staff member');
    } finally { setSaving(false); }
  };

  return (
    <form ref={form} aria-label="Staff details and access" onSubmit={(event) => void save(event)} noValidate className={split ? 'grid min-w-0 items-start gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_288px] lg:pb-0' : 'space-y-5'}>
      <div className={split ? 'min-w-0 space-y-5 rounded-card border border-outline-soft bg-white p-5 md:p-6' : 'min-w-0 space-y-5'}>
        <section aria-labelledby={`${id}-information`} className="space-y-4">
          <h2 id={`${id}-information`} className="text-base font-bold">Staff information</h2>
          <div className={`grid gap-4 ${children ? 'sm:grid-cols-2' : ''}`}>
            <TextField label="Full name" name="staff_name" required value={fullName} disabled={!canEditName || saving}
              autoComplete="off" onChange={(event) => setFullName(event.target.value)} />
            {children}
          </div>
        </section>

        <section aria-labelledby={`${id}-roles`} className="space-y-3 border-t border-outline-soft pt-5">
          <div><h2 id={`${id}-roles`} className="text-base font-bold">Roles <span aria-hidden="true" className="text-danger">*</span></h2><p id={`${id}-roles-help`} className="mt-1 text-sm text-ink-muted">Select at least one role. Roles combine to give this person access.</p></div>
          <fieldset disabled={!canEditAccess || saving} aria-labelledby={`${id}-roles`} aria-describedby={`${id}-roles-help`} className="min-w-0 space-y-4 disabled:opacity-70">
            <div className={`grid grid-cols-2 gap-2 ${split ? 'sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5' : ''}`}>
              {Role.options.map((role) => <label key={role} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-field border px-3 py-2 text-sm font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-brand ${selectedRoles.includes(role) ? 'border-brand bg-brand-wash text-brand' : 'border-outline-soft bg-white hover:border-outline'}`}>
                <input type="checkbox" name="staff_roles" value={role} checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} className="h-4 w-4 min-h-0 shrink-0 accent-brand" />
                <span className="min-w-0">{ROLE_LABELS[role]}</span>
              </label>)}
            </div>
            {selectedRoles.length > 1 ? <div className="max-w-sm"><SelectField label="Primary role" name="staff_primary_role" value={primaryRole} onChange={(event) => setPrimaryRole(event.target.value as Role)} options={selectedRoles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))} />
              <p className="mt-1 text-xs text-ink-muted">Appears on new clinical records. All selected roles still contribute access.</p>
            </div> : null}
          </fieldset>
        </section>

        <section aria-labelledby={`${id}-configuration`} className="space-y-3 border-t border-outline-soft pt-5">
          <h2 id={`${id}-configuration`} className="text-base font-bold">Access configuration</h2>
          <fieldset disabled={!canEditAccess || saving} aria-labelledby={`${id}-configuration`} className="min-w-0 space-y-4 disabled:opacity-70">
            <fieldset disabled={selectedRoles.includes('facility_admin')}>
              <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Sign-in access</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([{ value: 'shift', label: 'Scheduled shifts', detail: 'Sign in during an active roster window.' }, { value: 'always', label: '24-hour access', detail: 'Sign in at any time without a roster.' }] as const).map((option) => {
                  const checked = (selectedRoles.includes('facility_admin') ? 'always' : loginAccess) === option.value;
                  return <label key={option.value} className={`flex min-h-14 items-start gap-2 rounded-field border p-3 ${checked ? 'border-brand bg-brand-wash' : 'border-outline-soft'}`}>
                    <input type="radio" name="staff_login_access" value={option.value} checked={checked} onChange={() => setLoginAccess(option.value)} className="mt-0.5 h-4 w-4 min-h-0 shrink-0 accent-brand" />
                    <span><span className="block text-sm font-semibold">{option.label}</span><span className="mt-0.5 block text-xs text-ink-muted">{option.detail}</span></span>
                  </label>;
                })}
              </div>
              {selectedRoles.includes('facility_admin') ? <p className="mt-2 text-xs text-ink-muted">Facility administrators always have 24-hour sign-in access.</p> : null}
              <p className="mt-2 text-xs text-ink-muted">Sign out after 30 minutes without activity. A shift ending does not end an active session.</p>
            </fieldset>
            <div className="flex items-center justify-between gap-3 border-t border-outline-soft pt-4">
              <div><p className="text-sm font-semibold">Read &amp; write</p><p className="mt-1 text-xs text-ink-muted">Turn off for view-only access. Roles and extra permissions stay configured.</p></div>
              <ToggleSwitch checked={permission === 'read_write'} ariaLabel="Read and write access" disabled={!canEditAccess || saving} onChange={(on) => setPermission(on ? 'read_write' : 'read_only')} />
            </div>
            <details className="border-t border-outline-soft pt-2">
              <summary className="cursor-pointer py-2 text-sm font-semibold text-ink-soft">Advanced permissions{extraGrants.length ? ` (${extraGrants.length} additional)` : ''}</summary>
              <p className="mb-3 text-sm text-ink-muted">Grant extra actions without adding another role. Actions included by a role are already selected.</p>
              {AssignablePermission.options.map((item) => {
                const included = inherited.has(item);
                return <label key={item} className="flex min-h-11 items-center justify-between gap-3 border-t border-outline-soft py-2 text-sm">
                  <span className="flex items-center gap-3"><input type="checkbox" name="staff_permissions" value={item}
                    checked={included || additionalPermissions.includes(item)} disabled={included || !canEditAccess || saving}
                    onChange={() => setAdditionalPermissions((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}
                    className="h-4 w-4 min-h-0 shrink-0 accent-brand" />{PERMISSION_LABELS[item]}</span>
                  {included ? <span className="shrink-0 text-xs text-ink-muted">From role</span> : null}
                </label>;
              })}
            </details>
          </fieldset>
        </section>
      </div>

      <aside aria-label="Access summary" className={split ? 'min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--app-header-h,64px)+24px)]' : 'space-y-4'}>
        <section aria-label="Effective access" className="space-y-4 rounded-card border border-outline-soft bg-white p-5">
          <h2 className="text-base font-bold">Access summary</h2>
          <div role="status" aria-live="polite" aria-atomic="true">
            <p className="font-semibold">{!selectedRoles.length ? 'Choose a role to see access' : permission === 'read_only' ? 'View-only access' : 'Read & write access'}</p>
            <p className="mt-1 text-sm text-ink-muted">{!selectedRoles.length ? 'No roles selected yet.' : `${effective.length} actions allowed across ${selectedRoles.length} ${selectedRoles.length === 1 ? 'role' : 'roles'}.`}</p>
          </div>
          {selectedRoles.length ? <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-outline-soft pt-3 text-sm">
            <div className={selectedRoles.length > 1 ? 'col-span-2' : ''}><dt className="text-xs text-ink-muted">Roles</dt><dd className="mt-1 font-semibold">{selectedRoles.map((role) => ROLE_LABELS[role]).join(', ')}</dd></div>
            {selectedRoles.length > 1 ? <div><dt className="text-xs text-ink-muted">Primary role</dt><dd className="mt-1 font-semibold">{ROLE_LABELS[primaryRole]}</dd></div> : null}
            <div><dt className="text-xs text-ink-muted">Sign-in access</dt><dd className="mt-1 font-semibold">{signInLabel}</dd></div>
            {extraGrants.length ? <div className="col-span-2"><dt className="text-xs text-ink-muted">Additional permissions</dt><dd className="mt-1">{extraGrants.length} configured{permission === 'read_only' ? '; only read actions apply' : ''}</dd></div> : null}
          </dl> : null}
          {permission === 'read_only' && selectedRoles.length ? <p className="text-xs text-ink-muted">Can view information their permissions allow, but cannot create or change records.</p> : null}
          {effective.length ? <details className="border-t border-outline-soft pt-2"><summary className="cursor-pointer py-2 text-sm font-semibold">Review allowed actions</summary><ul className="max-h-64 list-disc space-y-2 overflow-y-auto pl-5 pr-1 text-xs">{effective.map((item) => item !== 'pin_setup_code:claim' ? <li key={item}>{PERMISSION_LABELS[item]}</li> : null)}</ul></details> : null}
          {summaryContent ? <div className="border-t border-outline-soft pt-3">{summaryContent}</div> : null}
        </section>
        <div className={split ? 'fixed inset-x-0 bottom-[var(--staff-nav-offset,96px)] z-20 space-y-3 border-t border-outline-soft bg-white px-5 py-3 lg:static lg:border-0 lg:bg-transparent lg:p-0' : 'space-y-3'}>
          {error ? <p role="alert" className="rounded-field bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
          {(canEditName || canEditAccess) ? <Button type="submit" loading={saving} disabled={saving || !fullName.trim() || !selectedRoles.length}>{submitLabel}</Button> : <p className="text-sm text-ink-muted">You have view access. Ask a facility admin to change this staff member.</p>}
          <p className={`text-xs leading-relaxed text-ink-muted ${split ? 'hidden lg:block' : ''}`}>Access changes apply on this device first and reach other devices when they sync.</p>
        </div>
      </aside>
    </form>
  );
};
