import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Handoff } from '@shared';
import { Avatar, Button, ChoiceChip, Icon, Tag, useToast } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { AuthorizationError } from '@/data';
import { markHandoff } from '@/data/repos/handoffs';
import type { EncounterNavState } from '@/features/encounter';
import { usePatients } from '@/features/search';
import { readDeviceUnit, rememberDeviceUnit, useIncomingHandoffs, useUnits } from '@/features/units';
import { useAuthorizationContext } from '@/session';

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const timeOf = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * A unit's incoming patients (PRD §9.7): who was sent here, from where, and
 * the instruction that came with them — so nobody asks the patient to explain
 * again. Any on-duty staff may act on any unit's list; the device only
 * remembers which unit it usually sits in.
 */
export const UnitQueueScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const units = useUnits();
  const patients = usePatients();
  const [unitId, setUnitId] = useState(readDeviceUnit());
  const incoming = useIncomingHandoffs(unitId);
  const [busyId, setBusyId] = useState<string>();

  const active = (units.data ?? []).filter((unit) => unit.active);
  const unit = active.find((candidate) => candidate.id === unitId);
  const unitName = (id: string) => units.data?.find((candidate) => candidate.id === id)?.name ?? 'another unit';
  const patientOf = (patientId: string) => patients.data?.find((candidate) => candidate.patientId === patientId);

  const choose = (id: string) => {
    setUnitId(id);
    rememberDeviceUnit(id);
  };

  const mark = async (handoff: Handoff, status: 'received' | 'done') => {
    setBusyId(handoff.id);
    try {
      await markHandoff(handoff, status, context);
      toast(status === 'received' ? 'Marked as arrived' : 'Marked as done');
    } catch (cause) {
      toast(cause instanceof AuthorizationError ? cause.message : 'Could not update — please try again', { tone: 'error' });
    } finally {
      setBusyId(undefined);
    }
  };

  const openEncounter = (handoff: Handoff) =>
    navigate('/encounters/record', {
      state: { patientId: handoff.patientId, encounterId: handoff.encounterId } satisfies EncounterNavState,
    });

  const list = incoming.data ?? [];

  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full px-5 py-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate('/home')}
              className="-ml-2 flex h-10 w-10 min-h-0 flex-none items-center justify-center text-ink-soft"
            >
              <Icon name="back" className="h-6 w-6" />
            </button>
            <div>
              <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">Unit queue</div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">{unit?.name ?? 'Choose a unit'}</h1>
            </div>
          </div>
          <SyncPill />
        </div>

        {units.loading ? null : active.length === 0 ? (
          <div className="mt-4 rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
            No units are set up yet. A facility admin adds them under Admin → Units &amp; rooms.
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {active.map((candidate) => (
              <ChoiceChip key={candidate.id} selected={candidate.id === unit?.id} onClick={() => choose(candidate.id)}>
                {candidate.name}
              </ChoiceChip>
            ))}
          </div>
        )}

        {unit ? (
          <>
            <div className="mt-5 flex items-center justify-between text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
              <span>Sent here</span>
              <span className="font-mono normal-case tracking-normal">{list.length} waiting</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 pb-24 sm:grid-cols-2 lg:grid-cols-3">
              {incoming.error ? (
                <div className="rounded-card bg-white p-4 text-[13px] text-danger-strong">
                  The list could not be read from this device.{' '}
                  <button type="button" className="font-bold text-brand" onClick={incoming.reload}>
                    Try again
                  </button>
                </div>
              ) : list.length === 0 ? (
                <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted sm:col-span-2 lg:col-span-3">
                  {incoming.loading ? 'Loading…' : `Nobody is waiting for ${unit.name}.`}
                </div>
              ) : (
                list.map((handoff) => {
                  const patient = patientOf(handoff.patientId);
                  return (
                    <div key={handoff.id} className="rounded-card border border-outline-soft bg-white p-4">
                      <div className="flex items-center gap-3">
                        <Avatar tone="green">{patient ? initialsOf(patient.fullName) : '??'}</Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-bold">{patient?.fullName ?? handoff.patientId}</div>
                          <div className="text-[13px] text-ink-muted">
                            From {unitName(handoff.fromUnitId)} · {timeOf(handoff.createdOn)}
                          </div>
                        </div>
                        <Tag tone={handoff.status === 'pending' ? 'amber' : 'slate'}>
                          {handoff.status === 'pending' ? 'On the way' : 'Here'}
                        </Tag>
                      </div>
                      <div className="mt-3 rounded-[11px] bg-brand-tint px-3.5 py-3 text-[15px] font-semibold text-brand">
                        {handoff.instruction}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {handoff.status === 'pending' ? (
                          <Button variant="outlined" fullWidth={false} className="px-4" disabled={busyId === handoff.id} onClick={() => void mark(handoff, 'received')}>
                            Arrived
                          </Button>
                        ) : null}
                        <Button variant="primary" fullWidth={false} className="px-4" disabled={busyId === handoff.id} onClick={() => void mark(handoff, 'done')}>
                          Done
                        </Button>
                        {handoff.encounterId ? (
                          <Button variant="ghost" fullWidth={false} className="px-4" onClick={() => openEncounter(handoff)}>
                            Open encounter
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
