import {createRoot} from 'react-dom/client';
import 'haze-ui/styles.css';
import {lightTheme} from 'haze-ui';

// 副作用导入：尽早注册 token 供应商，保证冷刷新时的首个路由 data
// 请求（早于 Layout chunk 加载）也能带上 Authorization。
import '@/services/auth';

import App from '@/views';

import DevTool from './components/DevTool';

function AppWithDevtool() {
  return (
    <DevTool>
      <App />
    </DevTool>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <div className={lightTheme}>
    {import.meta.env.DEV ? <AppWithDevtool /> : <App />}
  </div>
);
