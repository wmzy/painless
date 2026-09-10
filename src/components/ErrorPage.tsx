import type {ReactNode} from 'react';

import {css} from '@linaria/core';
import {Title, Text} from 'haze-ui';

import {primarySkin} from './SubmitButton';

// 错误/404 页共享外壳：三处渲染点（Router notFound、/article/:title 的
// errorComponent、全局 errorHandler）都渲染在 Layout 之外，没有导航
// chrome——居中满屏的编辑部版式让「离网页」依然完整、有意为之而非
// 裸奔。纯展示：kicker（大字衬线眉标）+ 标题 + 说明 + 操作行。
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

const titleCls = css`
  margin-bottom: var(--haze-space-3);
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
  return (
    <div className={wrap}>
      <div className={inner}>
        {kicker != null && <p className={kickerCls}>{kicker}</p>}
        <Title className={titleCls}>{title}</Title>
        <Text className={bodyCls}>{children}</Text>
        {actions != null && <div className={actionsCls}>{actions}</div>}
      </div>
    </div>
  );
}
