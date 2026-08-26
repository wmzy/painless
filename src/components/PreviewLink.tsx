import {PrefetchLink} from '@native-router/react';
import {ComponentProps} from 'react';
import {useControl, type Control} from 'react-use-control';

import Preview from './Preview';

// 除 children 外全部透传给 PrefetchLink（含 prefetch）：
// 不传时保持库默认 'intent'，由调用方按需改 'viewport' 等。
// visible 遵循 control 模式（同 haze-ui 组件约定）：传 Control 受控
//（宿主接管显隐，如触屏设备用长按替代 hover），传 boolean 为非受控
// 初值，不传则默认隐藏——hover/focus 两种交互仍走组件内 setVisible
type Props = ComponentProps<typeof PrefetchLink> & {
  visible?: Control<boolean> | boolean;
};

export default function PreviewLink({
  children,
  visible: visibleControl,
  ...props
}: Props) {
  const [visible, setVisible] = useControl(
    visibleControl as Control<boolean>,
    false
  );
  return (
    <PrefetchLink {...props}>
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
    </PrefetchLink>
  );
}
