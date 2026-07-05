import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Button, TextField } from '@/ui';

/**
 * 3.3 Forgot PIN — recover it yourself, no waiting on the admin. Sending the
 * reset link goes to a confirmation; the emailed link opens Reset PIN.
 */
export const ForgotPinScreen = () => {
  const navigate = useNavigate();
  const [contact, setContact] = useState('');

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Forgot your PIN?" onBack={() => navigate(-1)} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg">
        <form
          className="flex-1 px-6 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            navigate('/forgot-pin/sent', { state: { contact } });
          }}
        >
          {/* Lock mark */}
          <div className="mb-5 mt-2 flex h-[52px] w-[52px] items-center justify-center rounded-[15px] bg-brand-tint">
            <div>
              <div className="mx-auto h-3 w-4 rounded-t-md border-2 border-b-0 border-brand" />
              <div className="h-3.5 w-5 rounded-sm bg-brand" />
            </div>
          </div>

          <p className="mb-6 text-[15px] leading-relaxed text-ink-soft">
            Enter the email or phone number on your staff account. We&rsquo;ll send a secure link to
            set a new PIN — the same way you first joined.
          </p>

          <TextField
            label="Email or phone"
            placeholder="e.g. 0803 555 0147"
            name="reset_contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />

          <div className="mt-5">
            <Button type="submit" variant="primary">
              Send reset link
            </Button>
          </div>

          {/* Admin fallback */}
          <div className="mt-6 flex items-start gap-3 rounded-card bg-surface-muted p-4">
            <div className="flex h-6 w-6 flex-none items-center justify-center rounded-lg bg-slate text-sm font-extrabold text-white">
              i
            </div>
            <p className="text-[13px] leading-relaxed text-ink-soft">
              Your facility admin can also reset your PIN from Manage staff if you can&rsquo;t access
              your email or phone.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
