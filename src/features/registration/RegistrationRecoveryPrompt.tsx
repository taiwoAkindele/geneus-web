import { type ReactNode, useState } from 'react';
import { AppBar, Button, Icon } from '@/ui';
import { useNavigate } from 'react-router-dom';
import { useRegistrationRecovery } from './RegistrationDraftProvider';

export const RegistrationRecoveryStatus = () => {
  const { recovery, status } = useRegistrationRecovery();
  return <div aria-live="polite" className={`text-xs leading-relaxed ${status.error ? 'text-danger' : 'text-ink-muted'}`}>
    {status.error ? <div role="alert"><p>{status.error}</p><button type="button" onClick={() => void recovery.retry().catch(() => {})} className="min-h-11 font-bold underline">Retry draft save</button></div>
      : status.pending ? 'Saving your private draft…' : status.savedAt ? 'Your unfinished form is saved privately on this device.' : 'Your draft stays private to your account on this device.'}
  </div>;
};

export const RegistrationRecoveryGate = ({ draftKey = 'new', children }: { draftKey?: string; children: ReactNode }) => {
  const { recovery, status } = useRegistrationRecovery();
  const navigate = useNavigate();
  const [choosing, setChoosing] = useState(() => recovery.needsChoice(draftKey));
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState('');
  if (status.unreadable) return <div className="min-h-screen bg-surface">
    <AppBar title="Registration recovery" onBack={() => navigate('/workspace/front-desk')} />
    <section className="mx-auto max-w-lg space-y-5 px-5 py-8">
      <div role="alert"><h1 className="text-2xl font-extrabold">Your saved form could not be opened</h1><p className="mt-3 text-sm leading-relaxed text-ink-muted">Your existing draft has been kept. Reload to try opening it again. Keep this device without clearing its storage.</p></div>
      <Button onClick={() => window.location.reload()}>Reload recovery</Button>
    </section>
  </div>;
  if (!choosing) return children;
  return <div className="min-h-screen bg-surface">
    <AppBar title="Unfinished registration" onBack={() => navigate('/workspace/front-desk')} />
    <section className="mx-auto max-w-lg space-y-5 px-5 py-8">
      <Icon name="patients" className="h-9 w-9 text-brand" />
      <h1 className="text-2xl font-extrabold">Resume your unfinished form?</h1>
      <p className="text-sm leading-relaxed text-ink-soft">You have an unfinished {draftKey === 'new' ? 'registration' : 'patient edit'} saved privately on this device. Choose whether to continue or discard it.</p>
      <Button disabled={discarding || Boolean(error)} onClick={() => { recovery.resume(draftKey); setChoosing(false); }}>Resume registration</Button>
      <Button variant="outlined" loading={discarding} onClick={async () => {
        setDiscarding(true); setError('');
        try { await recovery.discard(draftKey); setChoosing(false); }
        catch { setError('The draft could not be removed from this device. Keep this page open and try again.'); }
        finally { setDiscarding(false); }
      }}>Discard draft</Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <p className="text-xs text-ink-muted">Discarding this form does not remove a saved patient record.</p>
    </section>
  </div>;
};
