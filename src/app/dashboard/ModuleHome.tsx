import { Link } from 'react-router-dom';
import { Icon } from '@/ui';
import { useWorkspace } from '@/app/useWorkspace';
import { moduleStart } from '@/app/workspaces';

/**
 * The modules this person can open. Home leads with their work (Dashboard);
 * the modules sit underneath for everything else.
 */
export const ModuleGrid = () => {
  const { available, resume } = useWorkspace();
  return <section aria-labelledby="home-modules" className="mx-auto w-full max-w-[1280px] px-4 pb-10 md:px-7">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-outline-soft pt-6">
      <h2 id="home-modules" className="text-[21px] font-extrabold">Your modules</h2>
      {resume ? <Link to={moduleStart(resume)} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-brand"><Icon name="clock" className="h-4 w-4" />Continue in {resume.label}<Icon name="arrow-right" className="h-4 w-4" /></Link> : null}
    </div>
    <nav aria-label="Your modules" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {available.map((workspace) => <Link key={workspace.id} to={moduleStart(workspace)} className="group flex min-h-[76px] items-center gap-3 rounded-card border border-outline-soft bg-white px-4 py-3 transition-colors hover:border-brand hover:bg-brand-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${workspace.id === 'clinical' ? 'bg-brand-tint text-brand' : 'bg-surface text-ink'}`}><Icon name={workspace.icon} className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1"><span className="block font-extrabold leading-snug">{workspace.label}</span><span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{workspace.description}</span></span>
        <Icon name="arrow-right" className="h-4 w-4 text-brand" />
      </Link>)}
    </nav>
  </section>;
};
