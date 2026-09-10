import {css} from '@linaria/core';
import {useLayoutEffect, useState, type RefObject} from 'react';
import {usePrefetch} from '@native-router/react';
import {createPortal} from 'react-dom';

import {TitleWriteContext} from '@/util/useTitle';

// 锚点间距 / 视口留白 / 面板最大尺寸（px）
const GAP = 10;
const MARGIN = 12;
const MAX_WIDTH = 560;
const MAX_HEIGHT = 400;

type Props = {
  visible: boolean;
  // 锚点（PreviewLink 的触发器 span）：面板钉在其下方，放不下翻上方
  anchorRef: RefObject<HTMLSpanElement | null>;
};

const panel = css`
  @keyframes preview-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  position: fixed;
  z-index: 1000;
  overflow: hidden;
  pointer-events: none;
  border: 1px solid var(--haze-color-border);
  border-radius: var(--haze-radius-lg);
  background: var(--haze-color-bg);
  box-shadow: var(--haze-shadow-lg);
  animation: preview-in 140ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

// 面板内等比缩小的「完整页」画布：内容按真实视口宽度布局，再整体
// scale(k) 收进面板——布局指标（断点/字号）与真实页面一致，只是缩小。
// 高度收进 MAX_HEIGHT，超出裁掉：预览是「页首一瞥」，不是全页缩印。
const viewport = css`
  width: 100vw;
  height: 100vh;
  transform-origin: top left;
  background: var(--haze-color-bg);
`;

// loading/error 文本状态直接落正文区（不做骨架层：浮层只是瞥一眼）
const status = css`
  font-family: var(--haze-font-sans);
  font-size: var(--haze-text-xs);
  color: var(--haze-color-text-muted);
  padding: var(--haze-space-3) var(--haze-space-4);
`;

// 预览浮层是 haze-ui Popover 根本不适配的用例（迁移批评估结论 + 本次
// 锚定化后的复核）：Popover 是交互弹层——触发器承载 role=button/
// aria-haspopup、面板进焦点管理（light-dismiss/Escape/focus trap）；
// 预览是纯装饰性画中画——对 AT 整体隐身（aria-hidden）、inert 移出
// Tab 序、pointer-events: none 不收任何交互（鼠标从链接移向面板期间
// hover 不中断）、显隐由 PreviewLink 的 visible 全权驱动，且面板内要
// 跑「100vw 画布 + scale」的缩印技巧——Popover 的位置/交互语义全部
// 冲突。故保留最小 portal 实现（createPortal 直挂主题作用域 div：
// 面板皮肤全用 --haze-* 变量，必须留在作用域内解析；作用域 div 无
// transform/filter，不建立 containing block，卡片 hover 的 transform
// 也波及不到——面板是作用域 div 的子级，不是卡片的子级；见组件内
// host 取法注释）。data-testid='preview-overlay' 是唯一测试钩子：e2e
// 定位浮层用它（对 AT 零影响：aria-hidden 在场，角色属性本就不进无
// 障碍树）。
export default function Preview({visible, anchorRef}: Props) {
  const {view, loading, error} = usePrefetch();
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    host: HTMLElement;
  } | null>(null);

  // 定位：锚点正下方；下方放不下（顶到视口下缘）翻到锚点上方；水平
  // 贴锚点左缘并向视口内夹。scroll 用 capture 在 window 处捕到任何
  // 滚动容器的事件（页面滚动/内部滚动都会带走锚点），resize 覆盖窗口
  // 尺寸变化——两者驱动重定位。
  // host 取锚点最近的主题作用域祖先（.haze-typography__typography，
  // index.tsx 挂根）：面板皮肤全用 --haze-* 变量，portal 到 document.body
  // 会落在作用域外、变量全部解析失败（背景/边框/阴影透明，与页面文字
  // 叠印——实测缺陷）；作用域 div 无 transform/filter（不建立 containing
  // block，fixed 不被改锚，卡片 hover 的 transform 也不波及——面板是
  // 作用域 div 的子级，不是卡片的子级）。测试渲染无作用域树时回落 body。
  useLayoutEffect(() => {
    if (!visible) {
      setPos(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(MAX_WIDTH, vw - MARGIN * 2);
      const height = Math.min((width / vw) * vh, MAX_HEIGHT);
      const left = Math.min(Math.max(r.left, MARGIN), vw - width - MARGIN);
      let top = r.bottom + GAP;
      if (top + height > vh - MARGIN) {
        top = r.top - GAP - height;
      }
      const scoped = anchor.closest('.haze-typography__typography');
      const host = scoped instanceof HTMLElement ? scoped : document.body;
      setPos({left, top: Math.max(top, MARGIN), width, height, host});
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, {capture: true, passive: true});
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [visible, anchorRef]);

  if (!visible || pos === null) return null;
  // 三个分支同为「只读预览」：aria-hidden 对 AT 隐身，inert 把整棵
  // 预览树移出 Tab 序——预览渲染的是完整目标视图（含链接/按钮/表单），
  // 不加 inert 时键盘用户 Tab 会落进这套对 AT 不可见的可聚焦内容。
  // 注意：inert 只挂外层面板一层——嵌套 inert 元素会触发 Chromium
  // 渲染进程崩溃（实测：内层再挂 inert 即 renderer crash，非 JS 异常）。
  const body = loading ? 'loading' : error ? 'error' : view;
  if (!body) return null;
  const isStatus = body === 'loading' || body === 'error';
  return createPortal(
    <div
      aria-hidden='true'
      inert
      data-testid='preview-overlay'
      className={panel}
      style={{left: pos.left, top: pos.top, width: pos.width, height: pos.height}}
    >
      <div
        aria-hidden='true'
        className={isStatus ? `${viewport} ${status}` : viewport}
        style={{transform: `scale(${pos.width / window.innerWidth})`}}
      >
        {/* 完整视图复制品的页标题写静默：悬停不该改标签页标题
            （context 经 React 树透传，portal 不截断） */}
        <TitleWriteContext.Provider value={false}>{body}</TitleWriteContext.Provider>
      </div>
    </div>,
    pos.host
  );
}
