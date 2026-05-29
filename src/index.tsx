import {createRoot} from 'react-dom/client';
import 'haze-ui/styles.css';
import {lightTheme} from 'haze-ui';

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
