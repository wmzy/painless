import {css} from '@linaria/core';
import {ReactNode, useEffect, useMemo} from 'react';
import {createPortal} from 'react-dom';

export default function Popover({
  children,
  className,
  'aria-hidden': ariaHidden
}: {
  children: ReactNode;
  className?: string;
  'aria-hidden'?: 'true' | 'false';
}) {
  const el = useMemo(() => document.createElement('div'), []);

  useEffect(() => {
    document.body.appendChild(el);
    return () => {
      el.parentElement?.removeChild(el);
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={ariaHidden}
      x-class={[
        css`
          position: fixed;
          z-index: 1000;
        `,
        className
      ]}
    >
      {children}
    </div>,
    el
  );
}
