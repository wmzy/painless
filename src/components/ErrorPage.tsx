import type {ReactNode} from 'react';

import {useEffect, useRef} from 'react';

import {css} from '@linaria/core';
import {Text} from 'haze-ui';

import {primarySkin} from './SubmitButton';

// 错误/404 页共享外壳：三处渲染点（Router notFound、/article/:title 的
// errorComponent、全局 errorHandler）都渲染在 Layout 之外，没有导航
// chrome——居中满屏的编辑部版式让「离网页」依然完整、有意为之而非
// 裸奔。kicker（大字衬线眉标）+ 标题 + 说明 + 操作行；挂载时把焦点
// 移到主标题（见 headingRef）。
type Props = {
  kicker?: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

const wrap = css`
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--haze-space-6);
  background: var(--haze-color-bg);
`;

const inner = css`
  max-width: 440px;
  text-align: center;
`;

const kickerCls = css`
  font-family: var(--haze-font-serif);
  font-size: 84px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--haze-color-primary);
  margin: 0 0 var(--haze-space-4);
`;

// 标题用原生 <h1> 而非 haze-ui <Title>：焦点管理需要把 ref 与
// tabIndex={-1} 落在标题元素本身，而 Title 的 props 被解构丢弃这两者
//（TitleProps 亦无此二项）——传了也是静默失效。字号字重等仍走
// --haze-* token（与 Title level 1 的产物一致），主题继续跟随。
const titleCls = css`
  font-family: var(--haze-font-sans);
  font-size: var(--haze-text-3xl);
  font-weight: var(--haze-weight-bold);
  line-height: var(--haze-leading-tight);
  color: var(--haze-color-text);
  margin: 0 0 var(--haze-space-3);
`;

const bodyCls = css`
  margin-bottom: var(--haze-space-6);
  color: var(--haze-color-text-secondary);
`;

const actionsCls = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--haze-space-3);
`;

// 「主行动」链接皮肤（回首页等）：复用 SubmitButton 的实心主色观感，
// <a> 补充 inline-block 盒模型
export const actionLink = css`
  ${primarySkin};
  display: inline-block;
  text-decoration: none;
`;

export default function ErrorPage({kicker, title, children, actions}: Props) {
  // SPA 路由切换不自动移动焦点：键盘/屏幕阅读器用户到达错误/404 页时，
  // 焦点还停在触发导航的旧元素上（往往已随旧视图卸载），对新页面内容
  // 零感知。照 WAI-ARIA APG 对 SPA 视图切换的建议，挂载即把焦点移到
  // 主标题；tabIndex={-1} 让标题可编程聚焦但不进 Tab 序。
  // preventScroll：错误页是整屏替换视图且标题必在首屏，让浏览器执行
  // 焦点滚动只会与 view transition / 滚动恢复的时序互相打架。
  // 只在 ErrorPage 做而非所有路由：错误/404 是「内容整体替换、无任何
  // 交互入口预告」的最强需求面；正常路由的焦点管理待真实诉求再议。
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({preventScroll: true});
  }, []);

  return (
    <div className={wrap}>
      <div className={inner}>
        {kicker != null && <p className={kickerCls}>{kicker}</p>}
        <h1 className={titleCls} tabIndex={-1} ref={headingRef}>
          {title}
        </h1>
        <Text className={bodyCls}>{children}</Text>
        {actions != null && <div className={actionsCls}>{actions}</div>}
      </div>
    </div>
  );
}
