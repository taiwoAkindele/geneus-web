import { activeAdmission, canonicalPatientId, inpatientHeads, usableInpatientEvents, type AuthorizationContext, type Encounter, type InpatientEvent, type Location, type Patient, type PatientIdentityEvent, type Unit, type WorkOwnershipEvent } from '@shared';
import { allOfType } from '../db';
import { getDatabase } from '../database';
import { listStaff } from './staff';
import { listWorkforceReceipts } from './workforceReceipts';
import { pendingWorkforceIds } from './workforce';

export type DirectoryStay = { encounterId:string; status:string; ward:string; bed:string; team:string; attending:string[]; pending:boolean; admittedOn:string };
export type PatientDirectoryRow = { patient:Patient; ids:string[]; searchRecords:Patient[]; lastVisit?:Encounter; careVisit?:Encounter; stay?:DirectoryStay };

/** Operational patient facts only. No encounter entries, diagnoses, admission notes or clinical events. */
export const loadPatientDirectory = async (context:AuthorizationContext):Promise<PatientDirectoryRow[]> => {
  if(context.userId==='nobody')throw new Error('Sign in to view patients');
  const [patients,visits,events,locations,units,identities,staff,receipts,pending,rejections,handoffs,owners]=await Promise.all([
    allOfType<Patient>('patient'), allOfType<Encounter>('encounter'), allOfType<InpatientEvent>('inpatient_event'),
    allOfType<Location>('location'),allOfType<Unit>('unit'),allOfType<PatientIdentityEvent>('patient_identity_event'),listStaff(),listWorkforceReceipts(),pendingWorkforceIds(),
    getDatabase().getAll<{entityId:string}>("SELECT entityId FROM sync_rejections WHERE entityType = 'inpatient_event'"),
    getDatabase().getAll<{id:string;encounterId?:string;toUnitId:string}>('SELECT id,encounterId,toUnitId FROM handoffs'),
    allOfType<WorkOwnershipEvent>('work_ownership_event'),
  ]);
  const rejected=new Set([...receipts.filter(row=>row.outcome==='rejected').map(row=>row.id),...rejections.map(row=>row.entityId)]);
  const usable=usableInpatientEvents(events.filter(event=>event.facilityId===context.facilityId),rejected);
  const stays=inpatientHeads(usable).filter(activeAdmission),groups=new Map<string,PatientDirectoryRow>();
  for(const patient of patients.filter(row=>row.facilityId===context.facilityId)){
    const key=canonicalPatientId(patient.patientId,identities),prior=groups.get(key);
    if(prior){prior.ids.push(patient.patientId);prior.searchRecords.push(patient);if(patient.patientId===key)prior.patient=patient;}
    else groups.set(key,{patient,ids:[patient.patientId],searchRecords:[patient]});
  }
  const byPatient=new Map<string,Encounter[]>();
  for(const visit of visits.filter(row=>row.facilityId===context.facilityId)){
    const key=canonicalPatientId(visit.patientId,identities),group=byPatient.get(key)??[];group.push(visit);byPatient.set(key,group);
  }
  const acceptedOwners=owners.filter(owner=>!pending.has(owner.id)&&!rejected.has(owner.id));
  for(const [key,row] of groups){
    const history=(byPatient.get(key)??[]).sort((a,b)=>b.openedOn.localeCompare(a.openedOn));row.lastVisit=history[0];
    const active=stays.filter(stay=>row.ids.includes(stay.patientId));
    const stay=active.length===1?active[0]:undefined;
    row.careVisit=stay?history.find(visit=>visit.id===stay.encounterId):row.lastVisit;
    if(stay){
      const sources=handoffs.filter(source=>source.encounterId===stay.encounterId&&source.toUnitId===stay.receivingUnitId);
      const responsible=sources.flatMap(source=>{
        const records=acceptedOwners.filter(owner=>owner.sourceId===source.id),heads=records.filter(record=>!records.some(next=>next.previousId===record.id));
        return heads.length===1&&heads[0].ownerStaffId?[heads[0].ownerStaffId]:[];
      });
      row.stay={encounterId:stay.encounterId,status:stay.action,ward:locations.find(place=>place.id===stay.wardId)?.name??'Awaiting allocation',bed:locations.find(place=>place.id===stay.bedId)?.name??'Awaiting allocation',team:units.find(unit=>[unit.id,unit.unitId].includes(stay.receivingUnitId))?.name??'Not recorded',attending:[...new Set(responsible)].map(id=>staff.find(member=>member.staffId===id)?.fullName??'Recorded staff member'),pending:pending.has(stay.id),admittedOn:usable.find(event=>event.id===stay.admissionId)?.createdOn??stay.createdOn};
    }
  }
  return [...groups.values()].sort((a,b)=>(b.lastVisit?.openedOn??'').localeCompare(a.lastVisit?.openedOn??'')||a.patient.fullName.localeCompare(b.patient.fullName));
};
