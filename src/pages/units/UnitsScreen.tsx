import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Unit } from '@shared';
import { AppBar, Button, Tag, TextField, useToast } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { createUnit, setUnitActive } from '@/data/repos/units';
import { useUnits } from '@/features/units';
import { useAuthorizationContext } from '@/session';

/** Rooms most facilities have — one tap adds one, so setup takes seconds (PRD §9.7, §8). */
const SUGGESTED = ['Registration', 'Consultation', 'Injection Room', 'Laboratory', 'Pharmacy', 'Antenatal Care', 'Family Planning', 'Labour Room'];

/**
 * Units & rooms (facility admin). Each facility sets up the units it actually
 * has; a small CHC may have one or two. A unit no longer used is retired, not
 * deleted — past handoffs still name it.
 */
export const UnitsScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const units = useUnits();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const all = units.data ?? [];
  const activeNames = new Set(all.filter((unit) => unit.active).map((unit) => unit.name.toLowerCase()));

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast(done);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not save — please try again', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const add = (unitName: string) =>
    run(async () => {
      await createUnit(unitName, context);
      setName('');
    }, `${unitName.trim()} added`);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) void add(name);
  };

  const toggle = (unit: Unit) =>
    run(() => setUnitActive(unit, !unit.active, context), unit.active ? `${unit.name} retired` : `${unit.name} back in use`);

  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Units & rooms" onBack={() => navigate('/admin')} right={<SyncPill />} />
      <div className="mx-auto w-full max-w-md px-5 pb-24 pt-2 md:max-w-lg">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Add the rooms this facility uses. Patients are sent between them with an instruction that travels along.
        </p>

        <form onSubmit={submit} className="mt-4 flex items-end gap-2.5">
          <div className="flex-1">
            <TextField label="New unit" name="unit_name" placeholder="e.g. Injection Room" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" variant="primary" fullWidth={false} className="px-5" disabled={busy || !name.trim()}>
            Add
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTED.filter((suggestion) => !activeNames.has(suggestion.toLowerCase())).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => void add(suggestion)}
              className="rounded-full border-[1.5px] border-outline bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-soft"
            >
              + {suggestion}
            </button>
          ))}
        </div>

        <div className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Units</div>
        {units.loading ? (
          <div className="h-[60px] animate-pulse rounded-card bg-surface-muted" />
        ) : units.error ? (
          <div className="rounded-card bg-white p-4 text-[13px] text-danger-strong">
            Units could not be read from this device.{' '}
            <button type="button" className="font-bold text-brand" onClick={units.reload}>
              Try again
            </button>
          </div>
        ) : all.length === 0 ? (
          <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">
            No units yet — add the first one above.
          </div>
        ) : (
          <div className="space-y-2">
            {all.map((unit) => (
              <div key={unit.id} className="flex items-center gap-3 rounded-card border border-outline-soft bg-white px-4 py-3">
                <div className={`min-w-0 flex-1 text-[15px] font-bold ${unit.active ? 'text-ink' : 'text-ink-muted'}`}>{unit.name}</div>
                {unit.active ? null : <Tag tone="neutral">Retired</Tag>}
                <Button variant="ghost" fullWidth={false} className="px-3 py-2" disabled={busy} onClick={() => void toggle(unit)}>
                  {unit.active ? 'Retire' : 'Use again'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
