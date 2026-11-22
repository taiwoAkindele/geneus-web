import { wardForBed, type AnyDocument, type Location, type SessionEvent, type Unit } from '@shared';
import { eventHeads, type WorkforceData } from '@/data/repos/workforce';
const INTAKE_STATES: Record<SessionEvent['action'], string> = {
  open: 'Open',
  resume: 'Open',
  pause: 'Paused',
  close: 'Closed',
};

/** More than one current head means two devices changed intake while apart. */
const intakeState = (heads: readonly SessionEvent[]): string => {
  if (heads.length === 1) {
    return INTAKE_STATES[heads[0].action];
  }

  if (heads.length) {
    return 'Needs reconciliation';
  }

  return 'Not opened';
};

const pendingChangeNote = (hasRefusedChange: boolean, hasUnsentChange: boolean): string => {
  if (hasRefusedChange) {
    return ' · change needs review';
  }

  if (hasUnsentChange) {
    return ' · change awaiting server';
  }

  return '';
};

export const intakeLabel = (
  events: readonly SessionEvent[],
  data: Pick<WorkforceData, 'pending' | 'receipts' | 'rejections'>,
): string => {
  const refused = new Set([
    ...data.receipts.filter((r) => r.outcome === 'rejected').map((r) => r.id),
    ...data.rejections
      .filter((r) => r.type === 'sync_rejection' && !r.resolvedOn)
      .map((r) => (r.type === 'sync_rejection' ? r.entityId : '')),
  ]);
  const heads = eventHeads(events.filter((e) => !data.pending.has(e.id) && !refused.has(e.id)));
  const state = intakeState(heads);
  const changeNote = pendingChangeNote(
    events.some((e) => refused.has(e.id)),
    events.some((e) => data.pending.has(e.id)),
  );

  return `${state}${changeNote}`;
};

export const humanize = (value: string): string =>
  (
    ({
      practitioner_profile: 'Professional profile',
      capability_decision: 'Clinical approval',
      staff_assignment: 'Work assignment',
      service_session: 'Coverage session',
      service_offering: 'Facility service',
      service_definition: 'Care activity',
      billing_department: 'Financial department',
    }) as Record<string, string>
  )[value] || value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const unitPath = (id: string, units: readonly Unit[]): string => {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = units.find((u) => u.id === id || u.unitId === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = units.find((u) => u.id === current?.parentId || u.unitId === current?.parentId);
  }
  return names.join(' / ') || 'Team unavailable';
};
export const recordName = (record: AnyDocument): string => {
  if ('name' in record) {
    return String(record.name);
  }

  if ('label' in record) {
    return String(record.label);
  }

  if ('fullName' in record) {
    return String(record.fullName);
  }

  return humanize(record.type);
};

export const proposalState = (record: AnyDocument, data: WorkforceData): string => {
  if (data.pending.has(record.id)) {
    return 'Saved here · awaiting server';
  }

  const rejectedOnReceipt = data.receipts.some(
    (r) => r.id === record.id && r.outcome === 'rejected',
  );
  const rejectedAtSync = data.rejections.some(
    (r) => r.type === 'sync_rejection' && r.entityId === record.id && !r.resolvedOn,
  );

  if (rejectedOnReceipt || rejectedAtSync) {
    return 'Needs reconciliation';
  }

  return 'Server accepted';
};
/** A place's type, and for a ward how many active beds it holds (directly or inside its rooms). */
export const placeDetail = (place: Location, locations: readonly Location[]): string => {
  if (place.kind !== 'ward') {
    return humanize(place.kind);
  }
  const beds = locations.filter(
    (l) => l.kind === 'bed' && l.active && wardForBed(l, locations)?.id === place.id,
  ).length;
  return `${humanize(place.kind)} · ${beds} bed${beds === 1 ? '' : 's'}`;
};
