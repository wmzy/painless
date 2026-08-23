import {lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import 'haze-ui/styles.css';
import {lightTheme} from 'haze-ui';

// 副作用导入：尽早注册 token 供应商，保证冷刷新时的首个路由 data
// 请求（早于 Layout chunk 加载）也能带上 Authorization。
import '@/services/auth';

import App from '@/views';

// DevTool 仅开发模式可用，且经 React.lazy 独立成 chunk：生产构建里
// import.meta.env.DEV 被替换为 false，整个分支（含动态 import）随常量
// 折叠被摇掉，DevTool UI 及其依赖（mock 面板等）进不了生产包。
const DevTool = import.meta.env.DEV
  ? lazy(() => import('./components/DevTool'))
  : null;

const root = createRoot(document.getElementById('root')!);
root.render(
  <div className={lightTheme}>
    {DevTool ? (
      <Suspense fallback={null}>
        <DevTool>
          <App />
        </DevTool>
      </Suspense>
    ) : (
      <App />
    )}
  </div>
);
