// requireLogin 的 context 化迁移（@native-router ≥1.10 的 Router context，
// decisions.md 第 3 条的落地验证）：守卫只经 ctx.context 取当前用户，
// 不再直接依赖 auth 模块状态——单测换一份 context 即可驱动两个分支，
// 无需重置模块单例；再用 MemoryRouter + 真 Router context 走一遍完整
// 链路（context prop 注入 → 守卫读取 → resolve 期重定向），覆盖升级后
// 的库侧行为。
import type {User} from '@/services/auth';

import {MemoryRouter, View, createRoutes} from '@native-router/react';

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';

import {requireLogin, type RouterContext} from './index';

const user: User = {username: 'ada', email: 'ada@x', token: 't'};

// 守卫只消费 ctx.context，其余成员（router/params/search/signal）构造
// 最小替身——断言收窄在 guard 契约本身，不绑 GuardContext 全形状
const guardCtx = (getUser: RouterContext['getUser']) =>
  ({context: {getUser}}) as Parameters<typeof requireLogin>[0];

describe('requireLogin（ctx.context 注入）', () => {
  it('context 无用户：返回 /login 重定向', () => {
    expect(requireLogin(guardCtx(() => null))).toBe('/login');
  });

  it('context 有用户：放行（undefined）', () => {
    expect(requireLogin(guardCtx(() => user))).toBeUndefined();
  });
});

describe('Router context → requireLogin 链路（MemoryRouter 集成）', () => {
  // 复用 App 的守卫本体：表结构最小化，但 beforeLoad 与 context 形状
  // 同 src/views/index.tsx——验证的是同一份契约在真 Router 上的行为
  const routes = createRoutes([
    {
      path: '/secret',
      beforeLoad: requireLogin,
      component: () => Promise.resolve(() => <b>secret</b>)
    },
    {path: '/login', component: () => Promise.resolve(() => <b>login</b>)}
  ]);

  it('未登录访问受守卫路由：resolve 期重定向到 /login，URL 不落守卫路由', async () => {
    render(
      <MemoryRouter
        routes={routes}
        initialEntries={['/secret']}
        context={{getUser: () => null}}
      >
        <View />
      </MemoryRouter>
    );
    expect(await screen.findByText('login')).toBeDefined();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('已登录访问受守卫路由：放行进入', async () => {
    render(
      <MemoryRouter
        routes={routes}
        initialEntries={['/secret']}
        context={{getUser: () => user}}
      >
        <View />
      </MemoryRouter>
    );
    expect(await screen.findByText('secret')).toBeDefined();
  });
});
