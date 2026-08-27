import {Switch} from 'haze-ui';
import {useControl} from 'react-use-control';

import {useThemeControl} from '@/util/theme';

// 主题切换：根部创建的 control 经 context 传到这里，读当前值并把点击
// 写回 control。视觉状态由根部 className（lightTheme/darkTheme）驱动
// CSS 变量整体换肤，本组件只写不读样式。
// role="switch" 的状态属性是 aria-checked（由 haze-ui Switch 按 checked
// 值渲染）；不传 aria-pressed——那是 toggle button 的语义，与 switch
// 角色不符（axe aria-required-attr 只认 aria-checked）。
export default function ThemeToggle() {
  const themeControl = useThemeControl();
  const [dark, setDark] = useControl(themeControl, false);

  return (
    <Switch
      checked={dark}
      onClick={() => setDark(!dark)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    />
  );
}
