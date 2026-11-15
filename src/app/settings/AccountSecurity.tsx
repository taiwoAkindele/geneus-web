import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { RecoveryEmailCard } from '@/modules/administration/screens/facility-onboarding/RecoveryEmailCard';

/** Account recovery, with a way to this device's sync review. Staff email confirmations live in Staff. */
export const AccountSecurity = () => <div className="space-y-5">
  <section className="rounded-card border border-outline-soft bg-white p-5"><h2 className="text-lg font-bold">Administrator account recovery</h2>
    <p className="mt-1 text-sm text-ink-muted">Where a PIN code is sent if you forget your PIN.</p><div className="mt-4"><RecoveryEmailCard /></div></section>
  <p className="text-sm"><Link className="font-semibold text-brand underline" to="/sync">Sync & review on this device</Link> shows queued daily work and anything the server refused.</p>
</div>;

/** An old address of a page that now lives elsewhere: moves there, keeping its query (e.g. ?payer=…). */
export const MovedTo = ({ to }: { to: string }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
};

/** Billing and insurance setup moved from global Settings into each module: /settings/billing/fees → /billing/settings/fees. */
export const MovedFromOldSettings = () => {
  const { pathname } = useLocation();
  return <MovedTo to={pathname.replace(/^\/settings\/(billing|insurance)/, '/$1/settings')} />;
};

/** A result template's earlier address, under the old investigation catalogue. */
export const MovedTemplate = () => {
  const { templateId = '' } = useParams();
  return <MovedTo to={`/laboratory/settings/templates/${encodeURIComponent(templateId)}`} />;
};
