import { useNavigate } from 'react-router-dom';
import { AppBar, Button } from '@/ui';
import { SyncPill } from './SyncPill';

export const UnavailableScreen = ({ title, description }: { title: string; description: string }) => {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-surface"><AppBar title={title} onBack={() => navigate('/home')} right={<SyncPill />} /><div className="mx-auto max-w-xl px-5 py-8"><div className="rounded-card border border-outline-soft bg-white p-5"><h1 className="text-xl font-bold">{title}</h1><p className="mt-3 text-[15px] leading-relaxed text-ink-muted">{description}</p><Button variant="outlined" className="mt-5" onClick={() => navigate('/home')}>Back to home</Button></div></div></div>;
};
