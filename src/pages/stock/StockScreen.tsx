import { useNavigate } from 'react-router-dom';
import { AppBar, Button, StatusPill, Tag } from '@/ui';

type Item = {
  name: string;
  unit: string;
  qty: number;
  reorderAt: number;
};

const ITEMS: Item[] = [
  { name: 'Malaria RDT kits', unit: 'tests', qty: 24, reorderAt: 40 },
  { name: 'Artemether-Lumefantrine (ACT)', unit: 'packs', qty: 96, reorderAt: 30 },
  { name: 'TB sputum containers', unit: 'units', qty: 8, reorderAt: 20 },
  { name: 'FP implants', unit: 'units', qty: 12, reorderAt: 10 },
  { name: 'Tetanus toxoid (TT)', unit: 'doses', qty: 0, reorderAt: 15 },
  { name: 'Gloves (medium)', unit: 'boxes', qty: 5, reorderAt: 6 },
];

const level = (item: Item): { tone: 'green' | 'amber' | 'danger'; label: string } => {
  if (item.qty === 0) return { tone: 'danger', label: 'Out of stock' };
  if (item.qty <= item.reorderAt) return { tone: 'amber', label: 'Low' };
  return { tone: 'green', label: 'In stock' };
};

/** Basic medicine & supply stock tracker (PRD §9.1) — know what's running low. */
export const StockScreen = () => {
  const navigate = useNavigate();
  const lowCount = ITEMS.filter((i) => i.qty <= i.reorderAt).length;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Medicine & stock" onBack={() => navigate(-1)} right={<StatusPill status="synced" />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-2xl lg:max-w-3xl">
        <div className="flex items-center justify-between px-5 pb-1 pt-1">
          <p className="text-[13px] text-ink-muted">Odo-Ona Elewe PHC</p>
          {lowCount > 0 ? <Tag tone="amber">{lowCount} need reordering</Tag> : null}
        </div>

        <div className="flex-1 space-y-2.5 px-5 py-2 lg:grid lg:grid-cols-2 lg:gap-2.5 lg:space-y-0">
          {ITEMS.map((item) => {
            const l = level(item);
            return (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-card border border-outline-soft bg-white p-4"
              >
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-ink">{item.name}</div>
                  <div className="mt-0.5 text-[13px] text-ink-muted">
                    <span className="font-mono">{item.qty}</span> {item.unit} · reorder at{' '}
                    <span className="font-mono">{item.reorderAt}</span>
                  </div>
                </div>
                <Tag tone={l.tone}>{l.label}</Tag>
              </div>
            );
          })}
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="primary">Update stock counts</Button>
        </footer>
      </div>
    </div>
  );
};
