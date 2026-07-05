import { useNavigate } from 'react-router-dom';
import { AppBar, Button, StatusPill } from '@/ui';

const Metric = ({
  label,
  value,
  trend,
  trendTone,
}: {
  label: string;
  value: string;
  trend?: string;
  trendTone?: 'up-bad' | 'down-good' | 'flat';
}) => {
  const color =
    trendTone === 'up-bad' ? 'text-danger' : trendTone === 'down-good' ? 'text-brand-strong' : 'text-ink-muted';
  return (
    <div className="rounded-card border border-outline-soft bg-white p-3.5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[26px] font-semibold text-ink">{value}</span>
        {trend ? <span className={`text-xs font-bold ${color}`}>{trend}</span> : null}
      </div>
    </div>
  );
};

const SupplyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between py-0.5 text-[13px] text-amber-text">
    <span>{label}</span>
    <b className="font-mono">{value}</b>
  </div>
);

/** 4.8 This month at a glance — the facility's own numbers, ready for the LGA. */
export const MonthlySummaryScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="This month" onBack={() => navigate(-1)} right={<StatusPill status="synced" />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-2xl">
        <div className="px-5 pb-1 text-[13px] text-ink-muted">July 2026 · Odo-Ona Elewe PHC</div>

        <div className="flex-1 space-y-3 px-5 py-2">
          {/* Headline */}
          <div className="rounded-[18px] bg-brand px-5 py-4 text-white">
            <div className="text-[13px] text-brand-accent-soft">Total attendance</div>
            <div className="mt-0.5 flex items-end gap-2.5">
              <span className="font-mono text-[40px] font-semibold leading-none">1,204</span>
              <span className="pb-1.5 text-[13px] text-brand-accent">▲ 8% vs June</span>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Malaria positivity" value="38%" trend="▲" trendTone="up-bad" />
            <Metric label="Immunisation dropout" value="6%" trend="▼" trendTone="down-good" />
            <Metric label="ANC 4th visit" value="72%" trend="▬" trendTone="flat" />
            <Metric label="Referrals made" value="14" />
          </div>

          {/* Supply request */}
          <div className="rounded-card border border-amber-border bg-amber-bg p-4">
            <div className="mb-1.5 text-sm font-bold text-amber-text">
              Ready for your LGA supply request
            </div>
            <SupplyRow label="RDTs used" value="96" />
            <SupplyRow label="TB samples tested" value="11" />
            <SupplyRow label="FP implants dispensed" value="23" />
          </div>
        </div>

        <footer className="flex gap-2.5 px-5 pb-6 pt-4">
          <Button variant="outlined">Print</Button>
          <Button variant="primary">Submit to LGA</Button>
        </footer>
      </div>
    </div>
  );
};
