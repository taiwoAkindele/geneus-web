import { useCallback,useEffect,useMemo } from 'react';
import { useNavigate,useSearchParams } from 'react-router-dom';
import { patientSexLabel } from '@shared';
import { Button,DataTable,Icon,SelectField,Tag } from '@/ui';
import { currentAge,searchPatients } from '@/modules/front-desk/search';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { DIRECTORY_TYPES,loadPatientDirectory,type PatientDirectoryRow } from '@/data/repos/patientDirectory';
import { chargeBalances,listAdjustments,listCharges,listPayments } from '@/data/repos/billing';
import { balanceOwed,todayStatus } from '@/modules/front-desk/patients/directoryView';
import { ScanPatientCard } from '@/modules/front-desk/patients/ScanPatientCard';
import { opensChartFirst, patientChartPath } from '@/modules/front-desk/patients/patientRoutes';
import { ClinicalPatientList } from '@/modules/clinical/screens/clinical-patients/ClinicalPatientsScreen';

/** The first registration across linked records is when this patient was created. */
const createdOn=(row:PatientDirectoryRow)=>row.searchRecords.map(patient=>patient.createdOn).sort()[0]??row.patient.createdOn;

const AdmissionStatus=({row}:{row:PatientDirectoryRow})=>row.stay?<><Tag tone="green">Admitted</Tag><p className="mt-1 text-xs text-ink-soft">{row.stay.ward} · {row.stay.bed}</p>{row.stay.pending?<p className="mt-1 text-xs text-amber-text">Pending server confirmation</p>:null}</>:<Tag>Not admitted</Tag>;

const FrontDeskPatientList=()=>{
  const navigate=useNavigate(),[params,setParams]=useSearchParams(),context=useAuthorizationContext();
  const directory=useLiveQuery(useCallback(()=>loadPatientDirectory(context),[context.userId,context.facilityId,context.deviceId]),DIRECTORY_TYPES);
  const query=params.get('q')??params.get('visitQuery')??'';
  const change=(key:string,value:string)=>setParams(current=>{const next=new URLSearchParams(current);next.delete('page');next.delete('visitPage');next.delete('visitQuery');if(value)next.set(key,value);else next.delete(key);return next;},{replace:true});
  useEffect(()=>{document.title='Patients · Geneus Health';},[]);
  const rows=directory.data??[];
  // Balances are financial facts: only staff who handle payments or fees see them.
  const canBill=context.permissions.some(permission=>['payment:receive','payment:waive','fee_item:manage'].includes(permission));
  const balances=useLiveQuery(useCallback(async()=>canBill?chargeBalances(await listCharges(),await listPayments(),await listAdjustments()):[],[canBill]),['charge','payment','billing_adjustment','sync_rejection']);
  const owed=(row:PatientDirectoryRow)=>balanceOwed(row,balances.data??[]);
  // The Show select replaces the old tabs and keeps their ?care= address; anything unknown (or hidden from this role) shows all patients.
  const views=[
    {value:'all',label:'All patients',count:rows.length},
    {value:'today',label:'In clinic today',count:rows.filter(row=>todayStatus(row)).length},
    ...(canBill?[{value:'balance',label:'With a balance',count:balances.data?rows.filter(row=>owed(row).length>0).length:undefined}]:[]),
    {value:'inpatient',label:'Inpatients',count:rows.filter(row=>row.stay).length},
    {value:'outpatient',label:'Outpatients',count:rows.filter(row=>!row.stay&&row.lastVisit).length},
  ];
  const careParam=params.get('care')??'all',care=views.some(view=>view.value===careParam)?careParam:'all';
  const found=useMemo(()=>{
    const searchable=rows.flatMap(row=>row.searchRecords.map(patient=>({...patient,...(!context.permissions.includes('patient:update')?{nin:undefined}:{})})));
    const ids=new Set(searchPatients(searchable,query,context.facilityId).map(patient=>patient.patientId));
    return rows.filter(row=>row.ids.some(id=>ids.has(id))&&(!care||care==='all'||(care==='today'?Boolean(todayStatus(row)):care==='balance'?owed(row).length>0:care==='inpatient'?Boolean(row.stay):!row.stay&&Boolean(row.lastVisit))));
  },[rows,query,care,context.facilityId,context.permissions.join('|'),balances.data]);
  const open=(id:string)=>navigate(patientChartPath(id,'details',{from:'/patients/search?'+params}));
  const page=Number(params.get('page')??0);
  // Newest registrations first unless the user picks another sort.
  const sortKey=params.get('sort'),sort=['patient','created'].includes(sortKey??'')?{key:sortKey!,descending:params.get('descending')==='1'}:{key:'created',descending:true};
  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><h1 className="text-[28px] font-extrabold">Patients</h1><div className="flex flex-wrap gap-2">{context.permissions.some(permission=>['patient_identity:review','patient_identity:resolve'].includes(permission))?<Button variant="outlined" fullWidth={false} onClick={()=>navigate('/patients/identity')}>Review duplicate patients</Button>:null}{context.permissions.includes('patient:create')?<Button fullWidth={false} onClick={()=>navigate('/patients/new')}>Register patient</Button>:null}</div></header>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-[1_1_320px]"><label htmlFor="patient-search" className="mb-1.5 flex min-h-5 items-center text-[13px] font-semibold text-ink-soft">Search patients</label><div className="flex items-center gap-3 rounded-field border-[1.5px] border-outline bg-white px-4 focus-within:border-2 focus-within:border-brand"><Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft"/><input id="patient-search" type="search" value={query} onChange={event=>change('q',event.target.value)} placeholder="Name, phone, ID or folder number" className="min-w-0 flex-1 border-0 bg-transparent py-3.5 text-base text-ink outline-none" autoComplete="off"/></div></div>
      <div className="w-full sm:w-60"><SelectField label="Show" value={care} onChange={event=>change('care',event.target.value==='all'?'':event.target.value)} options={views.map(view=>({value:view.value,label:view.label+(view.count!==undefined&&!directory.loading&&!directory.error?` (${view.count})`:'')}))}/></div>
      <ScanPatientCard onRead={value=>change('q',value)}/>
    </div>
    {directory.loading?<p role="status">Reading patients...</p>:directory.error?<div role="alert"><p>Patients could not be read.</p><Button onClick={directory.reload}>Try again</Button></div>:<><p className="text-sm text-ink-soft">{found.length} of {rows.length} patients</p>{found.length?<DataTable caption="Patients" uniformHeaders rows={found} rowKey={row=>row.patient.id} page={Number.isInteger(page)&&page>=0?page:0} onPageChange={value=>setParams(current=>{const next=new URLSearchParams(current);next.set('page',String(value));return next;},{replace:true})} sort={sort} onSortChange={value=>setParams(current=>{const next=new URLSearchParams(current);next.set('sort',value.key);next.set('descending',value.descending?'1':'0');next.delete('page');return next;},{replace:true})} columns={[
      {key:'patient',label:'Patient',sortValue:row=>row.patient.fullName,render:row=><div className="min-w-[120px] max-w-[260px]"><button type="button" className="min-h-0 text-left text-sm font-bold text-brand underline" onClick={()=>open(row.patient.patientId)}>{row.patient.fullName}</button>{row.patient.identityStatus==='provisional'?<Tag tone="amber" className="ml-2">Provisional</Tag>:null}<p className="text-xs text-ink-soft">{currentAge(row.patient)??'Age not recorded'} · {patientSexLabel(row.patient.sex)}</p><p className="mt-1 break-all font-mono text-xs text-ink-soft md:hidden">{row.patient.patientId}</p><div className="mt-2 md:hidden"><AdmissionStatus row={row}/></div></div>},
      {key:'patientId',label:'Patient ID',className:'hidden md:table-cell',render:row=><span className="break-all font-mono">{row.patient.patientId}</span>},
      {key:'phone',label:'Phone',className:'hidden lg:table-cell',render:row=>row.patient.phone??<span className="text-ink-soft">—</span>},
      {key:'folder',label:'Folder no.',className:'hidden lg:table-cell',render:row=>row.patient.legacyPaperRef?<span className="font-mono">{row.patient.legacyPaperRef}</span>:<span className="text-ink-soft">—</span>},
      {key:'created',label:'Created at',className:'hidden md:table-cell',sortValue:createdOn,render:row=>{const created=new Date(createdOn(row));return <>{created.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}<p className="text-xs text-ink-soft">{created.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</p></>;}},
      {key:'today',label:'Today',className:'hidden md:table-cell',render:row=>todayStatus(row)??<span className="text-ink-soft">—</span>},
      {key:'status',label:'Status',className:'hidden md:table-cell',render:row=><AdmissionStatus row={row}/>},
      ...(canBill?[{key:'balance',label:'Balance',className:'hidden lg:table-cell',render:(row:PatientDirectoryRow)=>owed(row).length?<span className="whitespace-nowrap font-mono font-bold text-amber-text">{owed(row).join(' + ')}</span>:<span className="text-ink-soft">—</span>}]:[]),
      {key:'actions',label:'Action',render:row=><Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={()=>open(row.patient.patientId)}>View details</Button>},
    ]}/>:<p className="rounded-field border border-dashed border-outline p-6">{rows.length?'No patients match these filters.':'No patients registered on this device yet.'}</p>}</>}
  </div>;
};

/** One patient list for every module: clinicians see care facts and open the chart; front desk and cashiers see administrative facts and open details. */
export const PatientSearchScreen=()=>opensChartFirst(useAuthorizationContext())?<ClinicalPatientList/>:<FrontDeskPatientList/>;
