import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Bottom sheet on phones, centred dialog on wider screens. Used for the
 * deliberate Review & Save, the amendment form, and the activity log — anywhere
 * a focused decision sits over the current screen. Tapping the backdrop closes.
 */
type Props = {
  onClose: () => void;
  title?: string;
  /** Small eyebrow above the title (e.g. "Review before saving"). */
  eyebrow?: string;
  children: ReactNode;
};

export const Sheet = ({ onClose, title, eyebrow, children }: Props) => (
  <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="absolute inset-0 min-h-0 cursor-default bg-black/40"
    />
    <div className="relative max-h-[90vh] w-full overflow-auto rounded-t-sheet bg-white px-5 pb-6 pt-5 shadow-sheet sm:max-w-lg sm:rounded-sheet">
      <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-outline-hair sm:hidden" />
      {(title || eyebrow) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow ? (
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-brand-strong">{eyebrow}</div>
            ) : null}
            {title ? (
              <h2 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.02em] text-ink">{title}</h2>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 min-h-0 flex-none items-center justify-center rounded-full text-ink-soft"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
      )}
      {children}
    </div>
  </div>
);
