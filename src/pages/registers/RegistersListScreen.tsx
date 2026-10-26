import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuthorizationContext } from '@/session';
import { Button, SectionTabs, Tag } from '@/ui';
import { useRegisters } from '@/features/registers';

export const RegistersListScreen = () => {
  const query = useRegisters(), [params, setParams] = useSearchParams();
  const canConfigure = useAuthorizationContext().permissions.includes('register_definition:publish');
  const view = canConfigure && params.get('view') === 'drafts' ? 'drafts' : 'published';
  const published = query.registers.filter((register) => register.status === 'published');
  const drafts = query.registers.filter((register) => register.hasDraft);
  const shown = view === 'drafts' ? drafts : published;
  useEffect(() => { document.title = 'Registers · Geneus Health'; }, []);
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24 md:px-7"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Registers</h1><p className="mt-1 text-sm text-ink-soft">Open a published register to record entries. Configuration drafts are kept separate.</p></div>{canConfigure ? <Link className="inline-flex min-h-[52px] items-center rounded-field bg-brand px-4 py-3 font-bold text-white" to="/registers/new">Create register</Link> : null}</header>
    <SectionTabs label="Register sections" value={view} onChange={(value) => setParams(value === 'drafts' ? { view: value } : {})} options={[{ value: 'published', label: 'Published', count: query.loading || query.error ? undefined : published.length }, ...(canConfigure ? [{ value: 'drafts', label: 'Drafts', count: query.loading || query.error ? undefined : drafts.length }] : [])]} />
    {query.loading ? <p role="status">Reading registers…</p> : query.error ? <div role="alert"><p>Registers could not be read.</p><Button variant="ghost" onClick={query.reload}>Try again</Button></div> : shown.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((register) => {
      const shown = view === 'drafts' ? register.configuration : register;
      return <article key={register.id} className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 text-lg font-extrabold">{shown.name}</h2><Tag tone={view === 'drafts' ? 'amber' : 'green'}>{view === 'drafts' ? 'Draft' : 'Published'}</Tag></div><p className="text-xs text-ink-muted">{shown.category} · Version {shown.version}</p><p className="text-sm text-ink-soft">{shown.description || 'No instructions recorded.'}</p><p className="text-xs text-ink-muted">{shown.fields.filter((field) => field.type !== 'section').length} questions · {register.rows.length} saved entries</p>{canConfigure && register.hasDraft && register.status === 'published' ? <p className="text-xs text-ink-muted">A configuration draft is in progress. Staff still use published version {register.version}.</p> : null}<div className="flex flex-wrap gap-3 border-t border-outline-soft pt-2">{register.status === 'published' ? <Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to={'/registers/' + encodeURIComponent(register.id)}>Open register</Link> : null}{canConfigure ? <Link className="inline-flex min-h-[44px] items-center font-bold text-ink-soft" to={'/registers/' + encodeURIComponent(register.id) + '/configure'}>{view === 'drafts' ? 'Resume draft' : 'Configure'}</Link> : null}</div></article>;
    })}</div> : <div className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-soft">{view === 'drafts' ? 'No saved configuration drafts. Use Save draft in the builder to return to unfinished work.' : canConfigure ? 'No published registers yet. Create a register or resume one from Drafts.' : 'No published registers on this device. A permitted staff member can configure one.'}</div>}
  </div>;
};
