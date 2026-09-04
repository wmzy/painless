import {css} from '@linaria/core';
import {usePrefetch} from '@native-router/react';
import {createPortal} from 'react-dom';

type Props = {
  visible: boolean;
};

const style = css`
  position: fixed;
  z-index: 1000;
  transform: scale(0.2);
  transform-origin: bottom right;
  width: 100vw;
  height: 100vh;
  bottom: 0;
  right: 0;
  overflow: auto;
  border: solid 1px #ccc;
  border-radius: 4px;
  background: #fff;
  pointer-events: none;
`;

// 预览浮层是 haze-ui Popover 根本不适配的用例（迁移批评估结论）：
// Popover 是「锚定式触发器 + 浮动面板」——触发器 span 承载交互语义
//（role=button/aria-haspopup）、面板锚在触发器旁、开合由其 open control
// 与 light-dismiss/Escape 管理；而预览是纯装饰性画中画：固定右下角
//（非锚定）、对 AT 整体隐身（aria-hidden，与 role=button/haspopup 的
// 弹层语义互斥）、pointer-events: none 不收任何交互（light-dismiss 无从
// 谈起）、显隐由 PreviewLink 的 visible 全权驱动。haze-ui 1.21 的公开
// 导出面（Popover/Tooltip 锚定交互弹层、Dialog 走原生 showModal 阻塞
// 背景、Affix 非浮层）没有「无语义、非锚定的 portal 装饰层」原语，
// FloatingPanel/useFloating 又未从包导出——故此处保留最小 portal 实现
//（createPortal 直挂 document.body，无宿主 div 生命周期、无 role 假
// 语义；原共享 Popover.tsx 已删）。若 haze 未来导出裸浮层原语，此处
// 是唯一待换点。data-testid='preview-overlay' 是唯一测试钩子：e2e 定
// 位浮层用它——迁移批（5febc94）前浮层借旧本地 Popover 的 role=dialog
// 被定位，裸 div 不再借用弹层假语义，测试改钉 testid（对 AT 零影响：
// aria-hidden 在场，角色属性本就不进无障碍树）。
export default function Preview({visible}: Props) {
  const {view, loading, error} = usePrefetch();
  if (!visible) return null;
  // 三个分支同为「只读预览」：aria-hidden 对 AT 隐身，inert 把整棵
  // 预览树移出 Tab 序——预览渲染的是完整目标视图（含链接/按钮/表单），
  // 不加 inert 时键盘用户 Tab 会落进这套对 AT 不可见、缩放 0.2 的
  // 可聚焦内容里。portal 到 body：浮层渲染在文章卡 <a> 深处，不 portal
  // 的话 position:fixed 会被任何建立 containing block 的祖先（transform/
  // filter 一类，未来卡片 hover 动效即是）改锚——结构性逃逸，不靠巧合。
  const body = loading ? 'loading' : error ? 'error' : view;
  if (!body) return null;
  return createPortal(
    <div aria-hidden='true' inert data-testid='preview-overlay' className={style}>
      {body}
    </div>,
    document.body
  );
}
