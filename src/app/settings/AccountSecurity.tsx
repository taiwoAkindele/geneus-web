import { Link, Navigate, useLocation } from 'react-router-dom';
import { RecoveryEmailCard } from '@/modules/administration/screens/facility-onboarding/RecoveryEmailCard';
import { EmailConfirmationsCard } from '@/modules/administration/screens/facility-onboarding/EmailConfirmationsCard';

/** Account recovery and staff email addresses, with a way to this device's sync review. */
export const AccountSecurity = () => <div className="space-y-5">
  <section className="rounded-card border border-outline-soft bg-white p-5"><h2 className="text-lg font-bold">Administrator account recovery</h2>
    <p className="mt-1 text-sm text-ink-muted">Where a PIN code is sent if you forget your PIN.</p><div className="mt-4"><RecoveryEmailCard /></div></section>
  <EmailConfirmationsCard />
  <p className="text-sm"><Link className="font-semibold text-brand underline" to="/sync">Sync & review on this device</Link> shows queued daily work and anything the server refused.</p>
</div>;

/** An old address of a page that now lives under Settings: moves there, keeping its query (e.g. ?payer=…). */
export const MovedTo = ({ to }: { to: string }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
};
