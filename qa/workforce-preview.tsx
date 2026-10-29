import '@/lib/platform';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { parseDocument, type AnyDocument } from '@shared';
import { SessionProvider } from '@/session';
import { ToastProvider } from '@/ui';
import { openDatabase } from '@/data/database';
import { unlockSecureStorage } from '@/lib/secureStorage';
import { recordServerContact } from '@/data/deviceCredential';
import { TABLE_FOR } from '@/data/tables';
import { toRow } from '@/data/rows';
import { FacilityWorkspace, ServiceWorkspace, CoverageWorkspace } from '@/features/workforce/Workspaces';
import { StaffWorkspace } from '@/features/workforce/StaffWorkspace';
import '../src/index.css';

// Uses the actual encrypted PowerSync SQLite and production repositories.
// It never connects to a server, never enrolls a device and contains synthetic people only.
await unlockSecureStorage();
const db=await openDatabase();
const now=Date.now(),env={facilityId:'QA-WORKFORCE',deviceId:'qa-device',createdBy:'staff:qa-admin',createdOn:new Date(now-3600000).toISOString(),schemaVersion:4};
const records:unknown[]=[
  {...env,id:'QA-WORKFORCE',type:'facility',code:'QA-WORKFORCE',name:'Synthetic facility',state:'Oyo',lga:'Ibadan',timeZone:'Africa/Lagos'},
  {...env,id:'staff:qa-admin',type:'staff',staffId:'staff:qa-admin',fullName:'Synthetic facility manager',role:'facility_admin',permission:'read_write',active:true,loginAccess:'always'},
  {...env,id:'staff:qa-nurse',type:'staff',staffId:'staff:qa-nurse',fullName:'Synthetic nurse',role:'nurse',permission:'read_write',active:true,loginAccess:'always'},
  {...env,id:'unit:care',type:'unit',unitId:'legacy:care',name:'Outpatient team',kind:'unit',revision:1,active:true},
  {...env,id:'unit:hospital',type:'unit',unitId:'unit:hospital',name:'Medical services',kind:'department',routingEnabled:false,revision:1,active:true},
  {...env,id:'unit:ward',type:'unit',unitId:'unit:ward',name:'Ward team',kind:'unit',parentId:'unit:hospital',revision:1,active:true},
  {...env,id:'location:consult',type:'location',name:'Consulting room',kind:'room',unitId:'unit:care',revision:1,active:true,capacity:1},
  {...env,id:'location:ward',type:'location',name:'Medical ward',kind:'ward',unitId:'unit:ward',revision:1,active:true,capacity:12},
  {...env,id:'definition:consult',type:'service_definition',name:'Consultation',category:'consultation',concept:{system:'urn:synthetic',code:'consult',label:'Consultation'},revision:1,active:true},
  {...env,id:'offering:consult',type:'service_offering',name:'Outpatient consultation',serviceDefinitionId:'definition:consult',unitId:'unit:care',locationIds:['location:consult'],delivery:'physical',intakePolicy:'both',timeZone:'Africa/Lagos',configuration:'active',revision:1},
  {...env,id:'profile:nurse',type:'practitioner_profile',staffId:'staff:qa-nurse',profession:{system:'urn:synthetic',code:'nurse',label:'Registered nurse'},specialties:[{system:'urn:synthetic:specialty',code:'original-specialty',label:'Community health, chronic care'}],active:true,revision:1},
  {...env,id:'assignment:nurse:v1',type:'staff_assignment',assignmentId:'assignment:nurse',staffId:'staff:qa-nurse',offeringId:'offering:consult',locationIds:['location:consult'],duty:'member',requiredActions:[],startsAt:new Date(now-3600000).toISOString(),endsAt:new Date(now+3*86400000).toISOString(),status:'proposed',temporaryCover:false,version:1},
];
for(const input of records){const parsed=parseDocument(input);if(!parsed.success)throw new Error(JSON.stringify(parsed.error.issues));const record=parsed.data,row=toRow(record.type,record),keys=Object.keys(row);await db.execute(`INSERT OR REPLACE INTO ${TABLE_FOR[record.type]}(${keys.map((k)=>`"${k}"`).join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,keys.map((k)=>row[k]));}
// Acknowledge fixture seed operations so only tested form saves appear in its outbox.
for(;;){const transaction=await db.getNextCrudTransaction();if(!transaction)break;await transaction.complete();}
localStorage.setItem('geneus.signedInStaffId','staff:qa-admin');localStorage.setItem('geneus.lastActivityOn',String(Date.now()));recordServerContact(new Date().toISOString());
Object.assign(window,{workforceQa:{db,records:records as AnyDocument[]}});
const Fixture=()=>{const navigate=useNavigate();Object.assign(window,{workforceNavigate:navigate});return <div className="min-h-screen bg-surface"><nav className="flex flex-wrap gap-4 border-b bg-white p-4 text-sm font-bold text-brand"><Link to="/facility">Facility setup</Link><Link to="/admin/staff/staff%3Aqa-nurse">Staff profile</Link><Link to="/coverage">Coverage</Link></nav><p className="px-4 pt-2 text-xs text-ink-muted">Synthetic acceptance fixture · actual encrypted local database · no live server</p><Routes><Route path="/facility" element={<FacilityWorkspace/>}/><Route path="/facility/services/:offeringId" element={<ServiceWorkspace/>}/><Route path="/admin/staff/:staffId" element={<StaffWorkspace/>}/><Route path="/coverage" element={<CoverageWorkspace/>}/></Routes></div>;};
createRoot(document.getElementById('root')!).render(<SessionProvider><ToastProvider><MemoryRouter initialEntries={['/facility']}><Fixture/></MemoryRouter></ToastProvider></SessionProvider>);
