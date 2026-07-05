import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Button, SegmentedControl, SelectField, Stat, StatusPill, Tag } from '@/ui';

/**
 * 4.7 Programme register — Malaria. Replaces the paper book and counts itself.
 * Result uses a semantic red (Positive) rather than the default green select.
 */
export const MalariaRegisterScreen = () => {
  const navigate = useNavigate();
  const [test, setTest] = useState<'rdt' | 'microscopy'>('rdt');
  const [result, setResult] = useState<'positive' | 'negative'>('positive');

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title="Malaria register"
        onBack={() => navigate(-1)}
        right={
          <div className="flex items-center gap-2">
            <StatusPill status="pending">Offline · 5 pending</StatusPill>
            <Tag tone="neutral">Facility</Tag>
          </div>
        }
      />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <div className="flex-1 space-y-5 px-5 py-3">
          <div>
            <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">Test done</div>
            <SegmentedControl
              ariaLabel="Test done"
              value={test}
              onChange={setTest}
              options={[
                { value: 'rdt', label: 'RDT' },
                { value: 'microscopy', label: 'Microscopy' },
              ]}
            />
          </div>

          <div>
            <div className="mb-2.5 text-[13px] font-semibold text-ink-soft">Result</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResult('positive')}
                className={`flex-1 rounded-xl px-2 py-3.5 text-center text-[15px] ${
                  result === 'positive'
                    ? 'border-2 border-danger bg-danger-bg font-extrabold text-danger-strong'
                    : 'border-[1.5px] border-outline bg-white font-bold text-ink-soft'
                }`}
              >
                Positive
              </button>
              <button
                type="button"
                onClick={() => setResult('negative')}
                className={`flex-1 rounded-xl px-2 py-3.5 text-center text-[15px] font-bold ${
                  result === 'negative'
                    ? 'bg-brand text-white'
                    : 'border-[1.5px] border-outline bg-white text-ink-soft'
                }`}
              >
                Negative
              </button>
            </div>
          </div>

          <SelectField
            label="Treated with"
            name="malaria_treatment"
            options={[
              { value: 'act', label: 'Artemether-Lumefantrine (ACT)' },
              { value: 'aa', label: 'Artesunate-Amodiaquine' },
              { value: 'quinine', label: 'Quinine' },
              { value: 'none', label: 'None' },
            ]}
          />

          <div className="rounded-card bg-surface-muted p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
              This month · counts itself
            </div>
            <div className="flex justify-between text-center">
              <Stat value="96" label="Tested" tone="ink" />
              <Stat value="37" label="Positive" tone="danger" />
              <Stat value="37" label="Treated" />
              <Stat value="38%" label="Positivity" tone="amber" />
            </div>
          </div>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="primary" onClick={() => navigate(-1)}>
            Save entry
          </Button>
        </footer>
      </div>
    </div>
  );
};
