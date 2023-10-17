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
  if (loading) return <Popover className={style}>loading</Popover>;
  if (error) return <Popover className={style}>error</Popover>;
  if (view) return <Popover className={style}>{view}</Popover>;
  return null;
}
