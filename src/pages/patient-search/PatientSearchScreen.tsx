import { useCallback,useEffect,useMemo } from 'react';
import { useNavigate,useSearchParams } from 'react-router-dom';
import { patientSexLabel } from '@shared';
import { Button,DataTable,Icon,SectionTabs,Tag } from '@/ui';
import { currentAge,searchPatients } from '@/features/search';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { loadPatientDirectory,type PatientDirectoryRow } from '@/data/repos/patientDirectory';
import { ScanPatientCard } from '@/features/patients/ScanPatientCard';
import { patientChartPath } from '@/features/patients/patientRoutes';

/** The first registration across linked records is when this patient was created. */
const createdOn=(row:PatientDirectoryRow)=>row.searchRecords.map(patient=>patient.createdOn).sort()[0]??row.patient.createdOn;

const AdmissionStatus=({row}:{row:PatientDirectoryRow})=>row.stay?<><Tag tone="green">Admitted</Tag><p className="mt-1 text-xs text-ink-soft">{row.stay.ward} · {row.stay.bed}</p>{row.stay.pending?<p className="mt-1 text-xs text-amber-text">Pending server confirmation</p>:null}</>:<Tag>Not admitted</Tag>;

export const PatientSearchScreen=()=>{
  const navigate=useNavigate(),[params,setParams]=useSearchParams(),context=useAuthorizationContext();
  const directory=useLiveQuery(useCallback(()=>loadPatientDirectory(context),[context.userId,context.facilityId,context.deviceId]));
  const query=params.get('q')??params.get('visitQuery')??'',care=params.get('care')??'all';
  const change=(key:string,value:string)=>setParams(current=>{const next=new URLSearchParams(current);next.delete('page');next.delete('visitPage');next.delete('visitQuery');if(value)next.set(key,value);else next.delete(key);return next;},{replace:true});
  useEffect(()=>{document.title='Patients · Geneus Health';},[]);
  const rows=directory.data??[];
  const found=useMemo(()=>{
    const searchable=rows.flatMap(row=>row.searchRecords.map(patient=>({...patient,...(!context.permissions.includes('patient:update')?{nin:undefined}:{})})));
    const ids=new Set(searchPatients(searchable,query,context.facilityId).map(patient=>patient.patientId));
    return rows.filter(row=>row.ids.some(id=>ids.has(id))&&(!care||care==='all'||(care==='inpatient'?Boolean(row.stay):!row.stay&&Boolean(row.lastVisit))));
  },[rows,query,care,context.facilityId,context.permissions.join('|')]);
  const open=(id:string)=>navigate(patientChartPath(id,'details',{from:'/patients/search?'+params}));
  const page=Number(params.get('page')??0);
  // Newest registrations first unless the user picks another sort.
  const sortKey=params.get('sort'),sort=['patient','created'].includes(sortKey??'')?{key:sortKey!,descending:params.get('descending')==='1'}:{key:'created',descending:true};
  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><h1 className="text-[28px] font-extrabold">Patients</h1><div className="flex flex-wrap gap-2">{context.permissions.some(permission=>['patient_identity:review','patient_identity:resolve'].includes(permission))?<Button variant="outlined" fullWidth={false} onClick={()=>navigate('/patients/identity')}>Review duplicate patients</Button>:null}{context.permissions.includes('patient:create')?<Button fullWidth={false} onClick={()=>navigate('/patients/new')}>Add patient</Button>:null}</div></header>
    <SectionTabs label="Patient care type" value={care} onChange={value=>change('care',value)} options={[{value:'all',label:'All',count:rows.length},{value:'inpatient',label:'Inpatients',count:rows.filter(row=>row.stay).length},{value:'outpatient',label:'Outpatients',count:rows.filter(row=>!row.stay&&row.lastVisit).length}]}/>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-[1_1_320px]"><label htmlFor="patient-search" className="mb-2 block text-sm font-bold">Search patients</label><div className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline px-4"><Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft"/><input id="patient-search" type="search" value={query} onChange={event=>change('q',event.target.value)} placeholder="Name, phone, ID or folder number" className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" autoComplete="off"/></div></div><ScanPatientCard onRead={value=>change('q',value)}/></div>
    {directory.loading?<p role="status">Reading patients...</p>:directory.error?<div role="alert"><p>Patients could not be read.</p><Button onClick={directory.reload}>Try again</Button></div>:<><p className="text-sm text-ink-soft">{found.length} of {rows.length} patients</p>{found.length?<DataTable caption="Patients" uniformHeaders rows={found} rowKey={row=>row.patient.id} page={Number.isInteger(page)&&page>=0?page:0} onPageChange={value=>setParams(current=>{const next=new URLSearchParams(current);next.set('page',String(value));return next;},{replace:true})} sort={sort} onSortChange={value=>setParams(current=>{const next=new URLSearchParams(current);next.set('sort',value.key);next.set('descending',value.descending?'1':'0');next.delete('page');return next;},{replace:true})} columns={[
      {key:'patient',label:'Patient',sortValue:row=>row.patient.fullName,render:row=><div className="min-w-[120px] max-w-[260px]"><button type="button" className="min-h-0 text-left text-sm font-bold text-brand underline" onClick={()=>open(row.patient.patientId)}>{row.patient.fullName}</button>{row.patient.identityStatus==='provisional'?<Tag tone="amber" className="ml-2">Provisional</Tag>:null}<p className="text-xs text-ink-soft">{currentAge(row.patient)??'Age not recorded'} · {patientSexLabel(row.patient.sex)}</p><p className="mt-1 break-all font-mono text-xs text-ink-soft md:hidden">{row.patient.patientId}</p><div className="mt-2 md:hidden"><AdmissionStatus row={row}/></div></div>},
      {key:'patientId',label:'Patient ID',className:'hidden md:table-cell',render:row=><span className="break-all font-mono">{row.patient.patientId}</span>},
      {key:'phone',label:'Phone',className:'hidden lg:table-cell',render:row=>row.patient.phone??<span className="text-ink-soft">—</span>},
      {key:'folder',label:'Folder no.',className:'hidden lg:table-cell',render:row=>row.patient.legacyPaperRef?<span className="font-mono">{row.patient.legacyPaperRef}</span>:<span className="text-ink-soft">—</span>},
      {key:'created',label:'Created at',className:'hidden md:table-cell',sortValue:createdOn,render:row=>{const created=new Date(createdOn(row));return <>{created.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}<p className="text-xs text-ink-soft">{created.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</p></>;}},
      {key:'status',label:'Status',className:'hidden md:table-cell',render:row=><AdmissionStatus row={row}/>},
      {key:'actions',label:'Action',render:row=><Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={()=>open(row.patient.patientId)}>View details</Button>},
    ]}/>:<p className="rounded-field border border-dashed border-outline p-6">{rows.length?'No patients match these filters.':'No patients registered on this device yet.'}</p>}</>}
    <p className="text-sm text-ink-soft">One row per patient. Full visit history opens from patient details when permitted.</p>
  </div>;
};
