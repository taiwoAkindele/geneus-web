import type { AuthorizationContext, Handoff } from '@shared';
import { allWhere, envelope, insertRecord, newId, updateRecord } from '../db';

/** Patients sent to a unit, as its incoming list reads them. */
export const handoffsTo = (unitId: string) => allWhere<Handoff>('handoff', 'toUnitId', unitId);

export type HandoffDraft = {
  patientId: string;
  /** The encounter the patient is moving within, so the receiving unit opens the same one. */
  encounterId?: string;
  fromUnitId: string;
  toUnitId: string;
  instruction: string;
};

/** The instruction travels with the patient (PRD §9.7). */
export const sendHandoff = (draft: HandoffDraft, context: AuthorizationContext) => {
  if (draft.fromUnitId === draft.toUnitId) throw new Error('A patient is sent to a different unit');
  return insertRecord<Handoff>(context, 'handoff:create', 'handoff', {
    ...envelope(context),
    id: newId('handoff'),
    type: 'handoff',
    patientId: draft.patientId,
    encounterId: draft.encounterId,
    fromUnitId: draft.fromUnitId,
    toUnitId: draft.toUnitId,
    instruction: draft.instruction.trim(),
    status: 'pending',
  });
};

/** The receiving unit marks the patient arrived, then the instruction carried out. */
export const markHandoff = (handoff: Handoff, status: 'received' | 'done', context: AuthorizationContext) =>
  updateRecord<Handoff>(context, 'handoff:update', 'handoff', handoff.id, { status });
