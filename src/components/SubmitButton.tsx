import type {ButtonHTMLAttributes} from 'react';

import {css} from '@linaria/core';

// 全站表单主提交按钮的统一皮肤。haze-ui Button 硬编码 type='button'
//（且类型上剥离 type 属性），无法充当表单提交件——原生 submit 按钮
// 配上与设计语言一致的主色皮肤（token 驱动，双主题自动跟随）。
// 语义：缺省 fullWidth（登录/设置等窄卡表单的通栏主行动），评论框等
// 需要内容宽的调用点显式关闭。disabled 态由表单层驱动（canSubmit /
// isSubmitting），不透明归零只降不透明度——错误信息已在字段旁，按钮
// 不必消失。
//
// primarySkin 同时是「主行动」链接的皮肤（ErrorPage 的回首页链接）：
// 主色实心观感只该有一份定义。
export const primarySkin = css`
  appearance: none;
  border: none;
  background: var(--haze-color-primary);
  color: var(--haze-color-text-inverse);
  font-family: var(--haze-font-sans);
  font-size: var(--haze-text-sm);
  font-weight: var(--haze-weight-medium);
  line-height: var(--haze-leading-tight);
  padding: 10px 18px;
  border-radius: var(--haze-radius-md);
  cursor: pointer;
  transition: background var(--haze-duration-fast),
    box-shadow var(--haze-duration-fast);

  &:hover {
    background: var(--haze-color-primary-hover);
  }
  &:active {
    background: var(--haze-color-primary-active);
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--haze-color-focus-ring);
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

const full = css`
  display: block;
  width: 100%;
`;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
};

export default function SubmitButton({fullWidth = true, className, ...rest}: Props) {
  return (
    <button
      type='submit'
      className={fullWidth ? `${primarySkin} ${full} ${className ?? ''}` : `${primarySkin} ${className ?? ''}`}
      {...rest}
    />
  );
}
