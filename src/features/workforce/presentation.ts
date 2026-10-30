import type { AnyDocument, SessionEvent, Unit } from '@shared';
import { eventHeads, type WorkforceData } from '@/data/repos/workforce';
export const intakeLabel=(events:readonly SessionEvent[],data:Pick<WorkforceData,'pending'|'receipts'|'rejections'>):string=>{
  const refused=new Set([...data.receipts.filter((r)=>r.outcome==='rejected').map((r)=>r.id),...data.rejections.filter((r)=>r.type==='sync_rejection'&&!r.resolvedOn).map((r)=>r.type==='sync_rejection'?r.entityId:'')]);
  const heads=eventHeads(events.filter((e)=>!data.pending.has(e.id)&&!refused.has(e.id)));
  const state=heads.length===1?({open:'Open',resume:'Open',pause:'Paused',close:'Closed'}[heads[0].action]):heads.length?'Needs reconciliation':'Not opened';
  return`${state}${events.some((e)=>refused.has(e.id))?' · change needs review':events.some((e)=>data.pending.has(e.id))?' · change awaiting server':''}`;
};
export const humanize = (value: string): string => ({ practitioner_profile: 'Professional profile', capability_decision: 'Clinical approval', staff_assignment: 'Work assignment', service_session: 'Coverage session', service_offering: 'Facility service', service_definition: 'Care activity', billing_department: 'Financial department' } as Record<string, string>)[value] || value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const unitPath = (id: string, units: readonly Unit[]): string => {
  const names: string[] = [], seen = new Set<string>();
  let current = units.find((u) => u.id === id || u.unitId === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = units.find((u) => u.id === current?.parentId || u.unitId === current?.parentId);
  }
  return names.join(' / ') || 'Team unavailable';
};
export const recordName = (record: AnyDocument): string => 'name' in record ? String(record.name) : 'label' in record ? String(record.label) : 'fullName' in record ? String(record.fullName) : humanize(record.type);
export const proposalState = (record: AnyDocument, data: WorkforceData): string => data.pending.has(record.id) ? 'Saved here · awaiting server' : data.receipts.some((r) => r.id === record.id && r.outcome === 'rejected') || data.rejections.some((r) => r.type === 'sync_rejection' && r.entityId === record.id && !r.resolvedOn) ? 'Needs reconciliation' : 'Server accepted';
