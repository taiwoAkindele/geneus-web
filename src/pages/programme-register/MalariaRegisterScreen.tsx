import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Button, SegmentedControl, SelectField, Stat, StatusPill, Tag } from '@/ui';

type Entry = {
  date: string;
  patient: string;
  id: string;
  test: string;
  result: 'Positive' | 'Negative';
  treatment: string;
  setting: 'Facility' | 'Outreach';
};

const ENTRIES: Entry[] = [
  { date: '05 Jul', patient: 'Amaka Okoro', id: '…000047-K2', test: 'RDT', result: 'Positive', treatment: 'ACT · 3 days', setting: 'Facility' },
  { date: '05 Jul', patient: 'Segun Adio', id: '…000046-P9', test: 'RDT', result: 'Negative', treatment: '—', setting: 'Facility' },
  { date: '04 Jul', patient: 'Ngozi Umeh', id: '…000044-B3', test: 'Micro.', result: 'Positive', treatment: 'ACT · 3 days', setting: 'Outreach' },
  { date: '04 Jul', patient: 'Musa Danjuma', id: '…000041-K7', test: 'RDT', result: 'Negative', treatment: '—', setting: 'Facility' },
  { date: '03 Jul', patient: 'Blessing Eze', id: '…000039-M2', test: 'RDT', result: 'Positive', treatment: 'ACT · 3 days', setting: 'Facility' },
];

const TOTALS: { label: string; value: string; tone?: 'ink' | 'danger' | 'brand' | 'amber'; primary?: boolean; amberBox?: boolean }[] = [
  { label: 'Tested', value: '96', primary: true },
  { label: 'Positive', value: '37', tone: 'danger' },
  { label: 'Treated', value: '37', tone: 'brand' },
  { label: 'Positivity', value: '38%', tone: 'amber' },
  { label: 'RDTs used', value: '96', amberBox: true },
];

/**
 * 4.7 Programme register — Malaria. Phone: a guided one-entry-at-a-time form.
 * Desktop (records desk, responsive pattern C): the whole month as a scannable
 * data table with running totals pinned above — same data, auditable at a glance.
 */
export const MalariaRegisterScreen = () => {
  const navigate = useNavigate();
  const [test, setTest] = useState<'rdt' | 'microscopy'>('rdt');
  const [result, setResult] = useState<'positive' | 'negative'>('positive');

  return (
    <>
      {/* ---- Phone / tablet: guided form ---- */}
      <div className="flex min-h-screen flex-col bg-surface lg:hidden">
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

      {/* ---- Desktop: full data table ---- */}
      <div className="hidden min-h-screen flex-col bg-surface lg:flex">
        <div className="flex items-center justify-between px-8 pt-7">
          <div>
            <div className="text-[22px] font-extrabold tracking-[-0.02em]">Malaria register</div>
            <div className="text-[13px] text-ink-muted">July 2026 · Odo-Ona Elewe PHC</div>
          </div>
          <div className="flex gap-2.5">
            <Button variant="outlined" fullWidth={false} className="px-4 py-2.5">
              Print / export
            </Button>
            <Button variant="primary" fullWidth={false} className="px-4 py-2.5">
              ＋ New entry
            </Button>
          </div>
        </div>

        {/* Running totals */}
        <div className="flex gap-3 px-8 py-4">
          {TOTALS.map((t) => (
            <div
              key={t.label}
              className={`flex-1 rounded-[14px] px-4 py-3 ${
                t.primary
                  ? 'bg-brand text-white'
                  : t.amberBox
                    ? 'border border-amber-border bg-amber-bg'
                    : 'border border-outline-soft bg-white'
              }`}
            >
              <div className={`text-xs ${t.primary ? 'text-brand-accent-soft' : t.amberBox ? 'text-amber-text' : 'text-ink-muted'}`}>
                {t.label}
              </div>
              <div
                className={`font-mono text-2xl font-semibold ${
                  t.primary
                    ? 'text-white'
                    : t.tone === 'danger'
                      ? 'text-danger'
                      : t.tone === 'brand'
                        ? 'text-brand'
                        : t.tone === 'amber' || t.amberBox
                          ? 'text-amber-text'
                          : 'text-ink'
                }`}
              >
                {t.value}
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="px-8 pb-8">
          <div className="overflow-x-auto rounded-card border border-outline-soft bg-white">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-xs font-bold uppercase tracking-[0.04em] text-ink-muted">
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">Patient</th>
                  <th className="px-4 py-3 font-bold">Patient ID</th>
                  <th className="px-4 py-3 font-bold">Test</th>
                  <th className="px-4 py-3 font-bold">Result</th>
                  <th className="px-4 py-3 font-bold">Treatment</th>
                  <th className="px-4 py-3 font-bold">Setting</th>
                </tr>
              </thead>
              <tbody>
                {ENTRIES.map((e, i) => (
                  <tr key={i} className="border-t border-outline-soft">
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-ink-soft">{e.date}</td>
                    <td className="px-4 py-3.5 font-semibold">{e.patient}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-ink-muted">{e.id}</td>
                    <td className="px-4 py-3.5">{e.test}</td>
                    <td className="px-4 py-3.5">
                      <Tag tone={e.result === 'Positive' ? 'danger' : 'green'}>{e.result}</Tag>
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft">{e.treatment}</td>
                    <td className="px-4 py-3.5">
                      <Tag tone={e.setting === 'Outreach' ? 'amber' : 'neutral'}>{e.setting}</Tag>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-outline-soft">
                  <td colSpan={7} className="px-4 py-3 text-center text-[13px] text-ink-muted">
                    ＋ 91 more entries this month
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};
