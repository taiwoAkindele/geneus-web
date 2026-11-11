import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { canReadPatientChart } from '@shared';
import { useAuthorizationContext } from '@/session';
export const PatientChartAccess=({children}:{children:ReactNode})=>canReadPatientChart(useAuthorizationContext())?children:<div className="p-6"><h1 className="text-2xl font-extrabold">Medical history access required</h1><p className="mt-3">You can view patient details. A facility administrator can grant permission to view medical history.</p><Link to="/patients/search" className="inline-flex min-h-[52px] items-center font-bold text-brand">Patients</Link></div>;
