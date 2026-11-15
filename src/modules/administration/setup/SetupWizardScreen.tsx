import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AnyDocument } from '@shared';
import { Button, Icon } from '@/ui';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { RecordEditor } from '@/modules/operations/workforce/RecordEditor';
import { RecordList, WorkspaceLoading } from '@/modules/operations/workforce/Workspaces';
import { useWorkforce } from '@/modules/operations/workforce/useWorkforce';
import { humanize, unitPath } from '@/modules/operations/workforce/presentation';
import type { EditorKind } from '@/modules/operations/workforce/editorFields';
import { CareServicesStep } from './CareServicesStep';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { FacilityDetailsStep } from './FacilityDetailsStep';
import { loadSetupFacts, readNotNeeded, SETUP_STEP_IDS, SETUP_WATCH, setupProgress, setupSteps, writeNotNeeded, type SetupStep, type SetupStepId } from './setupProgress';

const panel = 'rounded-card border border-outline-soft bg-white p-4 md:p-5';
const STATUS: Record<SetupStep['status'], { label: string; dot: string }> = {
  done: { label: 'Done', dot: 'bg-brand text-white' },
  started: { label: 'Started', dot: 'bg-amber-bg text-amber-text' },
  todo: { label: 'To do', dot: 'bg-surface-high text-ink-soft' },
  not_needed: { label: 'Not needed', dot: 'bg-surface-high text-ink-muted' },
};
const EDITORS: Partial<Record<SetupStepId, { kind: EditorKind; add: string; permission: string }>> = {
  teams: { kind: 'unit', add: 'Add team', permission: 'unit:manage' },
  places: { kind: 'location', add: 'Add place', permission: 'location:manage' },
};
const HELP: Record<SetupStepId, string> = {
  facility: 'The time zone dates every service: bills, insurance cover checks, claims and reports.',
  teams: 'Teams own responsibility for care. One care team may be enough for a primary health centre; hospitals can nest units under departments.',
  places: 'Add the real rooms, wards, beds and stores. A place can be shared by several services and is separate from the team responsible for it.',
  services: 'Choose the kinds of care this hospital provides, which team runs each and where it happens. A hospital that does not see patients for a kind of care simply leaves it out.',
  prices: 'Set the fees patients are charged, such as registration and consultation. Lab test prices are set in the Lab catalogue and medicine prices in Stock.',
  staff: 'Add the people who work here, give them their duties and plan their shifts so they can sign in.',
};
const LATER = [
  { label: 'Payment accounts', description: 'Receiving accounts for transfers and cards.', to: '/settings/billing/payments' },
  { label: 'Lab catalogue', description: 'Tests, result templates and their prices.', to: '/settings/catalogue' },
  { label: 'Pharmacy stock', description: 'Medicines, supplies and their selling prices.', to: '/stock' },
  { label: 'Insurance', description: 'Payers, contracts and claims readiness.', to: '/settings/insurance/setup' },
  { label: 'Devices', description: 'Enroll the other devices staff will use.', to: '/settings/devices' },
];

const StepEditor = ({ step }: { step: SetupStepId }) => {
  const context = useAuthorizationContext();
  const query = useWorkforce();
  const [editing, setEditing] = useState<{ previous?: AnyDocument }>();
  const editor = EDITORS[step]!;
  if (query.loading || query.error || !query.data) return <WorkspaceLoading error={query.error} reload={query.reload} />;
  const data = query.data;
  const records = step === 'teams' ? data.units : data.locations;
  const allowed = context.permissions.includes(editor.permission as never);
  return <div className="space-y-3">
    {allowed ? <StaffVerification purpose="Changing hospital setup" /> : null}
    {allowed ? <Button fullWidth={false} onClick={() => setEditing({})}><Icon name="plus" className="h-4 w-4" />{editor.add}</Button> : <p className="text-sm text-ink-muted">Your role can view these but not change them.</p>}
    <RecordList businessStatus records={records} data={data} onEdit={allowed ? (previous) => setEditing({ previous }) : undefined}
      detail={(r) => r.type === 'unit' ? `${r.kind ? humanize(r.kind) : 'Team'} · ${unitPath(r.id, data.units)}` : r.type === 'location' ? humanize(r.kind) : ''} />
    {editing ? <RecordEditor key={editing.previous?.id ?? 'new'} kind={editor.kind} previous={editing.previous} data={data} onClose={() => setEditing(undefined)} onSaved={query.reload} /> : null}
  </div>;
};

const Links = ({ items }: { items: { label: string; to: string; primary?: boolean }[] }) => <div className="flex flex-wrap gap-2">{items.map((item) =>
  <Link key={item.to} to={item.to} className={`inline-flex min-h-[44px] items-center gap-1 rounded-field px-4 text-sm font-bold ${item.primary ? 'bg-brand text-white' : 'border-[1.5px] border-outline bg-white text-brand'}`}>{item.label}<Icon name="chevron" className="h-4 w-4" /></Link>)}</div>;

const StepBody = ({ step }: { step: SetupStepId }): ReactNode => {
  if (step === 'facility') return <FacilityDetailsStep />;
  if (step === 'prices') return <Links items={[{ label: 'Open price list', to: '/settings/billing/fees', primary: true }, { label: 'Link stock prices', to: '/stock' }]} />;
  if (step === 'staff') return <Links items={[{ label: 'Open staff & access', to: '/settings/staff', primary: true }, { label: 'Invite staff', to: '/admin/staff/invite' }]} />;
  if (step === 'services') return <CareServicesStep />;
  return <StepEditor step={step} />;
};

/**
 * One guided path through everything a hospital needs to run. It reads progress
 * from the hospital's own records, never blocks the rest of the app, and lets an
 * administrator leave at any step and pick up where they left off.
 */
export const SetupWizardScreen = () => {
  const context = useAuthorizationContext();
  const [params, setParams] = useSearchParams();
  const facts = useLiveQuery(loadSetupFacts, SETUP_WATCH);
  const [notNeeded, setNotNeeded] = useState(() => readNotNeeded(context.facilityId));
  useEffect(() => { document.title = 'Set up your hospital · Geneus Health'; }, []);
  const steps = facts.data ? setupSteps(facts.data, notNeeded) : undefined;
  const progress = steps ? setupProgress(steps) : undefined;
  const requested = params.get('step') as SetupStepId | null;
  const current: SetupStepId = requested && SETUP_STEP_IDS.includes(requested) ? requested : progress?.next?.id ?? 'facility';
  const go = useCallback((id: SetupStepId) => { setParams({ step: id }); window.scrollTo({ top: 0 }); }, [setParams]);
  // On a phone the step bar scrolls sideways: keep the open step in view.
  const loaded = Boolean(facts.data);
  useEffect(() => { document.querySelector('nav[aria-label="Setup steps"] [aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [current, loaded]);
  const toggleNotNeeded = (id: SetupStepId) => setNotNeeded((before) => {
    const next = new Set(before); if (next.has(id)) next.delete(id); else next.add(id);
    writeNotNeeded(context.facilityId, next); return next;
  });
  if (facts.loading || facts.error || !steps || !progress) return <WorkspaceLoading error={facts.error} reload={facts.reload} />;
  const index = SETUP_STEP_IDS.indexOf(current), step = steps[index];
  const previous = steps[index - 1], following = steps[index + 1];

  return <div className="mx-auto w-full min-w-0 max-w-6xl space-y-5 px-4 py-5 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-extrabold">Set up your hospital</h1><p className="mt-1 max-w-2xl text-sm text-ink-muted">Everything the hospital needs to run, in one place. Progress is saved as you go; leave at any step and come back from Home.</p></div>
      <Link to="/home" className="inline-flex min-h-[44px] items-center text-sm font-bold text-brand underline">Finish later</Link>
    </header>

    <nav aria-label="Setup steps" className="relative overflow-x-auto rounded-card border border-outline-soft bg-white">
      <ol className="flex min-w-max">{steps.map((s, i) => <li key={s.id}><button type="button" onClick={() => go(s.id)} aria-current={s.id === current ? 'step' : undefined}
        className={`flex min-h-[56px] items-center gap-2 border-b-[3px] px-4 text-sm ${s.id === current ? 'border-brand font-bold text-brand' : 'border-transparent text-ink-soft hover:text-brand'}`}>
        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${STATUS[s.status].dot}`} aria-hidden="true">{s.status === 'done' ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}</span>
        {s.label}<span className="sr-only">, {STATUS[s.status].label}</span></button></li>)}</ol>
    </nav>
    <p className="text-sm text-ink-soft" role="status">{progress.complete ? 'Setup is complete. You can still change anything here or in Settings.' : `${progress.settled} of ${progress.total} steps done or set aside.`}</p>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-labelledby="setup-step" className={`${panel} min-w-0 space-y-4`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Step {index + 1} of {steps.length} · {STATUS[step.status].label}</p><h2 id="setup-step" className="mt-1 text-xl font-extrabold">{step.label}</h2><p className="mt-1 text-sm font-semibold">{step.summary}</p></div>
        </div>
        <p className="max-w-3xl text-sm text-ink-muted">{HELP[step.id]}</p>
        {step.notes.length ? <ul className="space-y-1 rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">{step.notes.map((note) => <li key={note} className="flex gap-2"><Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />{note}</li>)}</ul> : null}
        <StepBody step={step.id} />
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-soft pt-4">
          <div className="flex flex-wrap gap-2">
            {previous ? <Button fullWidth={false} variant="outlined" onClick={() => go(previous.id)}>Back: {previous.label}</Button> : null}
            {step.status !== 'done' ? <Button fullWidth={false} variant="ghost" onClick={() => toggleNotNeeded(step.id)}>{step.status === 'not_needed' ? 'We need this after all' : 'Not needed here'}</Button> : null}
          </div>
          {following ? <Button fullWidth={false} onClick={() => go(following.id)}>Next: {following.label}</Button> : <Link to="/home" className="inline-flex min-h-[44px] items-center rounded-field bg-brand px-5 text-sm font-bold text-white">Go to Home</Link>}
        </footer>
      </section>

      <aside className="min-w-0 space-y-3">
        <section className={panel}><h2 className="font-bold">When you need them</h2><p className="mt-1 text-sm text-ink-muted">Not every hospital needs these on day one.</p>
          <ul className="mt-3 divide-y divide-outline-soft">{LATER.map((item) => <li key={item.to}><Link to={item.to} className="flex min-h-[56px] items-center justify-between gap-2 py-2 hover:text-brand"><span><span className="block text-sm font-bold">{item.label}</span><span className="block text-xs text-ink-muted">{item.description}</span></span><Icon name="chevron" className="h-4 w-4 text-ink-muted" /></Link></li>)}</ul>
        </section>
      </aside>
    </div>
  </div>;
};
