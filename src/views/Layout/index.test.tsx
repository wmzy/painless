// 来源：双通道缓存落地——Layout 登出链路（logout → invalidate(viewStack)
// → navigate）与 bfcache 恢复补偿（pageshow persisted → refresh）；
// as 组合批——导航栏 NavLink as={HazeNavLink} 的 SPA 化与 active 高亮。
// 路由与 UI 库均 mock（同 Home/Article 测试约定），@native-router/core
// 的 navigate/invalidate/refresh 以 spy 替身断言调用与顺序。
import type {ReactNode} from 'react';

import type {RouterInstance} from '@native-router/core';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent, createEvent} from '@testing-library/react';


const state = vi.hoisted(() => ({
  // 宽松替身（真实 navigate 的 router 参数类型收不进字面量），仅承载
  // Layout/NavLink 替身读写的 location.pathname 与引用相等断言
  router: {history: {location: {pathname: '/'}}} as unknown as RouterInstance<
    never,
    never
  >,
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
    // 对齐 haze-ui 本地版 NavLink 的组合契约：rest 透传到 <a>，active
    // 缺省时兜底读 aria-current='page'（导航高亮链路的接收端）
    NavLink: ({
      children,
      href,
      onClick,
      active,
      'aria-current': ariaCurrent,
      ...rest
    }: {
      children?: ReactNode;
      href?: string;
      onClick?: () => void;
      active?: boolean;
    } & Record<string, unknown>) =>
      React.createElement(
        'a',
        {
          href: href ?? '#',
          onClick: onClick as unknown as React.MouseEventHandler,
          'aria-current': active || ariaCurrent === 'page' ? 'page' : undefined,
          ...rest
        },
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

vi.mock('@native-router/react', async () => {
  const React = await import('react');
  // 与 core 的 mock 共享同一批 spy：替身 NavLink 的点击必须落到测试里
  // 断言的同一个 navigate 实例上
  const {navigate} = await import('@native-router/core');
  return {
    useRouter: () => state.router,
    View: () => null,
    ScrollRestoration: () => null,
    // NavLink 替身复刻库的可观测契约：href 取 to、命中当前路由注
    // aria-current='page'（to='/' 尾斜杠对所有路径 active，end 时只认
    // 精确相等）、点击 preventDefault + in-app navigate、注入 props 全部
    // 交 as 组件承接
    NavLink: ({
      to,
      end,
      children,
      as: As,
      ...rest
    }: {
      to: string;
      end?: boolean;
      children?: ReactNode;
      as?: React.ElementType;
    } & Record<string, unknown>) => {
      const {pathname} = state.router.history.location;
      const isActive =
        pathname === to ||
        (!end && pathname.startsWith(to.endsWith('/') ? to : `${to}/`));
      const A = As ?? 'a';
      return React.createElement(
        A,
        {
          ...rest,
          href: to,
          'aria-current': isActive ? 'page' : undefined,
          onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            void navigate(state.router, to);
          }
        },
        children
      );
    }
  };
});

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
  state.router.history.location.pathname = '/';
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

describe('Layout 导航（NavLink as={HazeNavLink} 组合）', () => {
  it('点击导航链接走 in-app navigate 而非整页跳转', () => {
    renderView(<Layout />);

    // href 仍是真实路径（中键/新标签的兜底通道），但左键点击被接管
    expect(screen.getByText('Help').closest('a')!.getAttribute('href')).toBe(
      '/help'
    );

    // 以原生点击事件断言默认行为被取消（裸 <a> 的整页跳转不复存在）
    // 且 in-app navigate 携正确目标被调用
    const evt = createEvent.click(screen.getByText('Help'));
    fireEvent(screen.getByText('Help'), evt);

    expect(evt.defaultPrevented).toBe(true);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/help');
  });

  it('当前路由对应链接带 aria-current="page"（active 高亮链路）', () => {
    // native NavLink 命中当前路由注 aria-current，haze-ui NavLink 兜底
    // 读它点亮 active——整条链路落在渲染出的 <a> 上即视为接通
    state.router.history.location.pathname = '/help';
    // 匿名态：断言面落在 Login 上（登录态该槽位渲染的是 New Article）
    state.user = null;
    renderView(<Layout />);

    expect(screen.getByText('Help').getAttribute('aria-current')).toBe('page');
    // 未命中的普通链接不带；根路径链接（品牌/Home）带 end，只认精确
    // 相等——非首页不点亮（否则 to='/' 前缀规则对所有路径 active）
    expect(screen.getByText('About').getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Login').getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Home').getAttribute('aria-current')).toBeNull();
    expect(
      screen.getByText('Painless').closest('a')!.getAttribute('aria-current')
    ).toBeNull();
  });
});
