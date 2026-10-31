import type { ReactNode } from 'react';
import { clinicalDocumentAccess } from '@shared';
import { useAuthorizationContext } from '@/session';
import { UnavailableScreen } from '@/app/UnavailableScreen';
export const ClinicalDocumentsAccess=({children}:{children:ReactNode})=>clinicalDocumentAccess(useAuthorizationContext())?children:<UnavailableScreen title="Clinical Services access" description="Documents are available to staff with Clinical Services access in this hospital."/>;
