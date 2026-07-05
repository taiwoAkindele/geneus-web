type Props = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

/**
 * On/off switch (design: 44×26 track, 20px knob). On is primary green; off is a
 * neutral grey. Compact — opts out of the 52px control rule.
 */
export const ToggleSwitch = ({ checked, onChange, disabled, ariaLabel, className = '' }: Props) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-[26px] w-11 min-h-0 flex-none rounded-full transition-colors disabled:opacity-60 ${
        checked ? 'bg-brand' : 'bg-[#cfd4d0]'
      } ${className}`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${
          checked ? 'right-[3px]' : 'left-[3px]'
        }`}
      />
    </button>
  );
}
