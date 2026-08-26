import {lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import 'haze-ui/styles.css';
import {lightTheme, darkTheme, ToastContainer} from 'haze-ui';
import {useControl} from 'react-use-control';

// 副作用导入：尽早注册 token 供应商，保证冷刷新时的首个路由 data
// 请求（早于 Layout chunk 加载）也能带上 Authorization。
import '@/services/auth';

import App from '@/views';
import {ThemeControlCtx} from '@/util/theme';

// DevTool 仅开发模式可用，且经 React.lazy 独立成 chunk：生产构建里
// import.meta.env.DEV 被替换为 false，整个分支（含动态 import）随常量
// 折叠被摇掉，DevTool UI 及其依赖（mock 面板等）进不了生产包。
const DevTool = import.meta.env.DEV
  ? lazy(() => import('./components/DevTool'))
  : null;

// 应用根：主题 control 的唯一创建点。初始值跟随系统 prefers-color-scheme
// （仅首渲染求值一次），此后由用户经 ThemeToggle 写控。className 在
// lightTheme/darkTheme 间切换，haze-ui 的 --haze-* CSS 变量整体换肤。
// control 经 ThemeControlCtx 下发（index.tsx 不是组件树内的 hook 调用点，
// 状态必须挂在一个真实组件上才能驱动根重渲染）。
// ToastContainer 也挂根：provider 覆盖全部视图（含 Layout 之外），任何
// 视图的 useToast 都有宿主；测试渲染单个视图时同样可用。
function Root() {
  const [dark, , themeControl] = useControl<boolean>(
    null,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  return (
    <div className={dark ? darkTheme : lightTheme}>
      <ThemeControlCtx.Provider value={themeControl}>
        <ToastContainer>
          {DevTool ? (
            <Suspense fallback={null}>
              <DevTool>
                <App />
              </DevTool>
            </Suspense>
          ) : (
            <App />
          )}
        </ToastContainer>
      </ThemeControlCtx.Provider>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Root />);
