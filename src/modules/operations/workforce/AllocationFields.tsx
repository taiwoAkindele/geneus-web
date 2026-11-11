import { useEffect, useState } from 'react';
import { currentFacilityRevisions, effectiveFacilityRevisions, type AppointmentAllocation } from '@shared';
import { SelectField, TextField } from '@/ui';
import { zonedInput, zonedInstant, showInterval } from '@/lib/workforceTime';
import { useWorkforce } from './useWorkforce';
export type AllocationProposal = {
  allocation?: AppointmentAllocation;
  scheduledFor?: string;
  error?: string;
};
export const AllocationFields = ({ start, startInstant, onChange, initial }: {
  start: string;
  startInstant?:string;
  onChange: (value: AllocationProposal) => void;
  initial?: AppointmentAllocation;
}) => {
  const query = useWorkforce(), [service, setService] = useState(initial?.offeringId || ''), [session, setSession] = useState(initial?.sessionId || ''), [assignment, setAssignment] = useState(initial?.assignmentId || ''), [end, setEnd] = useState(''), [places, setPlaces] = useState<string[]>(initial?.locations.map((l) => l.locationId) || []), [units, setUnits] = useState<Record<string, string>>(Object.fromEntries(initial?.locations.map((l) => [l.locationId, String(l.units)]) || []));
  const data = query.data, offering = data?.offerings.find((o) => o.id === service), zone = offering?.timeZone || 'Africa/Lagos';
  useEffect(() => {
    if (initial && offering)
      setEnd(zonedInput(initial.endsAt, zone));
  }, [offering?.id, offering?.timeZone]);
  useEffect(() => {
    if (!service) {
      onChange({});
      return;
    }
    try {
      if (!data || !offering)
        throw new Error('Wait for service records to load');
      if (!start&&!startInstant)
        throw new Error('Choose the appointment date and time first');
      const scheduledFor = startInstant||zonedInstant(start, zone), endsAt = zonedInstant(end, zone);
      const person = effectiveFacilityRevisions(data.assignments, Date.parse(scheduledFor)).find((a) => a.assignmentId === assignment && a.offeringId === service && a.status === 'active');
      if (assignment && !person)
        throw new Error('Choose an effective active practitioner assignment');
      onChange({ scheduledFor, allocation: { offeringId: service, sessionId: session || undefined, assignmentId: person?.assignmentId, staffId: person?.staffId, endsAt, locations: places.map((locationId) => ({ locationId, units: Number(units[locationId] || 1) })) } });
    }
    catch (cause) {
      onChange({ error: cause instanceof Error ? cause.message : 'Complete the resource proposal' });
    }
  }, [start, startInstant, service, session, assignment, end, places, units, data, zone]);
  return <section className="space-y-3 rounded-field border border-outline-soft p-3"><h3 className="font-bold">Service and resources</h3><p className="text-xs text-ink-muted">Optional resource reservation. Until server acceptance, this is a proposal. Walk-ins can be routed without a named booking.</p>{query.error ? <p role="alert" className="text-sm text-danger">{query.error.message}<button type="button" onClick={query.reload} className="ml-2 underline">Retry</button></p> : null}<SelectField label="Care service" value={service} onChange={(e) => { setService(e.target.value); setSession(''); setAssignment(''); setPlaces([]); }} options={[{ value: '', label: 'No resource reservation' }, ...(data?.offerings || []).filter((o) => o.configuration === 'active').map((o) => ({ value: o.id, label: o.name }))]} />
    {service ? <><p className="text-xs font-bold text-ink-muted">Booking times use {zone}.</p><SelectField label="Coverage session" value={session} onChange={(e) => { setSession(e.target.value); setAssignment(''); }} options={[{ value: '', label: 'No session · independent booking' }, ...currentFacilityRevisions(data?.sessions || []).filter((s) => s.offeringId === service && s.status === 'published').map((s) => ({ value: s.sessionId, label: showInterval(s.startsAt, s.endsAt, s.timeZone) }))]} /><SelectField label="Named practitioner" value={assignment} onChange={(e) => setAssignment(e.target.value)} options={[{ value: '', label: 'Service team · no named practitioner' }, ...currentFacilityRevisions(data?.assignments || []).filter((a) => a.offeringId === service && a.status === 'active' && (!session || data?.sessions.some((s) => s.sessionId === session && s.participants.some((p) => p.assignmentId === a.assignmentId)))).map((a) => ({ value: a.assignmentId, label: data?.staff.find((s) => s.staffId === a.staffId)?.fullName || 'Staff unavailable' }))]} /><TextField label="Reservation ends" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} help={{ purpose: 'Use the actual end date and local time. Resource intervals cannot overlap accepted commitments.' }} /><fieldset><legend className="text-sm font-bold">Places to reserve</legend>{data?.locations.filter((l) => l.active && offering?.locationIds.includes(l.id)).map((l) => <div key={l.id} className="my-2"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={places.includes(l.id)} onChange={(e) => setPlaces(e.target.checked ? [...places, l.id] : places.filter((id) => id !== l.id))} />{l.name} · capacity {l.capacity || 1}</label>{places.includes(l.id) ? <TextField label={`Capacity units for ${l.name}`} type="number" min={1} value={units[l.id] || '1'} onChange={(e) => setUnits({ ...units, [l.id]: e.target.value })} /> : null}</div>)}</fieldset></> : null}
  </section>;
};
