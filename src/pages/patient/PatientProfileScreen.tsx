import { useNavigate } from 'react-router-dom';
import { AppBar, Avatar, Button, StatusPill, Tag } from '@/ui';

const PATIENT = {
  name: 'Amaka Okoro',
  initials: 'AO',
  id: 'OOE-PHC-000047-K2',
  allergy: 'Penicillin',
  facts: [
    { label: 'Age / Sex', value: '32 · F' },
    { label: 'Phone', value: '0803 555 0147' },
    { label: 'Community', value: 'Odo-Ona Elewe, Ibadan' },
    { label: 'Blood group', value: 'O+' },
    { label: 'Registered', value: '12 Jun 2026' },
    { label: 'Occupation', value: 'Trader' },
  ],
};

// The patient's current details, shaped for the registration form so "Edit
// patient details" opens that form pre-filled.
const EDIT_FIELDS = {
  fullName: 'Amaka Okoro',
  sex: 'F' as const,
  age: '32',
  phone: '0803 555 0147',
  address: 'Odo-Ona Elewe, Ibadan',
  occupation: 'Trader',
  religion: 'christianity' as const,
  folder: '',
};

const PATIENT_REF = { id: PATIENT.id, name: PATIENT.name, initials: PATIENT.initials, allergy: PATIENT.allergy };

type EncItem = { id: string; title: string; date: string; facility: string; status: 'Open' | 'Closed'; chips: string[] };

const ENCOUNTERS: EncItem[] = [
  { id: 'OOE-ENC-000318', title: 'Encounter in progress', date: '07 Jul 2026', facility: 'Odo-Ona Elewe PHC', status: 'Open', chips: ['38.9°C', '118/76', '2 tests'] },
  { id: 'OOE-ENC-000291', title: 'Malaria — recovery review', date: '14 Jun 2026', facility: 'Odo-Ona Elewe PHC', status: 'Closed', chips: ['Follow-up', '37.1°C', 'Improving'] },
  { id: 'OOE-ENC-000276', title: 'Malaria (RDT positive)', date: '12 Jun 2026', facility: 'Odo-Ona Elewe PHC', status: 'Closed', chips: ['38.9°C', '118/76', 'ACT · 3 days'] },
];

/** Patient profile — details + every encounter on record (PRD §9.8 / §10). */
export const PatientProfileScreen = () => {
  const navigate = useNavigate();

  const openEncounter = (e: EncItem) => {
    navigate('/encounter', {
      state: { patient: PATIENT_REF, init: { encId: e.id, date: e.date, closed: e.status === 'Closed' } },
    });
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Patient profile" onBack={() => navigate('/patients/search')} right={<StatusPill status="synced" />} />
      <div className="mx-auto max-w-2xl px-5 py-2 lg:max-w-3xl">
        {/* profile header */}
        <div className="rounded-card bg-brand p-5 text-white">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar tone="mint">{PATIENT.initials}</Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-[22px] font-extrabold tracking-[-0.02em]">{PATIENT.name}</div>
              <div className="font-mono text-[13px] text-brand-accent-soft">{PATIENT.id}</div>
            </div>
            <span className="rounded-full bg-danger-bg px-3 py-1.5 text-[12px] font-bold text-danger-strong">⚠ Allergy: {PATIENT.allergy}</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3">
            {PATIENT.facts.map((f) => (
              <div key={f.label}>
                <div className="text-[11px] uppercase tracking-[0.04em] text-brand-accent-soft">{f.label}</div>
                <div className="mt-0.5 text-[15px] font-semibold">{f.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              fullWidth={false}
              className="bg-brand-accent-soft px-5 text-brand"
              onClick={() => navigate('/encounter', { state: { patient: PATIENT_REF } })}
            >
              ＋ Create encounter
            </Button>
            <Button
              variant="ghost"
              fullWidth={false}
              className="bg-white/15 px-5 text-white"
              onClick={() => navigate('/patients/new', { state: { patient: EDIT_FIELDS, mode: 'edit' } })}
            >
              Edit patient details
            </Button>
          </div>
        </div>

        {/* encounters */}
        <div className="mb-3 mt-6 flex items-center justify-between">
          <span className="text-[15px] font-extrabold tracking-[-0.01em]">Encounters</span>
          <span className="font-mono text-xs text-ink-muted">{ENCOUNTERS.length} on record</span>
        </div>
        <div className="space-y-3 pb-24">
          {ENCOUNTERS.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => openEncounter(e)}
              className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[17px] font-bold text-ink">{e.title}</div>
                  <div className="text-[13px] text-ink-muted">{e.date} · {e.facility}</div>
                </div>
                <Tag tone={e.status === 'Open' ? 'amber' : 'neutral'}>{e.status}</Tag>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {e.chips.map((c) => (
                  <span key={c} className="rounded-md bg-surface-muted px-2 py-1 font-mono text-[11px] text-ink-soft">{c}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
