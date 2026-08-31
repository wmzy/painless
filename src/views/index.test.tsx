// requireLogin 的 context 化迁移（@native-router ≥1.10 的 Router context，
// decisions.md 第 3 条的落地验证）：守卫只经 ctx.context 取当前用户，
// 不再直接依赖 auth 模块状态——单测换一份 context 即可驱动两个分支，
// 无需重置模块单例；再用 MemoryRouter + 真 Router context 走一遍完整
// 链路（context prop 注入 → 守卫读取 → resolve 期重定向），覆盖升级后
// 的库侧行为。
import type {User} from '@/services/auth';

import {act} from 'react';
import {MemoryRouter, View, createRoutes, useRouter} from '@native-router/react';
import {back, forward, navigate} from '@native-router/core';

import {describe, it, expect, vi} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';

import {StackWarmer, requireLogin, type RouterContext} from './index';

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

describe('StackWarmer（initHistoryStack 刷新预热）', () => {
  it('刷新后（history.state 窗口恢复 + 预热）窗内 back/forward 零重解析', async () => {
    // loader 计数即「是否重新解析」的可观测信号：冷启动 resolve、预热、
    // 惰性重解析各计一次
    const loadA = vi.fn(async () => 'a');
    const loadB = vi.fn(async () => 'b');
    const routes = createRoutes([
      {path: '/a', data: loadA, component: () => Promise.resolve(() => <b>a</b>)},
      {path: '/b', data: loadB, component: () => Promise.resolve(() => <b>b</b>)}
    ]);

    // 会话 1：建立 ['/a','/b'] 双条目窗口。navigate 的 push 把窗口
    //（index/base/locationStack）序列化进 history.state——刷新前真实
    // 发生的事；Probe 经 Router context 取实例（StackWarmer 同款口子）
    let router1!: ReturnType<typeof useRouter>;
    const Probe1 = () => {
      router1 = useRouter();
      return null;
    };
    const session1 = render(
      <MemoryRouter routes={routes} initialEntries={['/a']}>
        <View />
        <Probe1 />
      </MemoryRouter>
    );
    expect(await screen.findByText('a')).toBeDefined();
    await act(async () => {
      await navigate(router1, '/b');
    });
    expect(await screen.findByText('b')).toBeDefined();
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
    // 刷新点的序列化窗口（memory history 的 initialEntries 接受带
    // state 的 location 描述符，state 原样成为新会话的起始条目）
    const refreshState = router1.history.location.state;
    session1.unmount();

    // 会话 2（= 刷新后）：core 的 create 从该 state 恢复 locationStack
    // 窗口与落点 index，viewStack 全空；StackWarmer 挂载即预热窗内全部
    // 可达条目。浏览器刷新保留整条历史栈，这里以双条目 + initialIndex
    // 复刻：POP 回 '/a' 时 state 无 index（真会话里该条目早于窗口序列化）
    // 恰落 0——与恢复的 baseIndex 对齐
    let router2!: ReturnType<typeof useRouter>;
    const Probe2 = () => {
      router2 = useRouter();
      return null;
    };
    render(
      <MemoryRouter
        routes={routes}
        initialEntries={[{pathname: '/a'}, {pathname: '/b', state: refreshState}]}
        initialIndex={1}
      >
        <View />
        <Probe2 />
        <StackWarmer />
      </MemoryRouter>
    );
    expect(await screen.findByText('b')).toBeDefined();
    // 预热完成即窗内条目全部有快照。计数口径：'/a' 被预热 1 次（共 2）；
    // 落点 '/b' 被冷启动 refresh 与预热各 1 次（共 3）——真实应用里后者
    // 经 withCache 的 in-flight 共享并成同一请求（见 util/loaderCache.ts），
    // 此处裸 loader 各记一次
    await waitFor(() =>
      expect(router2.viewStack.every((v) => v != null)).toBe(true)
    );
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadB).toHaveBeenCalledTimes(3);

    // 窗内 back：落预热快照直出，零重解析（不预热时此处会第三次调用
    // loadA——惰性重解析路径，正是本组件要消灭的请求）
    act(() => {
      back(router2);
    });
    expect(await screen.findByText('a')).toBeDefined();
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadB).toHaveBeenCalledTimes(3);

    // 窗内 forward：同样落快照
    act(() => {
      forward(router2);
    });
    expect(await screen.findByText('b')).toBeDefined();
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadB).toHaveBeenCalledTimes(3);
  });
});
