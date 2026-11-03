import type { AnswerListDraft, ResultPartDraft, ResultTemplateDraft } from '@shared';
import { organizationRequest } from './organizations';

/**
 * Result templates, shared parts and answer lists are changed only by the server,
 * online: it checks permission, that each test uses one template, and keeps every
 * revision. The saved records reach this device by sync. The standard templates
 * live on the server; a device sends only the keys it chose.
 */
export type StandardTemplateOption = { key: string; name: string; parts: number; tests: string[]; added: boolean };
export type SavedRevision = { id: string; revision: number };

export const listStandardTemplates = (actorStaffId: string) =>
  organizationRequest<{ templates: StandardTemplateOption[] }>('/result-templates/standard', actorStaffId);
export const adoptStandardTemplates = (actorStaffId: string, keys: string[]) =>
  organizationRequest<{ added: string[]; skipped: string[] }>('/result-templates/standard/adopt', actorStaffId, { keys });
export const saveResultTemplate = (actorStaffId: string, template: ResultTemplateDraft, existing?: SavedRevision) =>
  existing ? organizationRequest<SavedRevision>(`/result-templates/${encodeURIComponent(existing.id)}`, actorStaffId, { expectedRevision: existing.revision, template })
    : organizationRequest<SavedRevision>('/result-templates', actorStaffId, { template });
export const saveResultPart = (actorStaffId: string, part: ResultPartDraft, existing?: SavedRevision) =>
  existing ? organizationRequest<SavedRevision>(`/result-parts/${encodeURIComponent(existing.id)}`, actorStaffId, { expectedRevision: existing.revision, part })
    : organizationRequest<SavedRevision>('/result-parts', actorStaffId, { part });
export const saveAnswerList = (actorStaffId: string, list: AnswerListDraft, existing?: SavedRevision) =>
  existing ? organizationRequest<SavedRevision>(`/answer-lists/${encodeURIComponent(existing.id)}`, actorStaffId, { expectedRevision: existing.revision, list })
    : organizationRequest<SavedRevision>('/answer-lists', actorStaffId, { list });
