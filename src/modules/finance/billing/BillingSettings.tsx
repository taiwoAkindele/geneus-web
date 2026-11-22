import { StaffVerification, useStaffVerification, useAuthorizationContext } from '@/session';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, ChoiceChip, SelectField, TextField, useToast } from '@/ui';
import { billingRequest, type BillingConnection, type ProviderDescriptor } from '@/lib/api/billing';
import { userMessage } from '@/lib/api/userMessage';
import { internationalPhone } from './phone';

type AccountField = ProviderDescriptor['accountFields'][number];

/** Secrets never autofill; phone and email fields use the keyboard and autofill made for them. */
const inputTypeFor = (field: AccountField): 'password' | 'email' | 'text' => {
  if (field.sensitive) {
    return 'password';
  }

  if (field.type === 'email') {
    return 'email';
  }

  return 'text';
};

const inputModeFor = (field: AccountField): 'tel' | 'email' | undefined => {
  if (field.type === 'tel' || field.type === 'email') {
    return field.type;
  }

  return undefined;
};

const autoCompleteFor = (field: AccountField): string => {
  if (field.sensitive) {
    return 'off';
  }

  if (field.type === 'tel' || field.type === 'email') {
    return field.type;
  }

  return 'off';
};

const accountStepStatus = (
  general: { bankName: string; accountNumber: string; accountName: string } | undefined,
  providerConnected: boolean,
): string => {
  if (general) {
    return `${general.bankName} · ${general.accountNumber} · ${general.accountName}`;
  }

  if (providerConnected) {
    return 'Not set up yet';
  }

  return 'Available after step 1';
};

const formatHintFor = (field: AccountField): string => {
  if (field.type === 'tel') {
    return 'Enter a phone number, like 0803 123 4567 or +234 803 123 4567.';
  }

  if (field.type === 'email') {
    return 'Enter an email address, like accounts@hospital.ng.';
  }

  return `Check the ${field.label.toLowerCase()}.`;
};

type Account = {
  providerAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
};

const Step = ({
  n,
  done,
  title,
  status,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  status: string;
  children?: ReactNode;
}) => (
  <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={`grid h-7 w-7 flex-none place-items-center rounded-full text-sm font-extrabold ${done ? 'bg-brand text-white' : 'border-2 border-outline text-ink-soft'}`}
      >
        {done ? '✓' : n}
      </span>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-ink-muted">{status}</p>
      </div>
    </div>
    {children ? <div className="space-y-3 pl-10">{children}</div> : null}
  </section>
);

/** A field value as the provider expects it; phone numbers become international (+234…). Undefined when not valid yet. */
const fieldValue = (
  type: 'email' | 'tel' | 'text' | 'secret' | 'select',
  value: string,
  pattern?: string,
  options?: { value: string }[],
) => {
  const v = value.trim();
  if (!v) {
    return undefined;
  }
  if (type === 'select') {
    return options?.some((o) => o.value === v) ? v : undefined;
  }
  if (type === 'tel') {
    return internationalPhone(v);
  }
  if (type === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : undefined;
  }
  return !pattern || new RegExp(pattern).test(v) ? v : undefined;
};

/**
 * Settings → Billing: bank transfer collection through a payment provider. Cash needs none of this.
 * Step 1 connects the hospital's provider account; step 2 creates or links the hospital's central account,
 * which patients transfer into and the provider verifies. Fields come from the provider's description,
 * so a provider added on the server appears here without a new screen. Every change is toasted.
 */
export const BillingSettings = () => {
  const context = useAuthorizationContext();
  const { hasServerSession } = useStaffVerification();
  const toast = useToast();
  const [connection, setConnection] = useState<BillingConnection>();
  const [providers, setProviders] = useState<ProviderDescriptor[]>([]);
  const [choice, setChoice] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [changeKey, setChangeKey] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = context.permissions.includes('fee_item:manage');
  const refresh = async () => {
    const [status, list] = await Promise.all([
      billingRequest<BillingConnection>(context, 'connection/status', {}),
      billingRequest<{ providers: ProviderDescriptor[] }>(context, 'providers', {}),
    ]);
    setConnection(status);
    setProviders(list.providers);
  };
  /** Runs one change: success and failure are both toasted, and a failure also stays on the page until the next attempt. */
  const perform = async (action: () => Promise<string | undefined | void>, fallback: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const done = await action();
      if (done) {
        toast(done);
      }
    } catch (e) {
      const message = userMessage(e, fallback);
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const reload = () => perform(refresh, 'Billing settings could not be read. Try again.');
  useEffect(() => {
    document.title = 'Billing settings · Geneus Health';
    if (allowed && hasServerSession) {
      void reload();
    }
  }, [allowed, hasServerSession, context.userId]);
  /** The connected provider (step 2 and the status line), and the one chosen in the step-1 form (may differ while switching). */
  const provider = providers.find((p) => p.id === connection?.provider);
  const target =
    providers.find((p) => p.id === (choice || connection?.provider)) ??
    (providers.length === 1 ? providers[0] : undefined);
  const switching = Boolean(
    connection?.configured && provider && target && target.id !== provider.id,
  );
  const keyValues = target
    ? Object.fromEntries(
        target.credentialFields.map((f) => [
          f.key,
          fieldValue(f.secret ? 'secret' : 'text', credentials[f.key] ?? '', f.pattern),
        ]),
      )
    : {};
  const keysReady = Boolean(target) && Object.values(keyValues).every(Boolean);
  const closeForm = () => {
    setChangeKey(false);
    setChoice('');
    setCredentials({});
    setTouched({});
  };
  const detailValues = provider
    ? Object.fromEntries(
        provider.accountFields.map((f) => [
          f.key,
          fieldValue(f.type, details[f.key] ?? '', f.pattern, f.options),
        ]),
      )
    : {};
  const detailsReady = Boolean(provider) && Object.values(detailValues).every(Boolean);
  const general = connection?.accounts.find((a) => a.id === connection.receivingAccountId);
  const others = connection?.accounts.filter((a) => a.id !== connection.receivingAccountId) ?? [];
  const name = provider?.name ?? 'your payment provider';
  const renderSettings = () => {
    if (!allowed) {
      return <p>Your account can't change billing settings.</p>;
    }

    if (!hasServerSession) {
      return <StaffVerification requireServerSession purpose="Configuring payment collection" />;
    }

    if (!connection) {
      return <p role="status">{error ? 'Settings could not be read.' : 'Reading settings…'}</p>;
    }

    const renderProviderKeys = () => {
      if (!connection.encryptionReady) {
        return (
          <p className="text-sm">
            The server can't store payment keys safely yet. Ask your system administrator to finish
            the server's payment setup.
          </p>
        );
      }

      if (!connection.configured || changeKey) {
        return (
          <>
            {providers.length > 1 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Payment provider">
                {providers.map((p) => (
                  <ChoiceChip
                    key={p.id}
                    selected={target?.id === p.id}
                    onClick={() => {
                      setChoice(p.id);
                      setCredentials({});
                      setTouched({});
                    }}
                  >
                    {p.name}
                  </ChoiceChip>
                ))}
              </div>
            ) : null}
            {switching ? (
              <p
                role="status"
                className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text"
              >
                Switching to {target!.name} replaces {provider!.name}. You'll set up the hospital's
                account again, and transfers sent to the old {provider!.name} account won't be
                picked up automatically, so stop giving out that account number.
              </p>
            ) : null}
            {target ? (
              target.credentialFields.map((f) => (
                <div key={`${target.id}:${f.key}`} className="space-y-1">
                  <TextField
                    label={`${target.name} ${f.label.toLowerCase()}`}
                    type={f.secret ? 'password' : 'text'}
                    autoComplete={f.secret ? 'new-password' : 'off'}
                    value={credentials[f.key] ?? ''}
                    onChange={(e) => setCredentials((v) => ({ ...v, [f.key]: e.target.value }))}
                    onBlur={() => setTouched((v) => ({ ...v, [`key:${f.key}`]: true }))}
                    error={
                      touched[`key:${f.key}`] &&
                      (credentials[f.key] ?? '').trim() &&
                      !keyValues[f.key]
                        ? `That doesn't look like a ${target.name} ${f.label.toLowerCase()}. Copy it again from ${target.name}.`
                        : undefined
                    }
                  />
                  {f.help ? <p className="text-xs text-ink-muted">{f.help}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm">Choose a provider.</p>
            )}
            <p className="text-xs text-ink-muted">
              Keys are stored encrypted on the server, never on this device.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                fullWidth={false}
                loading={busy}
                disabled={!keysReady}
                onClick={() =>
                  void perform(
                    async () => {
                      try {
                        await billingRequest(context, 'connection', {
                          provider: target!.id,
                          credentials: keyValues,
                        });
                        await refresh();
                        setAccounts([]);
                        closeForm();
                        return switching
                          ? `Switched to ${target!.name}. Set up the hospital's account next.`
                          : `${target!.name} connected.`;
                      } finally {
                        setCredentials({});
                      }
                    },
                    `${target?.name ?? 'The provider'} could not be connected. Check the keys and try again.`,
                  )
                }
              >
                {switching ? `Switch to ${target!.name}` : 'Connect'}
              </Button>
              {changeKey ? (
                <Button variant="outlined" fullWidth={false} onClick={closeForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </>
        );
      }

      return (
        <Button
          variant="ghost"
          fullWidth={false}
          className="!px-0 !py-2"
          onClick={() => setChangeKey(true)}
        >
          {providers.length > 1 ? 'Change provider or key' : 'Change key'}
        </Button>
      );
    };

    return (
      <>
        <Step
          n={1}
          done={connection.configured}
          title="Connect a payment provider"
          status={
            connection.configured ? `${name} connected · ${connection.mode} mode` : 'Not connected'
          }
        >
          {renderProviderKeys()}
        </Step>
        <Step
          n={2}
          done={Boolean(general)}
          title="The hospital's account"
          status={accountStepStatus(general, connection.configured)}
        >
          {connection.configured && !general && provider?.can.createAccount ? (
            <>
              <p className="text-sm">
                Create the hospital's account with {name}. Patients transfer to it, and Geneus
                confirms each transfer.
              </p>
              {provider.accountFields.map((f) => (
                <div key={f.key} className="space-y-1">
                  {f.type === 'select' ? (
                    <SelectField
                      label={f.label}
                      value={details[f.key] ?? ''}
                      onChange={(e) => setDetails((v) => ({ ...v, [f.key]: e.target.value }))}
                      options={[{ value: '', label: 'Choose…' }, ...(f.options ?? [])]}
                    />
                  ) : (
                    <TextField
                      label={f.label}
                      type={inputTypeFor(f)}
                      inputMode={inputModeFor(f)}
                      autoComplete={autoCompleteFor(f)}
                      value={details[f.key] ?? ''}
                      onChange={(e) => setDetails((v) => ({ ...v, [f.key]: e.target.value }))}
                      onBlur={() => setTouched((v) => ({ ...v, [`detail:${f.key}`]: true }))}
                      error={
                        touched[`detail:${f.key}`] &&
                        (details[f.key] ?? '').trim() &&
                        !detailValues[f.key]
                          ? formatHintFor(f)
                          : undefined
                      }
                    />
                  )}
                  {f.help ||
                  (f.type === 'tel' &&
                    detailValues[f.key] &&
                    detailValues[f.key] !== (details[f.key] ?? '').trim()) ? (
                    <p className="text-xs text-ink-muted">
                      {f.help}
                      {f.type === 'tel' &&
                      detailValues[f.key] &&
                      detailValues[f.key] !== (details[f.key] ?? '').trim()
                        ? ` It will be saved as ${detailValues[f.key]}.`
                        : ''}
                    </p>
                  ) : null}
                </div>
              ))}
              <Button
                fullWidth={false}
                loading={busy}
                disabled={!detailsReady}
                onClick={() =>
                  void perform(async () => {
                    await billingRequest(context, 'accounts/create', { details: detailValues });
                    await refresh();
                    setDetails({});
                    return "The hospital's account is ready.";
                  }, 'The account could not be created. Check the details and try again.')
                }
              >
                Create account
              </Button>
            </>
          ) : null}
          {connection.configured ? (
            <details className="text-sm">
              <summary className="min-h-[44px] cursor-pointer py-3 font-semibold">Advanced</summary>
              <div className="space-y-3">
                {provider?.can.listAccounts ? (
                  <p>Use an account the hospital already has with {name} instead.</p>
                ) : null}
                {provider?.can.listAccounts ? (
                  <Button
                    variant="outlined"
                    fullWidth={false}
                    loading={busy}
                    onClick={() =>
                      void perform(async () => {
                        const found = await billingRequest<Account[]>(
                          context,
                          'accounts/discover',
                          {},
                        );
                        setAccounts(found);
                        return found.length
                          ? `${found.length} ${found.length === 1 ? 'account' : 'accounts'} found. Choose one below.`
                          : `No active accounts were found with ${name}.`;
                      }, `Existing accounts could not be read from ${name}. Try again.`)
                    }
                  >
                    Find existing accounts
                  </Button>
                ) : null}
                {accounts.length ? (
                  <SelectField
                    label="Existing account"
                    value={existing}
                    onChange={(e) => setExisting(e.target.value)}
                    options={[
                      { value: '', label: 'Choose account' },
                      ...accounts.map((a) => ({
                        value: a.providerAccountId,
                        label: `${a.bankName} · ${a.accountNumber} · ${a.accountName}`,
                      })),
                    ]}
                  />
                ) : null}
                {accounts.length ? (
                  <Button
                    variant="outlined"
                    fullWidth={false}
                    loading={busy}
                    disabled={!existing}
                    onClick={() =>
                      void perform(async () => {
                        await billingRequest(context, 'accounts/link', {
                          providerAccountId: existing,
                        });
                        await refresh();
                        setExisting('');
                        return 'Account linked.';
                      }, 'The account could not be linked. Try again.')
                    }
                  >
                    Link account
                  </Button>
                ) : null}
                {others.map((a) => (
                  <article
                    key={a.id}
                    className="space-y-1 rounded-field border border-outline-soft p-3"
                  >
                    <p className="font-semibold">
                      {a.departmentId ? 'Earlier department account' : 'Linked account'} · {a.mode}
                    </p>
                    <p>
                      {a.bankName} · {a.accountName} ·{' '}
                      <span className="font-mono">{a.accountNumber}</span>
                    </p>
                    {a.departmentId ? (
                      <p className="text-xs text-ink-muted">
                        Kept so earlier transfers still reconcile.
                      </p>
                    ) : null}
                    {a.mode === connection.mode ? (
                      <Button
                        variant="outlined"
                        fullWidth={false}
                        loading={busy}
                        onClick={() =>
                          void perform(async () => {
                            await billingRequest(context, 'accounts/general', {
                              accountId: a.id,
                            });
                            await refresh();
                            return "The hospital's account was changed. Earlier transfers keep their original account.";
                          }, 'The account could not be changed. Try again.')
                        }
                      >
                        Use as the hospital's account
                      </Button>
                    ) : null}
                  </article>
                ))}
                {connection.webhookPath ? (
                  <div>
                    <p>Webhook address for {name}: your public server address followed by</p>
                    <p className="break-all font-mono text-xs">{connection.webhookPath}</p>
                  </div>
                ) : null}
              </div>
            </details>
          ) : null}
        </Step>
      </>
    );
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">Bank transfers</h2>
        <p className="text-sm text-ink-muted">
          Patients transfer to the hospital's account with a payment provider, and Geneus confirms
          each transfer with the provider. Cash works without any of this.
        </p>
      </div>
      {renderSettings()}
      {error ? (
        <div
          role="alert"
          className="space-y-2 rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"
        >
          <p>{error}</p>
          <Button variant="ghost" fullWidth={false} onClick={() => void reload()}>
            Reload settings
          </Button>
        </div>
      ) : null}
    </div>
  );
};
