import {createRoot} from 'react-dom/client';
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
root.render(import.meta.env.DEV ? <AppWithDevtool /> : <App />);
