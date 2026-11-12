import { useEffect, useRef, useState } from 'react';
import { INSURANCE_SUPPORT_EVENT } from '@/data/insuranceSupport';
import { useLocation } from 'react-router-dom';
import { useAuthorizationContext } from '@/session';
import { readLastWorkspace, rememberWorkspace, workspaceForLocation, workspacesFor } from './workspaces';

export const useWorkspace = () => {
  const context = useAuthorizationContext();
  const { pathname, search, key } = useLocation();
  // Insurance pages appear in the menu once the server grants this device insurance.
  const [, refreshMenu] = useState(0);
  useEffect(() => { const refresh = () => refreshMenu((n) => n + 1); window.addEventListener(INSURANCE_SUPPORT_EVENT, refresh); return () => window.removeEventListener(INSURANCE_SUPPORT_EVENT, refresh); }, []);
  const available = workspacesFor(context);
  const last = readLastWorkspace(context.facilityId, context.userId);
  const owner = JSON.stringify([context.facilityId, context.userId]);
  const history = useRef({ owner, pages: new Map<string, typeof last>() });
  if (history.current.owner !== owner) history.current = { owner, pages: new Map() };
  // Browser Back restores a shared record's original module, even after switching modules.
  const current = workspaceForLocation(pathname, search, available, history.current.pages.get(key) ?? last);
  useEffect(() => {
    if (current) {
      history.current.pages.set(key, current.id);
      rememberWorkspace(context.facilityId, context.userId, current.id);
    }
  }, [context.facilityId, context.userId, current?.id, key]);
  const resume = available.find((workspace) => workspace.id === last) ?? available.find((workspace) => workspace.id === (context.role === 'cashier' ? 'finance' : ['doctor', 'nurse', 'chew', 'supervisor', 'laboratory_staff', 'pharmacy_staff'].includes(context.role) ? 'clinical' : 'front-desk'));
  return { available, current, resume };
};
