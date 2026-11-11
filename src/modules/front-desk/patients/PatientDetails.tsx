import { useCallback,useEffect,useState } from 'react';
import { Link,useLocation,useSearchParams } from 'react-router-dom';
import type { RegistrationOutcome } from '@/modules/front-desk/registration';
import { canReadPatientChart,INPATIENT_STATUS,patientSexLabel } from '@shared';
import { Button } from '@/ui';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext,useSession } from '@/session';
import { currentAge } from '@/modules/front-desk/search';
import { loadPatientDirectory } from '@/data/repos/patientDirectory';
import { PersonalDetails,PersonalDetailsEditor } from './PersonalDetails';
import { PatientCard } from './PatientCard';
import { patientChartPath } from './patientRoutes';
import { visitDate } from '@/modules/clinical/encounter/VisitTable';
import { BookAppointmentSheet,type AppointmentPatient } from '@/modules/front-desk/appointments';

export const PatientDetails=({patientId}:{patientId?:string})=>{
  const context=useAuthorizationContext(),{facility}=useSession(),[params]=useSearchParams();
  // Set once by registration: where the patient was sent. Not kept in the address, so a reload does not repeat it.
  const outcome=(useLocation().state as {outcome?:RegistrationOutcome}|null)?.outcome;
  const query=useLiveQuery(useCallback(()=>loadPatientDirectory(context),[context.userId,context.facilityId,context.deviceId]));
  const [editing,setEditing]=useState(false),[card,setCard]=useState(false),[booking,setBooking]=useState(false);
  useEffect(()=>{document.title='Patient details · Geneus Health';},[]);
  const row=query.data?.find(item=>item.ids.includes(patientId??''));
  if(query.loading)return <p role="status" className="p-6">Reading patient details…</p>;
  if(query.error)return <div role="alert" className="p-6"><p>Patient details could not be read.</p><Button onClick={query.reload}>Try again</Button></div>;
  if(!row)return <div className="p-6"><p>This patient is not available on this device.</p><Link to="/patients/search">Patients</Link></div>;
  const patient=row.patient,stay=row.stay,canEdit=context.permissions.includes('patient:update');
  const returnTo=params.get('from')?.startsWith('/patients/search?')?params.get('from')!:'/patients/search';
  const canBook=context.permissions.includes('appointment:create');
  const canBill=context.permissions.some(permission=>['payment:receive','payment:waive','fee_item:manage'].includes(permission));
  const shownOutcome=outcome&&row.ids.includes(outcome.patientId)?outcome:undefined;
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8">
    <Link to={returnTo} className="inline-flex min-h-[44px] items-center font-bold text-brand">Patients</Link>
    {shownOutcome?<p role="status" className="rounded-field border border-brand bg-brand-wash p-4 font-bold text-brand">{shownOutcome.message}</p>:null}
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-ink-soft">Patient details</p><h1 className="text-[28px] font-extrabold">{patient.fullName}</h1><p className="mt-2 break-all font-mono text-sm">{patient.patientId}</p><p className="mt-1 text-sm">{currentAge(patient)??'Age not recorded'}{currentAge(patient)!==undefined?' years':''} · {patientSexLabel(patient.sex)}</p></div>
      <div className="flex flex-wrap gap-2">{canReadPatientChart(context)?<Link className="inline-flex min-h-[52px] items-center rounded-field bg-brand px-5 font-bold text-white" to={patientChartPath(patient.patientId,'now',{from:returnTo})}>View medical history</Link>:null}{canBook?<Button variant="outlined" fullWidth={false} onClick={()=>setBooking(true)}>Book appointment</Button>:null}{canBill?<Link className="inline-flex min-h-[52px] items-center rounded-field border border-outline px-5 font-bold text-brand" to={'/billing?patient='+encodeURIComponent(patient.patientId)}>Billing account</Link>:null}</div></header>
    <section aria-label="Admission and care details" className="rounded-field border border-outline-soft bg-brand-wash p-4"><h2 className="text-lg font-bold">Admission &amp; care details</h2><dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="font-semibold text-ink-soft">Admission status</dt><dd>{stay?`Inpatient · ${INPATIENT_STATUS[stay.status as keyof typeof INPATIENT_STATUS]}`:'Not currently admitted'}</dd></div>
      <div><dt className="font-semibold text-ink-soft">Last visit date</dt><dd>{row.lastVisit?visitDate(row.lastVisit.openedOn):'No visit recorded'}</dd></div>
      <div><dt className="font-semibold text-ink-soft">Ward</dt><dd>{stay?.ward??'—'}</dd></div><div><dt className="font-semibold text-ink-soft">Bed</dt><dd>{stay?.bed??'—'}</dd></div>
      <div><dt className="font-semibold text-ink-soft">Responsible team</dt><dd>{stay?.team??'Not assigned'}</dd></div><div><dt className="font-semibold text-ink-soft">Attending / responsible staff</dt><dd>{stay?.attending.join(', ')||'Not assigned'}</dd></div>
    </dl>{stay?.pending?<p className="mt-3 text-sm text-amber-text">Admission change pending server confirmation</p>:null}</section>
    <PersonalDetails patient={patient} canEdit={canEdit} onEdit={()=>setEditing(true)} onPrint={()=>setCard(true)}/>
    {booking&&context.permissions.includes('appointment:create')?<BookAppointmentSheet patient={{id:patient.patientId,name:patient.fullName,initials:patient.fullName.split(/\s+/).slice(0,2).map(part=>part[0]).join(''),allergy:'Review clinical information with authorised care staff'} as AppointmentPatient} onClose={()=>setBooking(false)}/>:null}
    {editing&&canEdit?<PersonalDetailsEditor patient={patient} onClose={()=>setEditing(false)} onSaved={query.reload}/>:null}
    {card?<PatientCard patient={patient} facilityName={facility.name} onClose={()=>setCard(false)}/>:null}
  </div>;
};
