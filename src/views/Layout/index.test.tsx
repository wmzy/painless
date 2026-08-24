// 来源：双通道缓存落地——Layout 登出链路（logout → invalidate(viewStack)
// → navigate）与 bfcache 恢复补偿（pageshow persisted → refresh）。
// 路由与 UI 库均 mock（同 Home/Article 测试约定），@native-router/core
// 的 navigate/invalidate/refresh 以 spy 替身断言调用与顺序。
import type {ReactNode} from 'react';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';

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
    Title: box('h1')
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
    render(<Layout />);

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
    render(<Layout />);

    expect(screen.queryByText('Logout')).toBeNull();
    expect(screen.getByText('Login')).toBeDefined();
  });
});

describe('Layout bfcache 恢复补偿', () => {
  it('pageshow(persisted)：refresh(router) 重跑 loader 换新鲜度', () => {
    render(<Layout />);

    fireEvent(window, new PageTransitionEvent('pageshow', {persisted: true}));

    expect(refreshMock).toHaveBeenCalledWith(state.router);
  });

  it('普通 pageshow（非 bfcache 恢复）：不 refresh', () => {
    render(<Layout />);

    fireEvent(window, new PageTransitionEvent('pageshow', {persisted: false}));

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('卸载后不再监听 pageshow', () => {
    const {unmount} = render(<Layout />);
    unmount();

    fireEvent(window, new PageTransitionEvent('pageshow', {persisted: true}));

    expect(refreshMock).not.toHaveBeenCalled();
  });
});
