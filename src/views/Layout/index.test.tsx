// 来源：双通道缓存落地——Layout 登出链路（logout → invalidate(viewStack)
// → navigate）与 bfcache 恢复补偿（pageshow persisted → refresh）。
// 路由与 UI 库均 mock（同 Home/Article 测试约定），@native-router/core
// 的 navigate/invalidate/refresh 以 spy 替身断言调用与顺序。
import type {ReactNode} from 'react';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent} from '@testing-library/react';


const state = vi.hoisted(() => ({
  router: {history: {}},
  user: null as {username: string; email: string; token: string} | null
}));

vi.mock('haze-ui', async () => {
  const React = await import('react');
  const box = (Tag: string) => {
    const C = ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) =>
      React.createElement(Tag, rest, children);
    return C;
  };
  return {
    NavigationBar: box('nav'),
    NavLink: ({
      children,
      href,
      onClick
    }: {
      children?: ReactNode;
      href?: string;
      onClick?: () => void;
    }) =>
      React.createElement(
        'a',
        {href: href ?? '#', onClick: onClick as unknown as React.MouseEventHandler},
        children
      ),
    Container: box('div'),
    Title: box('h1'),
    // renderView 包装用的 provider：透传 children 即可
    ToastContainer: ({children}: {children?: ReactNode}) =>
      React.createElement(React.Fragment, null, children),
    // ThemeToggle 的开关：替身渲染为 button（role/aria 断言可用）
    Switch: ({checked, ...rest}: {checked?: unknown} & Record<string, unknown>) =>
      React.createElement('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': String(!!checked),
        ...rest
      })
  };
});

vi.mock('@native-router/react', () => ({
  useRouter: () => state.router,
  View: () => null,
  ScrollRestoration: () => null
}));

vi.mock('@native-router/core', () => ({
  navigate: vi.fn(),
  invalidate: vi.fn(),
  refresh: vi.fn()
}));

vi.mock('@/services/auth', () => ({
  getCurrentUser: () => state.user,
  logout: vi.fn(),
  onAuthChange: () => () => undefined
}));

import {navigate, invalidate, refresh} from '@native-router/core';

import {renderView} from '@/test-utils';
import {logout} from '@/services/auth';

import Layout from './index';

const navigateMock = vi.mocked(navigate);
const invalidateMock = vi.mocked(invalidate);
const refreshMock = vi.mocked(refresh);
const logoutMock = vi.mocked(logout);

beforeEach(() => {
  vi.resetAllMocks();
  state.user = {username: 'me', email: 'me@example.com', token: 'jwt'};
});

describe('Layout 登出', () => {
  it('Logout：logout → invalidate(viewStack) → navigate("/")，invalidate 先于 navigate', () => {
    renderView(<Layout />);

    fireEvent.click(screen.getByText('Logout'));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    // 清 viewStack：防 POP 回退渲染旧账号数据/绕过守卫（logout 已清
    // queryCache，快照是最后一块旧账号状态）
    expect(invalidateMock).toHaveBeenCalledWith(state.router);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
    // 顺序：invalidate 必须在 navigate 之前完成快照丢弃
    expect(invalidateMock.mock.invocationCallOrder[0]).toBeLessThan(
      navigateMock.mock.invocationCallOrder[0]!
    );
  });

  it('未登录：导航只渲染 Login/Register，无 Logout 入口', () => {
    state.user = null;
    renderView(<Layout />);

    expect(screen.queryByText('Logout')).toBeNull();
    expect(screen.getByText('Login')).toBeDefined();
  });
});

describe('Layout bfcache 恢复补偿', () => {
  it('pageshow(persisted)：refresh(router) 重跑 loader 换新鲜度', () => {
    renderView(<Layout />);

    fireEvent(window, new PageTransitionEvent('pageshow', {persisted: true}));

    expect(refreshMock).toHaveBeenCalledWith(state.router);
  });

  it('普通 pageshow（非 bfcache 恢复）：不 refresh', () => {
    renderView(<Layout />);

    fireEvent(window, new PageTransitionEvent('pageshow', {persisted: false}));

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('卸载后不再监听 pageshow', () => {
    const {unmount} = renderView(<Layout />);
    unmount();

    fireEvent(window, new PageTransitionEvent('pageshow', {persisted: true}));

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('ThemeToggle：点击切换 aria 状态（dark mode 接线）', () => {
    renderView(<Layout />);

    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);
    // 根部 lightTheme/darkTheme 切换由 ThemeControlCtx 驱动；Layout 单
    // 视图测试验证开关本身的状态翻转接线
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });
});
