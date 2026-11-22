import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorizationContext, StaffVerification } from '@/session';
import { billingRequest } from '@/lib/api/billing';
import { Button } from '@/ui';

type Status = {
  enabled: boolean;
  legacyTokensUntil: string;
  devices: { id: string; label: string | null; blockers: string[] }[];
};

const Readiness = () => {
  const context = useAuthorizationContext();
  const [status, setStatus] = useState<Status>();
  const [integrated, setIntegrated] = useState<Status>();
  const [error, setError] = useState('');

  const reload = useCallback(
    () =>
      Promise.all([
        billingRequest<Status>(context, 'catalogue/readiness', {}),
        billingRequest<Status>(context, 'integrated/readiness', {}),
      ]).then(
        ([catalogue, financial]) => {
          setStatus(catalogue);
          setIntegrated(financial);
          setError('');
        },
        (cause) =>
          setError(
            cause instanceof Error ? cause.message : 'Device compatibility could not be read',
          ),
      ),
    [context],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section
      className="space-y-2 rounded-card border border-outline-soft p-3"
      aria-label="Catalogue compatibility"
    >
      <h2 className="font-bold">Catalogue compatibility</h2>
      {status?.enabled ? (
        <p>Expanded catalogue supported. New accepted items appear through normal sync.</p>
      ) : (
        <>
          <p>
            Existing prices and cash collection remain available. New categories wait for compatible
            active devices and older sync tokens.
          </p>
          {status ? (
            <>
              <p className="text-sm">
                Token safety window ends{' '}
                {new Date(status.legacyTokensUntil).toLocaleString('en-GB')}. Tokens already issued
                to retired devices must also expire.
              </p>
              <ul>
                {status.devices
                  .filter((d) => d.blockers.length)
                  .map((d) => (
                    <li key={d.id} className="my-2 text-sm">
                      <strong>{d.label ?? d.id}</strong>: {d.blockers.join('. ')}
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
        </>
      )}
      <h3 className="font-bold">Service associations and patient statements</h3>
      {integrated?.enabled ? (
        <p>
          Integrated financial records supported. Associations remain pending until server
          acceptance; offline cash collection stays available.
        </p>
      ) : (
        <>
          <p className="text-sm">
            These capabilities wait for compatible financial readers, uploaded queues and expiration
            of older tokens.
          </p>
          {integrated ? (
            <>
              <p className="text-sm">
                Financial token safety window ends{' '}
                {new Date(integrated.legacyTokensUntil).toLocaleString('en-GB')}.
              </p>
              <ul>
                {integrated.devices
                  .filter((d) => d.blockers.length)
                  .map((d) => (
                    <li key={d.id} className="text-sm">
                      <strong>{d.label ?? d.id}</strong>: {d.blockers.join('. ')}
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
      <Button variant="ghost" fullWidth={false} onClick={() => void reload()}>
        Refresh compatibility
      </Button>
      <Link
        className="inline-flex min-h-[44px] items-center font-bold text-brand"
        to="/admin/devices"
      >
        Manage devices and retire inactive devices
      </Link>
    </section>
  );
};

export const CatalogueReadiness = () => (
  <StaffVerification requireServerSession purpose="Checking financial client compatibility">
    <Readiness />
  </StaffVerification>
);
