import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, PatientIdToken } from '@/ui';
import { currentAge, searchPatients, usePatients } from '@/features/search';
import { useAuthorizationContext } from '@/session';

/** A cheap phone renders a few dozen cards comfortably; past that, a narrower search beats scrolling. */
const MAX_SHOWN = 50;

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const formatDay = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Patients — find a registered patient by ID, "47", phone or name, or add a new one (PRD §9.8.1, §10). */
export const PatientSearchScreen = () => {
  const navigate = useNavigate();
  const { facilityId } = useAuthorizationContext();
  const patients = usePatients();
  const [query, setQuery] = useState('');

  const found = useMemo(() => searchPatients(patients.data ?? [], query, facilityId), [patients.data, query, facilityId]);
  const shown = found.slice(0, MAX_SHOWN);

  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full px-5 py-4 md:px-8">
        {/* Header — title and actions share a line, wrapping on narrow phones. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate('/home')}
              className="-ml-2 flex h-10 w-10 min-h-0 flex-none items-center justify-center text-ink-soft"
            >
              <Icon name="back" className="h-6 w-6" />
            </button>
            <div>
              <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">Patients</div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">Find a patient</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="primary" fullWidth={false} className="px-4" onClick={() => navigate('/patients/new')}>
              ＋ Add patient
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-outline bg-white px-4 py-3.5">
          <Icon name="search" className="h-5 w-5 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-0 flex-1 border-0 p-0 text-base text-ink outline-none placeholder:text-ink-muted"
            placeholder="Search by name, phone or Patient ID…"
            aria-label="Search patients"
            autoComplete="off"
          />
        </div>

        <div className="mt-5 flex items-center justify-between text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
          <span>{query.trim() ? 'Matching patients' : 'Registered patients'}</span>
          {patients.data ? <span className="font-mono normal-case tracking-normal">{found.length}</span> : null}
        </div>

        {patients.loading ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading patients">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[112px] animate-pulse rounded-card bg-surface-muted" />
            ))}
          </div>
        ) : patients.error ? (
          <div className="mt-3 rounded-card border border-danger-bg bg-white p-4 text-[13px]">
            <p className="font-semibold text-danger-strong">Patients could not be read from this device.</p>
            <Button variant="outlined" fullWidth={false} className="mt-3 px-4" onClick={patients.reload}>
              Try again
            </Button>
          </div>
        ) : found.length === 0 ? (
          <div className="mt-3 rounded-card border border-dashed border-outline p-5 text-center text-[13px] text-ink-muted">
            {query.trim()
              ? 'No patient matches. Check the spelling, try their phone or patient number — or add them as a new patient.'
              : 'No patients registered on this device yet.'}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <button
                key={p.patientId}
                type="button"
                onClick={() => navigate('/patients/profile', { state: { patientId: p.patientId } })}
                className="w-full rounded-card border border-outline-soft bg-white p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <Avatar tone={p.sex === 'female' ? 'green' : 'slate'}>{initialsOf(p.fullName)}</Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-bold">{p.fullName}</div>
                    <div className="truncate text-[13px] text-ink-muted">
                      {[p.sex === 'female' ? 'F' : 'M', currentAge(p), p.address].filter((part) => part !== undefined).join(' · ')}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <PatientIdToken id={p.patientId} variant="inline" />
                  <span className="text-xs text-ink-muted">Reg. {formatDay(p.createdOn)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {found.length > MAX_SHOWN ? (
          <p className="mt-3 text-center text-xs text-ink-muted">
            Showing {MAX_SHOWN} of {found.length} — type a name, phone or number to narrow the list.
          </p>
        ) : null}

        <p className="mt-5 max-w-[66ch] pb-24 text-xs leading-relaxed text-ink-muted">
          Tap a patient card to open their profile — full details and every encounter on record. Staff can search by
          the number they say aloud: “47” finds patient 47.
        </p>
      </div>
    </div>
  );
};
