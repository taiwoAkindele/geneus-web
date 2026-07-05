import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Avatar, Button, StatusPill } from '@/ui';

const UNITS = ['Injection Room', 'Pharmacy', 'Antenatal Care', 'Family Planning'];

/**
 * 4.6 Send patient to another unit — an instruction travels with the patient,
 * so the receiving unit sees it the moment they walk in.
 */
export const SendToUnitScreen = () => {
  const navigate = useNavigate();
  const [unit, setUnit] = useState('Injection Room');

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Send patient to…" onBack={() => navigate(-1)} right={<StatusPill status="synced" />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <div className="flex-1 px-5 py-3">
          {/* Patient */}
          <div className="mb-4 flex items-center gap-3 rounded-[13px] bg-brand-tint px-3.5 py-3">
            <Avatar tone="green" size="sm">AO</Avatar>
            <div className="text-[15px] font-bold text-brand">Amaka Okoro · patient 47</div>
          </div>

          <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">Which unit?</div>
          <div className="mb-5 grid grid-cols-2 gap-2.5">
            {UNITS.map((u) => {
              const on = unit === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`rounded-[13px] p-4 text-left text-[15px] font-bold ${
                    on
                      ? 'border-2 border-brand bg-brand-wash text-brand'
                      : 'border-[1.5px] border-outline bg-white font-semibold text-ink-soft'
                  }`}
                >
                  {u}
                </button>
              );
            })}
          </div>

          <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">
            Instruction for the receiving unit
          </div>
          <textarea
            rows={3}
            defaultValue="Give tetanus toxoid injection (TT1). Patient has confirmed malaria — already on ACT."
            className="w-full rounded-field border-2 border-brand bg-white p-4 text-base text-ink outline-none"
          />
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
            The {unit} sees this the moment the patient walks in — no need to explain again.
          </p>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="primary" onClick={() => navigate('/home')}>
            Send to {unit}
          </Button>
        </footer>
      </div>
    </div>
  );
};
