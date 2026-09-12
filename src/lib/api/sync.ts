import type { SyncTokenResponse, UploadRequest, UploadResponse } from '@shared';
import { postAsDevice } from './client';

/** The two calls PowerSync's connector makes, both as the device (SCHEMA.md §12). */
export const fetchSyncToken = (credential: string) => postAsDevice<SyncTokenResponse>('/sync/token', credential);

export const uploadMutations = (credential: string, request: UploadRequest) =>
  postAsDevice<UploadResponse>('/sync/upload', credential, request);
