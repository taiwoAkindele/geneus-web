import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Button, SegmentedControl, StatusPill, TextField } from '@/ui';

export type RegPatient = {
  fullName?: string;
  sex?: 'F' | 'M';
  age?: string;
  phone?: string;
  address?: string;
  occupation?: string;
  religion?: 'christianity' | 'islam' | 'other';
  folder?: string;
};
export type RegNavState = { patient?: RegPatient; mode?: 'edit' | 'new' } | null;

/**
 * 4.3 New patient — step 1. Only the fields Nigerian facilities already use.
 * Writes go to the device first, so this works offline. Reused for editing an
 * existing patient — opened pre-filled from the profile via navigation state.
 */
export const NewPatientStep1Screen = () => {
  const navigate = useNavigate();
  const state = (useLocation().state as RegNavState) ?? {};
  const p = state.patient;
  const editing = state.mode === 'edit';
  const [sex, setSex] = useState<'F' | 'M'>(p?.sex ?? 'F');

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title={editing ? 'Edit patient' : 'New patient'}
        onBack={() => navigate(-1)}
        right={
          <div className="flex items-center gap-2">
            <StatusPill status="offline" />
            <span className="font-mono text-[11px] text-ink-muted">Step 1 of 2</span>
          </div>
        }
      />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:my-8 lg:min-h-0 lg:flex-none lg:overflow-hidden lg:rounded-card lg:border lg:border-outline-soft lg:bg-white lg:shadow-card">
        <div className="flex-1 space-y-4 px-5 py-3">
          <TextField label="Full name" placeholder="e.g. Amaka Okoro" name="patient_name" defaultValue={p?.fullName} />

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="mb-1.5 text-[13px] font-semibold text-ink-soft">Sex</div>
              <SegmentedControl
                ariaLabel="Sex"
                value={sex}
                onChange={setSex}
                options={[
                  { value: 'F', label: 'F' },
                  { value: 'M', label: 'M' },
                ]}
              />
            </div>
            <div className="w-24">
              <TextField label="Age" type="number" inputMode="numeric" placeholder="32" name="patient_age" defaultValue={p?.age} />
            </div>
          </div>

          <TextField
            label="Date of birth"
            type="date"
            hint="Approximate is fine"
            name="patient_dob"
          />
          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            hint="Best way to find them again"
            placeholder="0803 555 0147"
            name="patient_phone"
            defaultValue={p?.phone}
          />
          <TextField
            label="Address"
            placeholder="e.g. 14 Odo-Ona Elewe, Ibadan"
            name="patient_address"
            defaultValue={p?.address}
          />
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          <Button variant="primary" onClick={() => navigate('/patients/new/details', { state })}>
            Continue — Occupation &amp; Religion
          </Button>
        </footer>
      </div>
    </div>
  );
};
