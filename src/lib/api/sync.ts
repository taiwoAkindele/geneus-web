import type { SyncTokenResponse, UploadRequest, UploadResponse } from '@shared';
import { SCHEMA_VERSION, POLICY_VERSION } from '@shared';
import { postAsDevice } from './client';

/** The two calls PowerSync's connector makes, both as the device (SCHEMA.md §12). */
export const WORKFORCE_VERSIONS = { documentWorkflowVersion:1,inpatientWorkflowVersion: 1, clinicalWorkflowVersion: 1, facilityContractVersion: 1, schemaVersion: SCHEMA_VERSION, policyVersion: POLICY_VERSION } as const;
export const fetchSyncToken = (credential: string, pendingMutationCount = 1) => postAsDevice<SyncTokenResponse>('/sync/token', credential, { ...WORKFORCE_VERSIONS, pendingMutationCount });

export const uploadMutations = (credential: string, request: UploadRequest) =>
  postAsDevice<UploadResponse>('/sync/upload', credential, request);
