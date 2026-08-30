// 来源：#9 主题系统档跟随——useAppTheme（util/theme.tsx）的系统跟随、
// 手动干预停跟与监听器清理。util/ 下此前无覆盖 theme 的测试文件，按
// 测试放置规则（与被测模块同目录同名）新建本文件。
// 归并建议：暂无归属冲突；若后续建 ThemeToggle 专属测试（现经
// Layout/index.test.tsx 间接覆盖）或根组件集成测试，可把本文件的
// hook 用例并入，避免主题用例散落孤岛。
import {describe, it, expect, afterEach} from 'vitest';
import {render, screen, act, fireEvent} from '@testing-library/react';
import {StrictMode} from 'react';
import {useControl} from 'react-use-control';

import {useAppTheme, ThemeControlCtx, useThemeControl} from './theme';

// jsdom 不实现 window.matchMedia：安装可控替身。同一 query 字符串返回
// 同一 MQL 实例（hook 的 lazy 初始与 effect 各查一次），change 监听由
// Set 管理，setSystem 模拟系统切档并派发 change 事件。
type MediaListener = (e: {matches: boolean}) => void;

function installMatchMedia(initialDark: boolean) {
  const listeners = new Set<MediaListener>();
  let matches = initialDark;
  // 替身只实现 hook 用到的面（matches/addEventListener/
  // removeEventListener），按 window.matchMedia 的原类型直接赋值
  const mql = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: MediaListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: MediaListener) => {
      listeners.delete(listener);
    }
    // 替身只实现 hook 用到的面（matches/add/removeEventListener），
    // 缺 media/onchange 等成员——一次性断言成 MediaQueryList 后按
    // window.matchMedia 的原类型直接赋值
  } as unknown as MediaQueryList;
  window.matchMedia = () => mql;
  return {
    setSystem(dark: boolean) {
      matches = dark;
      listeners.forEach((listener) => listener({matches: dark}));
    },
    listenerCount: () => listeners.size
  };
}

afterEach(() => {
  // matchMedia 在 jsdom 本不存在（本文件才补的），还原现场
  Reflect.deleteProperty(window, 'matchMedia');
});

// useAppTheme 的宿主：等价于 src/index.tsx 的 Root——创建主题状态、经
// ThemeControlCtx 下发；data-testid 探针读当前主题档。
function ThemeHost() {
  const [dark, themeControl] = useAppTheme();
  return (
    <ThemeControlCtx.Provider value={themeControl}>
      <span data-testid='theme'>{dark ? 'dark' : 'light'}</span>
      <ManualProbe />
    </ThemeControlCtx.Provider>
  );
}

// 模拟 ThemeToggle 的真实消费方式：从 context 取 control 经 useControl
// 读写——与生产组件同一协议，确保「经 control 的写入被插桩标记 manual」
// 在真实链路上成立（而非只在直接调 setter 时成立）。
function ManualProbe() {
  const themeControl = useThemeControl();
  const [dark, setDark] = useControl(themeControl, false);
  return (
    <button type='button' onClick={() => setDark(!dark)}>
      manual-toggle
    </button>
  );
}

describe('useAppTheme 系统档跟随', () => {
  it('未手动干预时持续跟随系统切档（初始值取自 prefers-color-scheme）', () => {
    const media = installMatchMedia(false);
    render(<ThemeHost />);

    // lazy 初始：首渲染即取系统当前档
    expect(screen.getByTestId('theme').textContent).toBe('light');

    act(() => media.setSystem(true));
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    act(() => media.setSystem(false));
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('经 control 手动干预后，本次会话内不再跟随系统', () => {
    const media = installMatchMedia(false);
    render(<ThemeHost />);

    fireEvent.click(screen.getByRole('button', {name: 'manual-toggle'}));
    expect(screen.getByTestId('theme').textContent).toBe('dark');

    // 系统随后无论切到哪档都不再驱动主题（dark 也不、light 也不）
    act(() => media.setSystem(false));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    act(() => media.setSystem(true));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('StrictMode 双挂载后恰剩一个监听器；卸载后清理干净', () => {
    const media = installMatchMedia(false);
    const {unmount} = render(
      <StrictMode>
        <ThemeHost />
      </StrictMode>
    );

    // 开发模式双效应（挂载→清理→挂载）若清理不成对会剩 2 个
    expect(media.listenerCount()).toBe(1);

    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
