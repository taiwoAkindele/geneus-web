import { useCallback,useEffect } from 'react';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { loadClinicalDocuments } from '@/data/repos/clinicalDocuments';
export const useClinicalDocuments=()=>{
  const context=useAuthorizationContext();
  const query=useLiveQuery(useCallback(()=>loadClinicalDocuments(context),[context.userId,context.facilityId,context.deviceId,context.role,context.permissions.join('|'),context.roles?.join('|')]));
  useEffect(()=>{const refresh=()=>query.reload();window.addEventListener('geneus:documentSupport',refresh);return()=>window.removeEventListener('geneus:documentSupport',refresh);},[query.reload]);
  return query;
};
