import type {AppPaths} from '@/views';

import {TypedLink, type TypedLinkProps} from '@native-router/react';
import {useControl, type Control} from 'react-use-control';

import Preview from './Preview';

// 除 children 外全部透传给 TypedLink<AppPaths>：to 按路由表路径联合
//（AppPaths）编译期判别，动态段（/article/:title）同时要求 params——
// 此前停留无类型 PrefetchLink 的原因（TypedLinkProps 不透传 prefetch）
// 已随 react 1.15 消失：声明 prefetch 时 TypedLink 内部按 PrefetchLink
// 渲染，未声明走普通 Link。prefetch 缺省 'viewport'（卡片滚入视口即预取
// data+chunk，点击近乎零等待——本组件的唯一调用语义），调用方可显式
// 覆盖（含 'none'）。
// visible 遵循 control 模式（同 haze-ui 组件约定）：传 Control 受控
//（宿主接管显隐，如触屏设备用长按替代 hover），传 boolean 为非受控
// 初值，不传则默认隐藏——hover/focus 两种交互仍走组件内 setVisible
type Props = TypedLinkProps<AppPaths> & {
  visible?: Control<boolean> | boolean;
};

export default function PreviewLink({
  children,
  visible: visibleControl,
  prefetch,
  ...props
}: Props) {
  const [visible, setVisible] = useControl(
    visibleControl as Control<boolean>,
    false
  );
  return (
    <TypedLink<AppPaths> {...props} prefetch={prefetch ?? 'viewport'}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        tabIndex={0}
      >
        {children}
      </span>
      <Preview visible={visible} />
    </TypedLink>
  );
}
