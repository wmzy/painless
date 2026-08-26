// 视图测试的共享渲染入口：视图可能用到根级基建——ToastContainer
// （favorite/follow 失败提示的 useToast 宿主）与 ThemeControlCtx（导航栏
// ThemeToggle 的主题 control 下发）。单视图渲染时统一从这里包一层，
// 保持「组件测试 mock 服务层、渲染真实视图」的约定不变。
import type {ReactElement} from 'react';

import {render, type RenderResult} from '@testing-library/react';
import {ToastContainer} from 'haze-ui';
import {useControl} from 'react-use-control';

import {ThemeControlCtx} from '@/util/theme';

// 每次渲染创建独立主题 control（测试间状态隔离；默认 light）。
function ViewHost({children}: {children: ReactElement}) {
  const [, , themeControl] = useControl<boolean>(null, false);
  return (
    <ThemeControlCtx.Provider value={themeControl}>
      <ToastContainer>{children}</ToastContainer>
    </ThemeControlCtx.Provider>
  );
}

export function renderView(ui: ReactElement): RenderResult {
  return render(<ViewHost>{ui}</ViewHost>);
}
