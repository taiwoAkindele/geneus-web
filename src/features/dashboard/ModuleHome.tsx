import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/ui';
import { useSession } from '@/session';
import { useWorkspace } from '@/app/useWorkspace';
import { workspacePath } from '@/app/workspaces';
import { NotificationList } from '@/app/NotificationList';

export const ModuleHome = () => {
  const { available, resume } = useWorkspace();
  const { notifications, notificationsLoading, notificationsError } = useSession();
  useEffect(() => { document.title = 'Your workspace · Geneus Health'; }, []);
  return <div className="mx-auto w-full max-w-[1240px] px-5 pb-10 pt-9 md:px-9 md:pt-14 lg:px-7">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="text-[30px] font-extrabold leading-tight tracking-[-0.025em] md:text-[38px]">Your workspace</h1><p className="mt-1 text-base text-ink-muted md:text-lg">Choose a module to start work.</p></div>
      {resume ? <Link to={workspacePath(resume.id)} className="inline-flex min-h-[52px] items-center gap-3 rounded-card border border-outline-soft bg-white px-5 py-3 text-sm font-bold text-brand transition-colors hover:border-brand hover:bg-brand-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"><Icon name="clock" className="h-5 w-5" />Continue in {resume.label}<Icon name="arrow-right" className="ml-2 h-5 w-5" /></Link> : null}
    </header>
    <nav aria-label="Your modules" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {available.map((workspace) => <Link key={workspace.id} to={workspacePath(workspace.id)} className={`group flex min-h-[132px] items-center gap-4 rounded-card border border-outline-soft bg-white px-5 py-6 transition-colors hover:border-brand hover:bg-brand-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:gap-5 md:px-6 ${workspace.id === 'administration' ? 'md:min-h-[128px]' : 'md:min-h-[146px]'}`}>
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] md:h-16 md:w-16 ${workspace.id === 'clinical' ? 'bg-brand-tint text-brand' : 'bg-surface text-ink'}`}><Icon name={workspace.icon} className="h-7 w-7 md:h-8 md:w-8" /></span>
        <span className="min-w-0 flex-1"><span className="block text-lg font-extrabold leading-snug">{workspace.label}</span><span className="mt-2 block text-[15px] leading-relaxed text-ink-muted">{workspace.description}</span></span>
        <Icon name="arrow-right" className="h-5 w-5 text-brand transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
      </Link>)}
    </nav>
    <section aria-labelledby="workspace-attention" className="mt-10 border-t border-outline-soft pt-6 md:mt-11">
      <h2 id="workspace-attention" className="mb-4 text-[23px] font-extrabold">Needs your attention</h2>
      <div className="overflow-hidden rounded-card border border-outline-soft bg-white"><NotificationList notifications={notifications.slice(0, 4)} loading={notificationsLoading} error={notificationsError} onDone={() => undefined} /></div>
      {notifications.length > 4 ? <Link to="/sync" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand">Review all records<Icon name="arrow-right" className="h-4 w-4" /></Link> : null}
    </section>
  </div>;
};
