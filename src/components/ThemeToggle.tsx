import {Switch} from 'haze-ui';
import {useControl} from 'react-use-control';

import {useThemeControl} from '@/util/theme';

// 主题切换：根部创建的 control 经 context 传到这里，Switch 的 checked
// 直接收 Control<boolean>（haze-ui 受控协议），无 value/onChange 样板。
// 视觉状态由根部 className（lightTheme/darkTheme）驱动 CSS 变量整体
// 换肤，本组件只写不读样式。
export default function ThemeToggle() {
  const themeControl = useThemeControl();
  const [dark, setDark] = useControl(themeControl, false);

  return (
    <Switch
      checked={dark}
      onClick={() => setDark(!dark)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={dark}
    />
  );
}
