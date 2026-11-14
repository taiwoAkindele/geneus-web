import type { InsuranceSetupItem, DeviceBlockReason } from '@shared';

/**
 * Turns a readiness fact from the server into what a person needs to act:
 * what is missing, why it matters, who can resolve it, where, and how.
 */
export type GuideAction = { label: string; to: string };
export type Guide = { title: string; status: string; why: string; who: string; steps: { text: string; action?: GuideAction }[]; action?: GuideAction };
type Viewer = { userId: string; permissions: readonly string[] };

export const DEVICE_REASONS: Record<DeviceBlockReason, { problem: string; fix: string }> = {
  never_reported: { problem: 'has never reported to the server since it was added', fix: 'Sign in on that device while it is online so it syncs once.' },
  no_insurance_support: { problem: 'is running an older version of Geneus without insurance support', fix: 'Open Geneus on that device while online and reload it; it updates itself. If it does not, close every Geneus tab and open it again.' },
  unsent_changes: { problem: 'has work it has not uploaded yet', fix: 'Open Geneus on that device while online and wait until it shows "Up to date".' },
  not_seen_in_24_hours: { problem: 'has not synced in the last 24 hours', fix: 'Open Geneus on that device while online. If the device is lost or retired, revoke it in Facility devices.' },
  revoked_with_unsent_changes: { problem: 'was revoked while it still held unsent work', fix: 'The administrator activating a contract confirms that this work will not arrive.' },
};

const payerStep = (payer: { id: string; name: string }, text: string, label: string) => ({ text, action: { label, to: `/insurance/contracts?payer=${encodeURIComponent(payer.id)}` } });

export const guideFor = (item: InsuranceSetupItem, viewer: Viewer): Guide => {
  const canManageStaff = viewer.permissions.includes('staff:manage');
  switch (item.kind) {
    case 'time_zone_recorded':
      return item.ok
        ? { title: 'Facility time zone', status: `Recorded: ${item.timeZone}`, why: 'Insurance dates every service in the hospital\'s local time.', who: 'Facility administrator', steps: [], action: { label: 'View or correct', to: '/facility?view=settings' } }
        : { title: 'Facility time zone', status: 'Facility time zone has not been configured.', why: 'This is required to calculate insurance service dates accurately: cover checks and contract dates are judged by the local date of each service.', who: 'Facility administrator', steps: [], action: { label: 'Configure time zone', to: '/facility?view=settings' } };
    case 'payers_added':
      return { title: 'Payers', status: item.ok ? `${item.count} payer${item.count === 1 ? '' : 's'} added` : 'No payers have been added yet.', why: 'Cover, contracts and claims all belong to a payer: an HMO, a state scheme or a company.', who: 'Insurance officer',
        steps: [], action: { label: item.ok ? 'Manage payers' : 'Add a payer', to: '/insurance/contracts' } };
    case 'active_contract': {
      const missing = item.payers ?? [];
      return { title: 'Active contracts', status: item.ok ? `${item.count} active contract${item.count === 1 ? '' : 's'}${missing.length ? `; ${missing.length} payer${missing.length === 1 ? '' : 's'} still without one` : ''}` : 'No contract is active yet.',
        why: 'What a patient and a payer each owe comes from the payer\'s contract. Without one, insured charges cannot be estimated.', who: 'Insurance officer prepares it; a facility administrator activates it',
        steps: missing.map((p) => payerStep(p, `${p.name} has no active contract.`, `Set up ${p.name}'s contract`)), ...(missing.length ? {} : { action: { label: 'Payers & contracts', to: '/insurance/contracts' } }) };
    }
    case 'officer_with_verified_email': {
      const people = item.people ?? [];
      const steps = people.filter((p) => p.email !== 'verified').map((p) => p.email === 'pending'
        ? { text: `${p.name} has proven an email address that is waiting for an administrator to confirm it is theirs.`, ...(canManageStaff ? { action: { label: 'Confirm email addresses', to: '/admin?section=email' } } : {}) }
        : p.staffId === viewer.userId
          ? { text: 'You have not added a verified email address.', action: { label: 'Add my email', to: '/profile' } }
          : { text: `${p.name} has not added an email address. Ask them to open My profile and add it.` });
      return { title: 'Someone who confirms insurance, with a verified email', status: item.ok ? `${item.count} ${item.count === 1 ? 'person' : 'people'} can confirm insurance work` : people.length ? 'Nobody who confirms insurance work has a verified email yet.' : 'Nobody here can confirm insurance work.',
        why: 'Confirming insurance splits and preparing claims are protected by a code sent to the person\'s own email.', who: people.length ? 'Each administrator or insurance officer, from My profile; another administrator confirms a new address' : 'Facility administrator',
        steps: people.length ? steps : [{ text: 'Give someone the insurance officer role.', action: { label: 'Open Staff & roster', to: '/admin/staff' } }] };
    }
    case 'devices_ready': {
      const devices = item.devices ?? [];
      return { title: 'Devices updated and synced', status: item.ok ? 'Every device is ready' : `${devices.length} device${devices.length === 1 ? ' is' : 's are'} not ready.`,
        why: 'Every device must show the same insurance figures as the server, so each one needs the current app and no unsent work when billing starts.', who: 'Whoever uses each device; a facility administrator can revoke a lost one',
        steps: devices.flatMap((d) => d.reasons.map((r) => ({ text: `${d.label ?? 'A device'} ${DEVICE_REASONS[r].problem}${r === 'unsent_changes' && d.pendingMutationCount ? ` (${d.pendingMutationCount} change${d.pendingMutationCount === 1 ? '' : 's'})` : ''}. ${DEVICE_REASONS[r].fix}` }))),
        action: { label: 'Open Facility devices', to: '/admin/devices' } };
    }
    case 'submission_method_per_payer': {
      const missing = item.payers ?? [];
      return { title: 'Claim submission method', status: item.ok ? 'Recorded for every payer' : missing.length ? `${missing.length} payer${missing.length === 1 ? '' : 's'} without one` : 'Add a payer first.',
        why: 'Claims are exported in the format each payer accepts and sent through its channel: a portal, email or delivery.', who: 'Insurance officer',
        steps: missing.map((p) => payerStep(p, `How ${p.name} receives claims is not recorded.`, `Set ${p.name}'s method`)) };
    }
    case 'contract_document_verified': {
      const missing = item.payers ?? [];
      return { title: 'Signed contract on file (recommended)', status: item.ok ? 'A verified contract is on file for every payer' : missing.length ? `${missing.length} payer${missing.length === 1 ? '' : 's'} without a verified contract document` : 'Add a payer first.',
        why: 'Keeping the signed agreement lets anyone check the terms entered in Geneus against the original.', who: 'Insurance officer',
        steps: missing.map((p) => payerStep(p, `No verified signed contract for ${p.name}.`, `Upload ${p.name}'s contract`)) };
    }
  }
};

export const NEEDED_FOR = { billing: 'Needed before billing', claims: 'Needed before claims', optional: 'Recommended' } as const;
