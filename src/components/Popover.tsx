import {css} from '@linaria/core';
import {ReactNode, useEffect, useMemo} from 'react';
import {createPortal} from 'react-dom';

export default function Popover({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
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
