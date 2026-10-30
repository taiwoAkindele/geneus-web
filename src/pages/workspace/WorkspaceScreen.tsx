import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Icon } from '@/ui';
import { useWorkspace } from '@/app/useWorkspace';
import { WorkforceHome } from '@/features/workforce/WorkforceHome';
import { useAuthorizationContext } from '@/session';

export const WorkspaceScreen = () => {
  const { moduleId } = useParams();
  const { available } = useWorkspace();
  const context = useAuthorizationContext();
  const workspace = available.find((item) => item.id === moduleId);
  useEffect(() => { document.title = `${workspace?.label ?? 'Workspace'} · Geneus Health`; }, [workspace?.label]);
  if (!workspace) return <Navigate to="/home" replace />;
  return <div className="mx-auto w-full max-w-[1120px] px-5 py-7 md:px-8 md:py-10">
    <header className="mb-8 flex items-start gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-card bg-brand-tint text-brand"><Icon name={workspace.icon} className="h-7 w-7" /></span>
      <div><h1 className="text-[30px] font-extrabold tracking-tight">{workspace.label}</h1><p className="mt-1 text-base text-ink-muted">{workspace.description}.</p></div>
    </header>
    <section aria-label={`${workspace.label} actions`} className="overflow-hidden rounded-card border border-outline-soft bg-white">
      <h2 className="border-b border-outline-soft px-5 py-4 text-lg font-bold">Your work</h2>
      <ul className="divide-y divide-outline-soft">{workspace.links.map((item) => <li key={item.key}>
        <Link to={item.to} className="flex min-h-[92px] items-center gap-4 px-5 py-5 transition-colors hover:bg-brand-wash focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand">
          <Icon name={item.icon} className="h-6 w-6 text-brand" /><span className="min-w-0 flex-1"><span className="block text-base font-bold">{item.label}</span><span className="mt-1 block text-sm leading-relaxed text-ink-muted">{item.description}</span></span><Icon name="chevron" className="h-5 w-5 text-brand" />
        </Link>
      </li>)}</ul>
    </section>
    {workspace.id === 'clinical' && context.permissions.includes('encounter:record') ? <WorkforceHome /> : null}
    <p className="mt-6 text-xs leading-relaxed text-ink-muted">Showing the work available to your account. Records on this device update when it syncs. <Link to="/sync" className="font-semibold text-brand underline">Sync &amp; review</Link></p>
  </div>;
};
