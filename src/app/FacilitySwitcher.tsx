import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { OrganizationFacilityDirectory } from '@shared';
import { useSession } from '@/session';
import { listFacilityWorkspaces, switchFacilityWorkspace } from '@/data/facilityWorkspaces';
import { cacheFacilityDirectory, cachedFacilityDirectory, facilityOpeningProof } from '@/data/facilitySetup';
import { listOrganizationFacilities, resolveOrganizationFacility } from '@/lib/api/organizations';
import { Icon } from '@/ui';

/** Organization metadata is separate from the independently enrolled operational workspaces. */
export const FacilitySwitcher = () => {
  const { facility, user } = useSession();
  const navigate = useNavigate();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState(() => cachedFacilityDirectory(facility.code, user.staffId)?.directory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selecting = useRef(false);
  const [refresh, setRefresh] = useState(0);
  const [position, setPosition] = useState({ top: 64, left: 8 });
  const entries = listFacilityWorkspaces();
  const choices = directory?.facilities ?? [{ id: facility.code, name: facility.name, accessible: true, canEnrollDevice: false }];
  const canAdd = directory?.canCreateFacility ?? (user.roles.includes('facility_admin') && user.canWrite);
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError('');
    void listOrganizationFacilities(user.staffId).then(async (value) => {
      if (cancelled) return;
      setDirectory(value);
      await cacheFacilityDirectory(facility.code, user.staffId, value);
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not refresh the facility list'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, refresh, facility.code, user.staffId]);
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, innerWidth - Math.min(360, innerWidth - 16) - 8)) });
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const resized = () => close();
    const clicked = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close(); };
    window.addEventListener('resize', resized); document.addEventListener('pointerdown', clicked);
    return () => { window.removeEventListener('resize', resized); document.removeEventListener('pointerdown', clicked); };
  }, [open]);

  const select = async (choice: OrganizationFacilityDirectory['facilities'][number]) => {
    if (!choice.accessible || selecting.current) return;
    if (choice.id === facility.code) { close(); return; }
    const existing = entries.find((entry) => entry.facilityId === choice.id);
    if (!existing && !choice.canEnrollDevice) { close(); navigate(`/facilities?connect=${encodeURIComponent(choice.id)}`); return; }
    selecting.current = true; setBusy(true); setError('');
    try {
      if (navigator.onLine === false) {
        if (!existing?.prepared) throw new Error('Connect to the internet to set up this facility on this device');
        await switchFacilityWorkspace(existing.deviceId);
      } else {
        const proof = existing ? { deviceId: existing.deviceId } : await facilityOpeningProof(facility.code, user.staffId, choice.id);
        const access = await resolveOrganizationFacility(user.staffId, choice.id, proof, Boolean(existing?.prepared));
        if (!access) { await switchFacilityWorkspace(existing!.deviceId); return; }
        await switchFacilityWorkspace(access.device?.deviceId ?? existing!.deviceId, access.device, { sourceStaffId: user.staffId, facilityId: access.facilityId, deviceId: proof.deviceId, staffId: access.staffId, personId: access.personId, createdOn: Date.now() });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this facility'); }
    finally { selecting.current = false; setBusy(false); }
  };

  return <div className="min-w-0 sm:max-w-[280px]">
    <button ref={trigger} type="button" title={facility.name} aria-label={`Switch facility: ${facility.name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(!open)} className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-field px-2 text-left text-xs font-semibold text-ink hover:bg-brand-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand sm:text-sm">
      <span className="min-w-0 truncate">{facility.name}</span><Icon name="chevron-down" className="h-4 w-4 flex-none text-brand" />
    </button>
    {open ? createPortal(<div ref={panel} id={menuId} role="menu" aria-label="Organization facilities" aria-busy={busy || loading} style={position} className="fixed z-50 w-[360px] max-w-[calc(100vw-16px)] overflow-hidden rounded-card border border-outline-soft bg-white shadow-sheet" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>
      <div className="border-b border-outline-soft px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{directory?.organization?.name ?? 'Your facilities'}</p>{loading ? <p role="status" className="mt-1 text-xs text-ink-soft">Refreshing facility list…</p> : null}</div>
      <div className="max-h-[45vh] overflow-y-auto p-2">{[...choices].sort((a, b) => Number(b.id === facility.code) - Number(a.id === facility.code)).map((choice) => {
        const current = choice.id === facility.code;
        const local = entries.find((entry) => entry.facilityId === choice.id);
        return <button key={choice.id} type="button" role="menuitem" aria-current={current ? 'true' : undefined} disabled={busy || !choice.accessible} onClick={() => void select(choice)} className={`flex min-h-[60px] w-full items-center gap-3 rounded-field px-3 py-2 text-left focus:outline focus:outline-2 focus:outline-brand disabled:opacity-60 ${current ? 'bg-brand-wash text-brand' : 'text-ink hover:bg-brand-wash'}`}>
          <Icon name={current ? 'check' : choice.accessible ? 'home' : 'lock'} className="h-5 w-5 flex-none" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold">{choice.name}</span><span className="block text-xs text-ink-soft">{current ? 'Current facility' : !choice.accessible ? 'Access not assigned' : local?.prepared ? 'Available on this device' : !local && !choice.canEnrollDevice ? 'Device setup required' : 'Set up on this device'}</span></span>
        </button>;
      })}</div>
      {busy ? <p role="status" className="px-4 py-2 text-sm text-brand">Opening facility…</p> : null}
      {error ? <div className="space-y-1 border-t border-outline-soft px-4 py-3"><p role="alert" className="text-xs text-danger-strong">{error}</p>{directory ? <p className="text-xs text-ink-soft">Showing the saved facility list.</p> : null}<button type="button" role="menuitem" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)} className="min-h-11 font-bold text-brand">Refresh list</button></div> : null}
      {canAdd ? <div className="border-t border-outline-soft p-2"><button type="button" role="menuitem" disabled={busy} onClick={() => { close(); navigate('/facilities/new'); }} className="flex min-h-12 w-full items-center gap-3 rounded-field px-3 py-2 text-sm font-bold text-brand hover:bg-brand-wash focus:outline focus:outline-2 focus:outline-brand"><Icon name="plus" className="h-5 w-5" />Add facility</button></div> : null}
    </div>, document.body) : null}
  </div>;
};
