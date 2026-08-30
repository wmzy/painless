import {css} from '@linaria/core';
import {usePrefetch} from '@native-router/react';

import Popover from './Popover';

type Props = {
  visible: boolean;
};

export default function Preview({visible}: Props) {
  const {view, loading, error} = usePrefetch();
  const style = css`
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
  if (!visible) return null;
  // 三个分支同为「只读预览」：aria-hidden 对 AT 隐身，inert 把整棵
  // 预览树移出 Tab 序——预览渲染的是完整目标视图（含链接/按钮/表单），
  // 不加 inert 时键盘用户 Tab 会落进这套对 AT 不可见、缩放 0.2 的
  // 可聚焦内容里
  if (loading) return <Popover className={style} aria-hidden="true" inert>loading</Popover>;
  if (error) return <Popover className={style} aria-hidden="true" inert>error</Popover>;
  if (view) return <Popover className={style} aria-hidden="true" inert>{view}</Popover>;
  return null;
}
