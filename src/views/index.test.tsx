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

import {homeSearchSchema} from '@/types/search';

import {StackWarmer, requireLogin, type RouterContext} from './index';

const user: User = {username: 'ada', email: 'ada@x', token: 't', bio: null, image: null};

// 守卫只消费 ctx.context 与 ctx.location，其余成员（router/params/
// search/signal）构造最小替身——断言收窄在 guard 契约本身，不绑
// GuardContext 全形状。location 按 history 的 Path 形状（pathname +
// search，search 含前导 '?'）
const guardCtx = (
  getUser: RouterContext['getUser'],
  pathname = '/editor',
  search = ''
) =>
  ({context: {getUser}, location: {pathname, search}}) as Parameters<
    typeof requireLogin
  >[0];

describe('requireLogin（ctx.context 注入）', () => {
  it('context 无用户：返回 /login，原 pathname+search 整体 encode 进 redirect', () => {
    // 整体 encodeURIComponent：'/'、'?'、'&' 全部转义——裸拼会把原
    // query 混进 /login 自己的 search（?a=1&redirect=/x?b=2 会解析出
    // b=2），Login 侧就读不回完整原目的页了
    expect(requireLogin(guardCtx(() => null, '/editor/my-slug', '?a=1&b=2'))).toBe(
      `/login?redirect=${encodeURIComponent('/editor/my-slug?a=1&b=2')}`
    );
    // 无 search 的普通深链：pathname 裸 '/' 同样被转义（%2F）
    expect(requireLogin(guardCtx(() => null, '/editor'))).toBe(
      '/login?redirect=%2Feditor'
    );
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

  it('未登录访问受守卫路由：resolve 期重定向到 /login?redirect=…，URL 不落守卫路由', async () => {
    // 深链含 query：原目的页整段（含 search）encode 进 redirect
    let router!: ReturnType<typeof useRouter>;
    const Probe = () => {
      router = useRouter();
      return null;
    };
    render(
      <MemoryRouter
        routes={routes}
        initialEntries={['/secret?tab=2']}
        context={{getUser: () => null}}
      >
        <View />
        <Probe />
      </MemoryRouter>
    );
    expect(await screen.findByText('login')).toBeDefined();
    expect(screen.queryByText('secret')).toBeNull();
    // URL 侧是 encode 后的单个 redirect 参数（无 tab=2 泄漏到顶层）
    expect(router.history.location.pathname).toBe('/login');
    expect(router.history.location.search).toBe(
      `?redirect=${encodeURIComponent('/secret?tab=2')}`
    );
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

  // 守卫缓解（组件头注释的「已知边界与缓解」）：预热 resolve 不经
  // beforeLoad，未登录刷新后窗口含守卫路由时 POP 会落预热快照绕过
  // requireLogin。两组用例分别钉「未登录跳过（守卫重新生效）」与
  // 「已登录照常预热（快照无绕过可言）」，登录态经 Router 的 context
  // 注入驱动（decisions 第 3 条的每实例形态）
  it('未登录且窗口含守卫路由：整窗跳过预热——POP 落重解析路径，守卫重新生效', async () => {
    const loadA = vi.fn(async () => 'a');
    const loadG = vi.fn(async () => 'editor');
    const routes = createRoutes([
      {path: '/a', data: loadA, component: () => Promise.resolve(() => <b>a</b>)},
      {
        path: '/editor',
        beforeLoad: requireLogin,
        data: loadG,
        component: () => Promise.resolve(() => <b>editor</b>)
      },
      {path: '/login', component: () => Promise.resolve(() => <b>login</b>)}
    ]);

    // 会话 1（已登录）：建立 ['/a','/editor'] 窗口——守卫在登录态放行
    let router1!: ReturnType<typeof useRouter>;
    const Probe1 = () => {
      router1 = useRouter();
      return null;
    };
    const session1 = render(
      <MemoryRouter routes={routes} initialEntries={['/a']} context={{getUser: () => user}}>
        <View />
        <Probe1 />
      </MemoryRouter>
    );
    expect(await screen.findByText('a')).toBeDefined();
    await act(async () => {
      await navigate(router1, '/editor');
    });
    expect(await screen.findByText('editor')).toBeDefined();
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadG).toHaveBeenCalledTimes(1);
    const refreshState = router1.history.location.state;
    session1.unmount();

    // 会话 2（= 刷新后，未登录）：落点 '/editor'。冷启动 resolve 照常跑守卫
    // → 重定向 /login（URL 不落守卫路由）；StackWarmer 检出「未登录 +
    // 守卫窗口」整窗跳过预热
    let router2!: ReturnType<typeof useRouter>;
    const Probe2 = () => {
      router2 = useRouter();
      return null;
    };
    render(
      <MemoryRouter
        routes={routes}
        initialEntries={[{pathname: '/a'}, {pathname: '/editor', state: refreshState}]}
        initialIndex={1}
        context={{getUser: () => null}}
      >
        <View />
        <Probe2 />
        <StackWarmer />
      </MemoryRouter>
    );
    expect(await screen.findByText('login')).toBeDefined();
    expect(screen.queryByText('editor')).toBeNull();
    // 预热被跳过的可观测信号：'/a' 的 loader 未被预热触碰（不跳过则
    // 此处已是 2）、'/a' 槽位无快照。flush 让「本会发生的预热」有机会
    // 跑完，负断言才可信
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(router2.viewStack[0] == null).toBe(true);

    // POP 回 '/a'：无快照可落 → 惰性重解析（守卫语义换重解析成本，
    // 正是缓解的取舍面）
    act(() => {
      back(router2);
    });
    expect(await screen.findByText('a')).toBeDefined();
    expect(loadA).toHaveBeenCalledTimes(2);
  });

  it('已登录：窗口含守卫路由照常预热——POP 落快照零重解析', async () => {
    const loadA = vi.fn(async () => 'a');
    const loadG = vi.fn(async () => 'editor');
    const routes = createRoutes([
      {path: '/a', data: loadA, component: () => Promise.resolve(() => <b>a</b>)},
      {
        path: '/editor',
        beforeLoad: requireLogin,
        data: loadG,
        component: () => Promise.resolve(() => <b>editor</b>)
      }
    ]);

    let router1!: ReturnType<typeof useRouter>;
    const Probe1 = () => {
      router1 = useRouter();
      return null;
    };
    const session1 = render(
      <MemoryRouter routes={routes} initialEntries={['/a']} context={{getUser: () => user}}>
        <View />
        <Probe1 />
      </MemoryRouter>
    );
    expect(await screen.findByText('a')).toBeDefined();
    await act(async () => {
      await navigate(router1, '/editor');
    });
    expect(await screen.findByText('editor')).toBeDefined();
    const refreshState = router1.history.location.state;
    session1.unmount();

    // 会话 2（登录态未变）：落点 '/editor' 守卫放行；预热照常——守卫在登录
    // 态本就放行，快照不构成绕过。计数口径同首例：落点被冷启动与预热
    // 各 1 次（loadG 共 3），'/a' 被预热 1 次（共 2）
    let router2!: ReturnType<typeof useRouter>;
    const Probe2 = () => {
      router2 = useRouter();
      return null;
    };
    render(
      <MemoryRouter
        routes={routes}
        initialEntries={[{pathname: '/a'}, {pathname: '/editor', state: refreshState}]}
        initialIndex={1}
        context={{getUser: () => user}}
      >
        <View />
        <Probe2 />
        <StackWarmer />
      </MemoryRouter>
    );
    expect(await screen.findByText('editor')).toBeDefined();
    await waitFor(() =>
      expect(router2.viewStack.every((v) => v != null)).toBe(true)
    );
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadG).toHaveBeenCalledTimes(3);

    // POP 回 '/a'：落预热快照直出，零重解析
    act(() => {
      back(router2);
    });
    expect(await screen.findByText('a')).toBeDefined();
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadG).toHaveBeenCalledTimes(3);
  });
});

describe('searchDeps 快路径（Home 链声明形态）', () => {
  // 表形态镜像 src/views/index.tsx 的 Home 链：布局层 searchDeps: [] +
  // 叶子层挂真实 homeSearchSchema。计数口径同上：loader 调用次数即
  // 「是否重新解析」的可观测信号（快路径零重跑 = 守卫/loader/懒加载全
  // 跳，与 POP 落 viewStack 快照同一条路）。
  const mount = (leafDeps?: string[]) => {
    const load = vi.fn(async (ctx: any) => `page-${ctx.search.offset}`);
    const routes = createRoutes({
      component: () => Promise.resolve(() => <View />),
      // 布局层不消费 search：声明 []（链覆盖是全有或全无——任一层
      // 未声明即整链退回「任何 search 变化都重解析」的现状）
      searchDeps: [],
      children: [
        {
          path: '/',
          search: homeSearchSchema,
          // 全量键（tag/offset/limit）：schema 严格校验的键必须全部
          // 声明——快路径跳过 resolve 期 schema，漏声明的键的非法值
          // 会落 URL 无人检查
          ...(leafDeps ? {searchDeps: leafDeps} : {}),
          data: load,
          component: () => Promise.resolve(() => <b>home</b>)
        }
      ]
    });
    let router!: ReturnType<typeof useRouter>;
    const Probe = () => {
      router = useRouter();
      return null;
    };
    const view = render(
      <MemoryRouter routes={routes} initialEntries={['/']}>
        <View />
        <Probe />
      </MemoryRouter>
    );
    return {load, router, view};
  };

  it('声明键变化（翻页 offset）→ 整链重解析，loader 读到新 search', async () => {
    const {load, router} = mount(['tag', 'offset', 'limit']);
    expect(await screen.findByText('home')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await navigate(router, '/?offset=10');
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    // loader 收到的是 schema coerce 后的新 search（分页行为不变）
    expect(load.mock.calls[1]![0].search).toEqual({offset: 10, limit: 10});
  });

  it('同 search 重复导航 → 快照复用零重跑', async () => {
    const {load, router} = mount(['tag', 'offset', 'limit']);
    expect(await screen.findByText('home')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await navigate(router, '/');
    });
    // 负断言的结算窗：navigate 已 resolve，若走了重解析路径 loader 会
    // 在 resolve 内同步启动，微任务冲刷后计数仍是 1 才可信
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('无关 search 键变化 → 零重跑，URL 照常更新（视图经 useSearch 读 live 值）', async () => {
    const {load, router} = mount(['tag', 'offset', 'limit']);
    expect(await screen.findByText('home')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await navigate(router, '/?foo=bar');
    });
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1);
    // 快照复用不拦 URL：新条目照常入栈（hash/state 永不参与比较）
    expect(router.history.location.search).toBe('?foo=bar');
  });

  it('纯 hash 变化 → 零重跑（hash 不是 resolve 输入）', async () => {
    const {load, router} = mount(['tag', 'offset', 'limit']);
    expect(await screen.findByText('home')).toBeDefined();
    await act(async () => {
      await navigate(router, '/#section');
    });
    await act(async () => { await Promise.resolve(); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('对照：链上任一层未声明（叶子缺 searchDeps）→ 无关键变化照旧整链重解析', async () => {
    const {load, router} = mount();
    expect(await screen.findByText('home')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      await navigate(router, '/?foo=bar');
    });
    // 字节级现状：叶子未声明（布局层声明了也没用），任何 search 变化
    // 都重跑整链——这正是「链覆盖全有或全无」的守门语义
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
