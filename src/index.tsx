import {lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
// tokens.css 副作用导入：主题（--haze-* 变量）、spacing、排版基线，其余
// 组件 css 由 vite 插件（vite-plugin-haze-css.mts）按模块图自动注入，无
// 需手工清单。此导入同时是 token 供应商注册的时序锚点（见下），不随按
// 需收集迁移——须保持先于任何路由 data 请求。
import 'haze-ui/css/tokens.css';
// 视图过渡样式：全局伪元素动画（::view-transition-*），与组件按需 CSS
// 机制无关，直接副作用导入。无 VT 支持的浏览器下载后空转（选择器不匹
// 配任何元素，零选择成本之外无运行时开销）。
import '@/view-transition.css';
import {lightTheme, darkTheme, spacing, typography, ToastContainer} from 'haze-ui';

// 副作用导入：尽早注册 token 供应商，保证冷刷新时的首个路由 data
// 请求（早于 Layout chunk 加载）也能带上 Authorization。
import '@/services/auth';

import App from '@/views';
import {ThemeControlCtx, useAppTheme} from '@/util/theme';

// DevTool 仅开发模式可用，且经 React.lazy 独立成 chunk：生产构建里
// import.meta.env.DEV 被替换为 false，整个分支（含动态 import）随常量
// 折叠被摇掉，DevTool UI 及其依赖（mock 面板等）进不了生产包。
const DevTool = import.meta.env.DEV
  ? lazy(() => import('./components/DevTool'))
  : null;

// 应用根：主题状态挂在真实组件上才能驱动根重渲染。创建/跟随逻辑收敛
// 在 useAppTheme（util/theme.tsx）：初始值跟随系统 prefers-color-scheme，
// 手动干预（ThemeToggle 写 control）前持续跟随系统切换。className 在
// lightTheme/darkTheme 间切换，haze-ui 的 --haze-color-* 整体换肤。
// spacing/typography 是 1.12 起的独立作用域类（tokens.css 把
// --haze-space-*/--haze-radius-*/--haze-font-* 挂到
// .haze-spacing__spacing / .haze-typography__typography 而非主题类）：
// 根部不挂则全应用这些 token 不解析，haze Button 的 padding/radius
// 实际为 0（颜色 token 不受影响，故 1.12 集成时漏挂未被发现）。挂根
// 一次，全树（含懒加载视图）继承。
// control 经 ThemeControlCtx 下发（index.tsx 不是组件树内的 hook 调用点，
// 消费方统一从 context 取）。
// ToastContainer 也挂根：provider 覆盖全部视图（含 Layout 之外），任何
// 视图的 useToast 都有宿主；测试渲染单个视图时同样可用。
function Root() {
  const [dark, themeControl] = useAppTheme();

  return (
    <div
      className={`${dark ? darkTheme : lightTheme} ${spacing} ${typography}`}
    >
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
