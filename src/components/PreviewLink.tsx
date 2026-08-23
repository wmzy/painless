import {PrefetchLink} from '@native-router/react';
import {ComponentProps} from 'react';
import {useControl} from 'haze-ui';

import Preview from './Preview';

// 除 children 外全部透传给 PrefetchLink（含 prefetch）：
// 不传时保持库默认 'intent'，由调用方按需改 'viewport' 等
export default function PreviewLink({
  children,
  ...props
}: ComponentProps<typeof PrefetchLink>) {
  const [visible, setVisible] = useControl<boolean>(undefined, false);
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
