import { useRef, useState, type ReactNode } from 'react';

/**
 * Text kept to one line with an ellipsis. Only when it is actually cut off does hovering (or keyboard focus)
 * show the full text as a tooltip, so short values don't get a pointless one. Give it a max width.
 */
export const Truncate = ({
  text,
  className = '',
  children,
}: {
  text: string;
  className?: string;
  children?: ReactNode;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);

  const check = () => {
    const el = ref.current;
    setCut(Boolean(el && el.scrollWidth > el.clientWidth));
  };

  return (
    <span
      ref={ref}
      title={cut ? text : undefined}
      onMouseEnter={check}
      onFocus={check}
      className={`block truncate ${className}`}
    >
      {children ?? text}
    </span>
  );
};
