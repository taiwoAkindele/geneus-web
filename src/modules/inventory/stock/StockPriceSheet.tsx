import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StockItem } from '@shared';
import { useAuthorizationContext, StaffVerification } from '@/session';
import { linkStockPrice } from '@/data/repos/stock';
import { CatalogueBrowser } from '@/modules/finance/billing';
import { Button, Sheet } from '@/ui';

export const StockPriceSheet = ({
  item,
  onClose,
  onSaved,
}: {
  item: StockItem;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const context = useAuthorizationContext();
  const [feeId, setFeeId] = useState(item.feeItemId ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const save = async () => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      await linkStockPrice(item.id, feeId || undefined, context);
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The Billing item could not be linked');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <Sheet
      title="Link Billing Item"
      eyebrow={item.name}
      onClose={onClose}
      closeDisabled={saving}
      hasUnsavedChanges={feeId !== (item.feeItemId ?? '')}
    >
      <div className="space-y-4">
        <p>
          Choose an existing central price for one {item.unitOfMeasure ?? 'recorded stock unit'}.
          Confirm that its unit matches the actual stock item. No pack conversion is assumed.
        </p>
        {item.feeItemId ? (
          <p className="text-sm">
            Existing link retained: {item.feeItemId}. Legacy links keep their recorded category and
            history.
          </p>
        ) : null}
        <CatalogueBrowser
          initialCategory="pharmacy"
          canSelect={(f) => f.category === 'pharmacy' || f.id === item.feeItemId}
          onSelect={(fee) => setFeeId(fee.id)}
        />
        <p className="break-all text-sm">
          Selected Billing item: {feeId || 'None — supply needs billing review'}
        </p>
        <Button variant="ghost" fullWidth={false} onClick={() => setFeeId('')}>
          Clear association
        </Button>
        {context.permissions.includes('fee_item:manage') ? (
          <Link className="block py-3 font-bold text-brand" to="/billing/prices">
            Manage prices in Billing
          </Link>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <StaffVerification requireServerSession purpose="Linking a stock item to Billing">
          <Button loading={saving} onClick={() => void save()}>
            Save Billing link
          </Button>
        </StaffVerification>
      </div>
    </Sheet>
  );
};
