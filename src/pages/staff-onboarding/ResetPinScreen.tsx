import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PinDots, PinKeypad } from '@/ui';

/**
 * 3.4 Reset PIN. Opened from the reset link. Choose a new 4-digit PIN and
 * confirm it; the old PIN stops working right away. One keypad fills whichever
 * field is still incomplete (new first, then confirm).
 */
export const ResetPinScreen = () => {
  const navigate = useNavigate();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState(false);

  const onDigit = (d: string) => {
    setError(false);
    if (newPin.length < 4) {
      setNewPin(newPin + d);
    } else if (confirmPin.length < 4) {
      setConfirmPin(confirmPin + d);
    }
  };

  const onDelete = () => {
    setError(false);
    if (confirmPin.length > 0) {
      setConfirmPin((p) => p.slice(0, -1));
    } else {
      setNewPin((p) => p.slice(0, -1));
    }
  };

  const complete = newPin.length === 4 && confirmPin.length === 4;

  const save = () => {
    if (newPin === confirmPin) {
      navigate('/login');
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface px-7 pb-8 pt-12">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center text-center">
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Set a new PIN</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Choose a new 4-digit PIN, then confirm it. Your old PIN stops working right away.
        </p>

        <div className="mt-6 w-full space-y-4 rounded-[18px] border border-outline-soft bg-white p-5">
          <div>
            <div className="mb-3 text-[13px] font-semibold text-ink-soft">New PIN</div>
            <PinDots filled={newPin.length} />
          </div>
          <div>
            <div className="mb-3 text-[13px] font-semibold text-ink-soft">Confirm new PIN</div>
            <PinDots filled={confirmPin.length} />
          </div>
        </div>

        {error ? (
          <div className="mt-3 text-[13px] font-semibold text-danger">
            PINs didn&rsquo;t match — check both and try again
          </div>
        ) : null}

        <div className="mt-5 w-full max-w-[300px]">
          <PinKeypad onDigit={onDigit} action={{ label: 'Delete', onPress: onDelete }} tone="light" />
        </div>

        <div className="mt-auto w-full pt-5">
          <Button variant="primary" disabled={!complete} onClick={save}>
            Save new PIN &amp; sign in
          </Button>
        </div>
      </div>
    </div>
  );
};
