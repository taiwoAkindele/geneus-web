import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Button, ChoiceChip, SegmentedControl, StatusPill, TextField } from '@/ui';
import type { RegNavState } from './NewPatientStep1Screen';

const OCCUPATIONS = ['Trader', 'Farmer', 'Student', 'Civil servant', 'Artisan'];

/**
 * 4.4 New patient — step 2. Occupation, religion & old folder number. Reused for
 * editing: opened pre-filled, carrying the patient forward from step 1.
 */
export const NewPatientStep2Screen = () => {
  const navigate = useNavigate();
  const state = (useLocation().state as RegNavState) ?? {};
  const p = state.patient;
  const editing = state.mode === 'edit';
  const [occupation, setOccupation] = useState(p?.occupation ?? 'Trader');
  const [religion, setReligion] = useState<'christianity' | 'islam' | 'other'>(p?.religion ?? 'christianity');

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title={editing ? 'Edit patient' : 'New patient'}
        onBack={() => navigate(-1)}
        right={
          <div className="flex items-center gap-2">
            <StatusPill status="offline" />
            <span className="font-mono text-[11px] text-ink-muted">Step 2 of 2</span>
          </div>
        }
      />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:my-8 lg:min-h-0 lg:flex-none lg:overflow-hidden lg:rounded-card lg:border lg:border-outline-soft lg:bg-white lg:shadow-card">
        <div className="flex-1 space-y-4 px-5 py-3">
          <div>
            <TextField label="Occupation" placeholder="e.g. Trader" name="patient_occupation" defaultValue={p?.occupation} />
            <div className="mt-2.5 flex flex-wrap gap-2">
              {OCCUPATIONS.map((o) => (
                <ChoiceChip
                  key={o}
                  selected={occupation === o}
                  onClick={() => setOccupation(o)}
                >
                  {o}
                  {occupation === o ? ' ✓' : ''}
                </ChoiceChip>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink-soft">Religion</div>
            <SegmentedControl
              ariaLabel="Religion"
              value={religion}
              onChange={setReligion}
              options={[
                { value: 'christianity', label: 'Christianity' },
                { value: 'islam', label: 'Islam' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </div>

          <TextField
            label="Old folder / card number"
            hint="Optional — kept so nothing from the paper file is lost"
            placeholder="e.g. paper file 2023/1187"
            name="patient_folder"
            defaultValue={p?.folder}
          />

          {/* Patient ID preview — only when creating; an existing patient keeps its ID. */}
          {!editing ? (
            <div className="rounded-[14px] bg-brand-tint px-4 py-3.5">
              <div className="text-xs text-brand-strong">A Patient ID will be created</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-brand">
                OOE-PHC-000048-<span className="opacity-50">••</span>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          <Button
            variant="primary"
            onClick={() => navigate(editing ? '/patients/profile' : '/patients/duplicate')}
          >
            {editing ? 'Save changes' : 'Register patient'}
          </Button>
        </footer>
      </div>
    </div>
  );
};
