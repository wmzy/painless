import {css} from '@linaria/core';
import {ReactNode, useEffect, useMemo} from 'react';
import {createPortal} from 'react-dom';

export default function Popover({
  children,
  className,
  inert,
  'aria-hidden': ariaHidden
}: {
  children: ReactNode;
  className?: string;
  // 纯装饰性浮层（如 PreviewLink 的只读预览）传 true：内容对 AT 隐藏
  //（aria-hidden）之外还要移出 Tab 序——否则键盘焦点会落进「看不见也
  // 听不见」的可聚焦元素里（链接/按钮天然 tabbable）
  inert?: boolean;
  'aria-hidden'?: 'true' | 'false';
}) {
  const el = useMemo(() => document.createElement('div'), []);

  useEffect(() => {
    document.body.appendChild(el);
    return () => {
      el.parentElement?.removeChild(el);
    };
  }, []);

  // 不设 aria-modal：本组件的三处使用（DEV 角标 / DevTool 面板 / 预览
  // 浮层）都不拦截背景交互，声明 aria-modal="true" 会让 AT 误报「页面
  // 其余部分已被阻塞」；对预览浮层更是与 aria-hidden 自相矛盾（一边
  // 「焦点困在我这里」一边「我不存在于无障碍树」）。
  return createPortal(
    <div
      role="dialog"
      aria-hidden={ariaHidden}
      inert={inert}
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
