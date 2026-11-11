import { useCallback } from 'react';
import { reservationMatchesAppointment } from '@shared';
import { useLiveQuery } from '@/data';
import { reservationForAppointment } from '@/data/repos/appointments';
import { Tag } from '@/ui';
export const ReservationStatus = ({ appointmentId }: {
  appointmentId: string;
}) => {
  const load = useCallback(() => reservationForAppointment(appointmentId), [appointmentId]);
  const query = useLiveQuery(load), booking = query.data?.booking;
  if (!booking?.allocation)
    return null;
  if (query.error)
    return <p role="alert" className="text-sm text-danger">Reservation status unavailable. <button onClick={query.reload} className="underline">Retry</button></p>;
  const latest = query.data?.reservations.sort((a, b) => b.revision - a.revision)[0], accepted = latest && reservationMatchesAppointment(latest, booking);
  return <section className="my-3 rounded-field border border-outline-soft p-3 text-sm"><h3 className="mb-2 font-bold">Service resource reservation</h3><Tag tone={accepted ? 'green' : 'amber'}>{accepted ? 'Server accepted' : 'Proposal · awaiting acceptance'}</Tag><p className="mt-2 text-ink-muted">{accepted ? 'This confirmation matches the current booking dates, practitioner and places.' : 'The current proposal is not a confirmed resource commitment. Review conflicts in Sync & review.'}</p>{latest && !accepted ? <p className="mt-2">{latest.reason || 'The previous allocation remains authoritative until the replacement is accepted.'}</p> : null}</section>;
};
