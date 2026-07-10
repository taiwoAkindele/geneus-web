import { useNavigate } from 'react-router-dom';
import { Button, Icon, Tag } from '@/ui';
import { CATEGORY_COLORS, monogram, useRegisters } from '@/features/registers';

const StatCard = ({ label, value, dot }: { label: string; value: number | string; dot: string }) => (
  <div className="rounded-[14px] border border-outline-soft bg-white px-4 py-3.5">
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: dot }} />
      <span className="text-[12px] font-semibold text-ink-muted">{label}</span>
    </div>
    <div className="mt-2 text-[30px] font-extrabold tracking-[-0.02em]">{value}</div>
  </div>
);

/** Registers index — the facility's configured registers, with a builder entry point (PRD §9.4). */
export const RegistersListScreen = () => {
  const navigate = useNavigate();
  const { registers } = useRegisters();

  const published = registers.filter((r) => r.status === 'Published').length;

  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full px-5 py-4 md:px-8">
        {/* Header */}
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
              <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">Registers</div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">Your registers</h1>
            </div>
          </div>
          <Button variant="primary" fullWidth={false} className="px-4" onClick={() => navigate('/registers/new')}>
            ＋ Create register
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatCard label="Registers" value={registers.length} dot="#006b3f" />
          <StatCard label="Published" value={published} dot="#1b3a8f" />
          <StatCard label="Draft" value={registers.length - published} dot="#e8a300" />
        </div>

        {/* Cards */}
        <div className="mt-6 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Configured registers</div>
        <div className="mt-3 grid grid-cols-1 gap-3 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {registers.map((r) => {
            const [bg, fg] = CATEGORY_COLORS[r.category] ?? ['#dcefe2', '#00502e'];
            const fieldCount = r.fields.filter((f) => f.type !== 'section').length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/registers/${r.id}`)}
                className="flex flex-col gap-3 rounded-card border border-outline-soft bg-white p-4 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] text-[15px] font-extrabold" style={{ backgroundColor: bg, color: fg }}>
                      {monogram(r.name)}
                    </span>
                    <div>
                      <div className="text-base font-bold leading-tight">{r.name}</div>
                      <div className="text-[12px] text-ink-muted">{r.category}</div>
                    </div>
                  </div>
                  <Tag tone={r.status === 'Published' ? 'green' : 'amber'}>{r.status}</Tag>
                </div>
                <p className="text-[13px] leading-relaxed text-ink-soft">{r.description}</p>
                <div className="flex items-center gap-3.5 border-t border-outline-soft pt-2.5">
                  <span className="font-mono text-xs text-ink-muted">{fieldCount} fields</span>
                  <span className="font-mono text-xs text-ink-muted">{r.rows.length} entries</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); navigate(`/registers/${r.id}/configure`); }}
                    className="ml-auto text-[13px] font-bold text-ink-muted"
                  >
                    Configure
                  </span>
                  <span className="text-[13px] font-bold text-brand">Open ›</span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="max-w-[70ch] pb-6 text-xs leading-relaxed text-ink-muted">
          Each facility configures the registers it actually keeps. Build one from scratch, define every field, then
          publish it — staff record entries against the published version.
        </p>
      </div>
    </div>
  );
};
