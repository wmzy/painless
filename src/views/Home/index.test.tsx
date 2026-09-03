// 来源：第 3 批评审任务——Home 视图「当前 tag」Chip 取消、上一页/下一页
// 分页（含边界禁用）的行为验证。Home 目录此前无测试文件，故新建；路由与
// UI 库均 mock，Tags 侧栏以 stub 隔离（真实 Tags 静态依赖 vite 插件的虚拟
// 模块 '@/types/index.schema'，vitest 管线无法解析，其交互在浏览器中验证）。
// 双通道缓存落地批：卡片 favorite 走 cache.mutation 组合管道（乐观 +
// 服务调用 + apply + 失败回滚），useData mock 直读 homeCache 的最新
// settled 值、
// refresh mock 广播重渲染，模拟「loader 重跑 → withCache 新鲜命中 →
// 视图换新」链路。
// 分页链接化批：翻页控件改为 TypedLink 表形态（search 序列化进链接），
// 断言从「setSearch 载荷」改为「navigate 目标 URL + href 预览」；tag 取消
// 仍走 useSetSearch 写入口。
import type {ReactNode} from 'react';
import type {ArticlePage} from '@/types';
import type {AppRoutes} from '@/views';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent, waitFor, act} from '@testing-library/react';

import {navigate, refresh} from '@native-router/core';
import {TypedLink} from '@native-router/react';

import {renderView} from '@/test-utils';

// 编译期反向用例（tsc --noEmit 守门，vitest 本身不跑类型检查）：
// TypedLink 表形态的 search prop 按 homeSearchSchema 的 Input 位
//（HomeSearchInput）判别——字段拼错必须在编译期报错，两个方向都有守门：
// 判别若失效（Input 位退回 unknown → search 回到宽松 SearchInput、字段名
// 不查），下面的 @ts-expect-error 会反向报「Unused '@ts-expect-error'
// directive」；正向对照证明合法载荷（offset/limit 的 string/number 值
// 均可，序列化时 String() 化）不被误伤。两段 JSX 只作类型检查消费，
// 运行时仅 createElement（mock 的 TypedLink 不渲染），零副作用。
void (
  <TypedLink<AppRoutes> to='/' search={{tag: 'a', offset: '10', limit: 20}} />
);
void (
  // @ts-expect-error search 字段拼错应在编译期报错
  <TypedLink<AppRoutes> to='/' search={{ofset: '10'}} />
);




const state = vi.hoisted(() => ({
  data: {articles: [] as unknown[], articlesCount: 0},
  search: '',
  router: {history: {}},
  // useToast 替身的调用记录（favorite 失败提示断言用）
  toastMessages: [] as string[],
  // Card 替身的渲染计数探针（ArticlePreview memo 生效断言用）：本文件
  // 的视图树里 Card 只出现在文章卡片内（Tags 已 stub、分页走 ButtonLink
  // 替身），计数即卡片渲染次数
  cardRenders: 0,
  // go/toggleTag 的写入口（useSetSearch）：断言写入的 search 载荷
  setSearch: vi.fn(),
  // refresh mock 的重渲染广播：补丁缓存写穿后调 refresh(router)，真实
  // 链路是「loader 重跑 → withCache 新鲜命中 → useData 换新」，这里用
  // bump 回调近似——useData mock 每次渲染直读 queryCache 的最新 settled
  // 值（loader 命中的就是它）
  listeners: new Set<() => void>(),
  emit: () => {
    for (const l of state.listeners) l();
  },
  // 解析逻辑与 src/types/search.ts 的 schema 等价（coerce + 缺省），
  // useSearch 与 useData 的缓存寻址共用，保证与视图侧 homeCacheArgs
  // 同 key
  parseSearch: (search: string) => {
    const raw = Object.fromEntries(new URLSearchParams(search));
    const num = (v: string | undefined) => {
      const n = Number(v);
      return v != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    };
    return {
      tag: raw.tag && raw.tag !== '' ? raw.tag : undefined,
      offset: num(raw.offset) ?? 0,
      limit: num(raw.limit) ?? 10
    };
  },
  // createDataLoader 的 DEV 来源校验（src/util/dataLoader.ts）要求
  // useMatched 提供 matched[index].route.data：模块加载后由测试体把
  // homeLoader 填进来（mock 工厂内 import dataloaders 会与被 mock 的
  // '@native-router/react' 循环，故走 hoisted state 中转）
  matchedRoute: {route: {}} as {route: {data: unknown}},
}));

// haze-ui 依赖 UMD 版 babel-runtime-jsx-plus，在 vitest 的 ESM 环境下无法
// 提供命名导出，整体替换为最小 stub（覆盖本视图用到的导出）
vi.mock('haze-ui', async () => {
  const React = await import('react');
  const box = (Tag: string) => {
    const C = ({children, ...rest}: {children?: ReactNode} & Record<string, unknown>) =>
      React.createElement(Tag, rest, children);
    return C;
  };
  return {
    Title: box('h1'),
    Text: box('span'),
    Badge: box('span'),
    // 计数探针见 state.cardRenders 注释：渲染即自增，断言侧在关键节点
    // 快照读数（挂载期/翻转后），跨用例由 beforeEach 归零
    Card: (() => {
      const C = box('section');
      return (props: {children?: ReactNode} & Record<string, unknown>) => {
        state.cardRenders++;
        return C(props);
      };
    })(),
    Avatar: box('img'),
    Flex: box('div'),
    Chip: ({children, onClose}: {children?: ReactNode; onClose?: () => void}) =>
      React.createElement(
        'span',
        {'data-testid': 'chip'},
        children,
        onClose
          ? React.createElement(
              'button',
              {type: 'button', 'aria-label': 'Remove tag', onClick: onClose},
              '×'
            )
          : null
      ),
    Button: ({
      children,
      disabled,
      onClick,
      ...rest
    }: {
      children?: ReactNode;
      disabled?: boolean;
      onClick?: () => void;
    } & Record<string, unknown>) =>
      React.createElement('button', {type: 'button', disabled, onClick, ...rest}, children),
    // 分页链接（TypedLink as={ButtonLink}）的替身：原生 <a> 透传 rest
    //（含 aria-disabled/tabIndex），role='link' 与边界态断言照常可读
    ButtonLink: box('a'),
    // Home 视图经 useToast 呈现收藏失败提示：替身只记录调用，断言侧
    // 覆盖「失败不吞」即可（toast 渲染本身是 haze-ui 的职责）。
    useToast: () => (message: string) => {
      state.toastMessages.push(message);
    },
    // renderView 包装用的 provider：透传 children 即可
    ToastContainer: ({children}: {children?: ReactNode}) =>
      React.createElement(React.Fragment, null, children)
  };
});

vi.mock('@native-router/react', async () => {
  const React = await import('react');
  const {homeCache} = await import('@/util/useQuery');
  // TypedLink 的导航出口走被 mock 的 core navigate（工厂内 import 拿到
  // 的已是 mock 注册表里的替身，断言口与视图直调 navigate 一致）
  const {navigate} = await import('@native-router/core');
  // navigate 的实参是 useMatched 替身里的宽松 router 形状，收窄到 mock
  // 侧的实际契约（router 透传 + 目标字符串）以绕开真实签名的
  // RouterInstance 要求
  const navigateTo = navigate as (router: unknown, to: string) => void;
  return {
    useData: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const listener = () => force((v) => v + 1);
        state.listeners.add(listener);
        return () => {
          state.listeners.delete(listener);
        };
      }, []);
      // 补丁后的视图换新：无缓存条目（loader 未跑过的冷启动态）回落到
      // 初始 data
      return homeCache.peek!([state.parseSearch(state.search)])?.value ?? state.data;
    },
    useSearch: () => state.parseSearch(state.search),
    useSetSearch: () => state.setSearch,
    // TypedLink 最小行为复刻：search 序列化进 query（undefined/null 丢弃，
    // 测试值无编码需求），href 预览与点击导航共用同一 target
    TypedLink: ({
      to,
      search,
      children,
      ...rest
    }: {
      to: string;
      search?: Record<string, string | undefined>;
      children?: ReactNode;
    } & Record<string, unknown>) => {
      const qs = Object.entries(search ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v!}`)
        .join('&');
      const target = qs ? `${to}?${qs}` : to;
      return React.createElement(
        'a',
        {
          ...rest,
          href: target,
          // 真实 TypedLink 对普通左键点击 preventDefault 后走 SPA 导航；
          // 同款处理顺带避免 jsdom 对锚点默认导航的 not-implemented 噪音
          onClick: (e: {preventDefault: () => void}) => {
            e.preventDefault();
            navigateTo(state.router, target);
          }
        },
        children
      );
    },
    // useHomeData 的 DEV 来源校验读 matched[index].route.data——见
    // state.matchedRoute 注释
    useMatched: () => ({
      location: {pathname: '/', search: state.search, hash: ''},
      params: {},
      router: state.router,
      matched: [state.matchedRoute],
      index: 0
    })
  };
});

// search.ts 的写侧 schema 已改由 core 的 writeSchema 派生（1.13）：
// importOriginal 展开真实模块再覆写 navigate/refresh——writeSchema 是
// 纯函数，用真实现即保持「URL 抹缺省」行为与产线一致
vi.mock('@native-router/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@native-router/core')>()),
  // core 1.15：被取代的导航 reject NavigationCancelledError，产线 void
  // navigate 调用点均挂 .catch(() => undefined)——mock 必须返回 Promise，
  // 同步 vi.fn() 会让 .catch 在 undefined 上炸掉（未登录 favorite 跳转）
  navigate: vi.fn(async () => undefined),
  refresh: vi.fn(async () => state.emit())
}));
vi.mock('@/components/PreviewLink', () => ({
  default: ({children}: {children?: ReactNode}) => children ?? null
}));
vi.mock('./Tags', () => ({default: () => null}));
// 第 4 批：卡片 favorite 走 service 层，mock 到 service
vi.mock('@/services/article', () => ({
  favoriteArticle: vi.fn(),
  query: vi.fn(),
  findByTitle: vi.fn(),
  fetchCommentsByTitle: vi.fn(),
  fetchTags: vi.fn()
}));
vi.mock('@/services/auth', () => ({getCurrentUser: vi.fn()}));


import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {bindCacheRefresh} from '@/util/loaderCache';
import {clearAllCaches, homeCache, resetAllCaches} from '@/util/useQuery';
import {homeLoader} from '@/services/dataloaders';

import Home from './index';

// DEV 来源校验的路由声明（见 state.matchedRoute 注释）：与
// src/views/index.tsx 的真实路由表同源
state.matchedRoute.route.data = homeLoader;

const navigateMock = vi.mocked(navigate);
const refreshMock = vi.mocked(refresh);
const favoriteMock = vi.mocked(articleService.favoriteArticle);
const getCurrentUserMock = vi.mocked(getCurrentUser);

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<any>((res) => (resolve = res));
  return {promise, resolve};
}

function makeArticles(n: number) {
  return Array.from({length: n}, (_, i) => ({
    slug: `slug-${i}`,
    title: `title-${i}`,
    description: `desc-${i}`,
    tagList: ['react'],
    author: {username: `user-${i}`, image: `https://example.com/${i}.png`},
    favorited: false,
    favoritesCount: i * 3
  }));
}

// 分页断言辅助：翻页控件已链接化（TypedLink as={ButtonLink}），以 link
// 角色定位；边界禁用态读 aria-disabled（链接无 disabled 属性，样式与
// 语义见视图分页注释）
function paginationLinks() {
  return {
    prev: screen.getByRole('link', {name: '← Previous'}),
    next: screen.getByRole('link', {name: 'Next →'})
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  // resetAllMocks 会清掉 vi.fn 的实现：refresh 的「重渲染广播」语义逐
  // 用例重建（navigate 无实现需求，仅断言调用）
  refreshMock.mockImplementation(async () => state.emit());
  state.setSearch.mockReset();
  state.toastMessages = [];
  state.cardRenders = 0;
  state.data = {articles: makeArticles(10), articlesCount: 25};
  state.search = '';
  getCurrentUserMock.mockReturnValue({
    username: 'me',
    email: 'me@example.com',
    token: 'jwt',
    bio: null,
    image: null
  });
  // 清场 + 注册表还原基线（homeCache 仍在册——下方 bindCacheRefresh 绑定
  // 的就是它，favorite 写穿链路语义不变）
  resetAllCaches();
  // 模拟生产链路的 loader 首跑副作用：绑定「cache set → refresh」订阅
  // （真实路由里 loader 先于组件运行；favorite 的乐观写穿经此通道自动
  // refresh 回写视图）。直接绑定而非跑真 loader——避免其异步 settle
  // 写入的条目污染各用例自设的缓存基线
  bindCacheRefresh(homeCache, state.router);
});

describe('Home 视图', () => {
  it('默认视图：无筛选 Chip，Previous 禁用、Next 可用，页码 1 / 3', () => {
    renderView(<Home />);

    expect(screen.queryByTestId('chip')).toBeNull();
    expect(screen.getByText('title-0')).toBeDefined();
    expect(screen.getByText('1 / 3')).toBeDefined();
    const {prev, next} = paginationLinks();
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('aria-disabled')).toBeNull();
  });

  // useTitle 接入批：jsdom 的 document 无 <title> 起始值，先铺入口默认
  // （index.html 的 Painless）再验证「进入设置 / 卸载恢复」契约
  it('document.title：进入设为 Home · Painless，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = renderView(<Home />);

    expect(document.title).toBe('Home · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
  });

  it('点击 Next 导航到目标页（offset 序列化进链接 search）', () => {
    renderView(<Home />);

    // href 预览与点击导航同一 target：⌘/中键新标签打开的可访问性来源
    const {next} = paginationLinks();
    expect(next.getAttribute('href')).toBe('/?offset=10');
    fireEvent.click(next);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/?offset=10');
  });

  it('search 含 tag：展示可取消 Chip，关闭即清空筛选', () => {
    state.search = '?tag=react';
    renderView(<Home />);

    expect(screen.getByTestId('chip').textContent).toContain('react');

    fireEvent.click(screen.getByRole('button', {name: 'Remove tag'}));
    // 取消筛选（useSetSearch 写入口）：整段 search 清空（写 schema 抹
    // 缺省后为空），URL 端为 /
    expect(state.setSearch).toHaveBeenCalledWith({});
  });

  it('第二页：Previous 可用且翻页保留 tag、回到首页时省略 offset', () => {
    state.search = '?tag=react&offset=10';
    state.data = {articles: makeArticles(10), articlesCount: 25};
    renderView(<Home />);

    expect(screen.getByText('2 / 3')).toBeDefined();
    const {prev} = paginationLinks();
    expect(prev.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(prev);
    // offset 回到 0 不进链接载荷（等于缺省即省略），URL 端为 /?tag=react
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/?tag=react');
  });

  it('末页边界：Next 禁用，Previous 回退一页', () => {
    state.search = '?tag=react&offset=20';
    state.data = {articles: makeArticles(5), articlesCount: 25};
    renderView(<Home />);

    expect(screen.getByText('3 / 3')).toBeDefined();
    const {prev, next} = paginationLinks();
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(prev.getAttribute('aria-disabled')).toBeNull();

    fireEvent.click(prev);
    expect(navigateMock).toHaveBeenCalledWith(
      state.router,
      '/?tag=react&offset=10'
    );
  });

  it('单页数据：两个方向均禁用', () => {
    state.data = {articles: makeArticles(3), articlesCount: 3};
    renderView(<Home />);

    expect(screen.getByText('1 / 1')).toBeDefined();
    const {prev, next} = paginationLinks();
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('Home 文章卡片 favorite（补丁缓存 + refresh）', () => {
  beforeEach(() => {
    state.data = {
      articles: [{...makeArticles(1)[0], favoritesCount: 5}],
      articlesCount: 1
    };
    // 补丁缓存的基线：真实链路里 loader 已拉过本页（withCache 写入），
    // 这里按 loader 同形 key 预置缓存条目
    homeCache.set([state.parseSearch(state.search)], state.data as ArticlePage);
  });

  it('点击即时 +1 高亮，成功后以服务端值为准', async () => {
    const pending = deferred();
    favoriteMock.mockReturnValueOnce(pending.promise);
    renderView(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));

    // 乐观：请求未决时已补丁缓存，视图换新 +1 且置高亮（refresh 经
    // loaderCache 的 set 事件订阅微任务扇出——不再是视图直调）。
    // scope 队列（react-toolroom 0.11）把 mutate 执行推迟一个微任务，
    // 乐观断言异步等待
    const optimistic = await screen.findByRole('button', {name: '❤ 6'});
    expect(optimistic.getAttribute('aria-pressed')).toBe('true');
    expect(favoriteMock).toHaveBeenCalledWith('slug-0', true);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledWith(state.router));

    // 服务端权威值补丁校正（以完整 Article 为替换单位）
    pending.resolve({...makeArticles(1)[0], favorited: true, favoritesCount: 9});
    expect(await screen.findByRole('button', {name: '❤ 9'})).toBeDefined();
  });

  it('失败回滚到服务端值', async () => {
    favoriteMock.mockRejectedValueOnce(new Error('network down'));
    renderView(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));
    // rejected mock 下乐观与回滚都在微任务内完成，中间态不可观测
    //（scope 队列又推迟一个微任务）——断言终态：回滚值 + 调用发生
    // 回滚：补丁把点击前快照写回（请求失败即服务端状态未变）
    const rolledBack = await screen.findByRole('button', {name: '❤ 5'});
    expect(rolledBack.getAttribute('aria-pressed')).toBe('false');
    expect(favoriteMock).toHaveBeenCalledWith('slug-0', true);
  });

  it('失败回滚后 toast 呈现错误文案（不静默）', async () => {
    favoriteMock.mockRejectedValueOnce(new Error('network down'));
    renderView(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));

    // 回滚完成后 rejection 才传播到视图 catch（scope 队列微任务链），
    // 等回滚终态出现后再断言 toast 文案
    await screen.findByRole('button', {name: '❤ 5', pressed: false} as Parameters<typeof screen.findByRole>[1]);
    await waitFor(() =>
      expect(state.toastMessages).toEqual(['network down'])
    );
  });

  it('scope 串行：同 slug 连点两次，第二次等第一次 settle 后才执行', async () => {
    const first = deferred();
    // 第一次未决期间连点：第二次 mutate 入 scope 队列但【不执行】——
    // favoriteMock 仍只被调 1 次，这是 scope 串行的核心可观测行为
    favoriteMock.mockReturnValueOnce(first.promise);
    // makeArticles 是浅形状（视图断言用），favoriteMock 契约是完整
    // Article——按既有用例同法以 as 对齐（mock 只消费 favorited/
    // favoritesCount/slug 三个域）
    favoriteMock.mockResolvedValueOnce({
      ...makeArticles(1)[0],
      favorited: true,
      favoritesCount: 6
    } as unknown as Parameters<typeof favoriteMock.mockResolvedValueOnce>[0]);
    renderView(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));
    await screen.findByRole('button', {name: '❤ 6'});

    // 连点（视图乐观态 favorited=true，第二次意图是翻回 false）：排队
    fireEvent.click(screen.getByRole('button', {name: '❤ 6'}));
    // 微任务排空后队列仍压着第二次调用——第一次未 settle，mutate 不执行
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(favoriteMock).toHaveBeenCalledTimes(1);

    // 第一次成功（count 9）→ 队列释放第二次：以 settle 后的缓存值
    //（favorited: true）为基线翻转（参数 false），服务端权威值 6 收口
    first.resolve({...makeArticles(1)[0], favorited: true, favoritesCount: 9});
    await waitFor(() => expect(favoriteMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', {name: '❤ 6'})).toBeDefined();
    // 两次调用的参数序列：FIFO，第二次基于第一次的结果翻转
    expect(favoriteMock.mock.calls.map((c) => c[1])).toEqual([true, false]);
  });

  it('缓存无基线（条目已被清理）：补丁放弃，不发 refresh 也不写缓存', async () => {
    clearAllCaches(); // 模拟登出清缓存后的 POP 快照视图
    const pending = deferred();
    favoriteMock.mockReturnValueOnce(pending.promise);
    renderView(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));

    expect(screen.getByRole('button', {name: '❤ 5'})).toBeDefined();
    expect(refreshMock).not.toHaveBeenCalled();
    pending.resolve(undefined);
  });

  it('未登录点击：引导去 /login（带原目的页 redirect）且不发请求', () => {
    getCurrentUserMock.mockReturnValue(null);
    renderView(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));

    // redirect 机制对齐 requireLogin 守卫：pathname（'/'）+ search 整体
    // encodeURIComponent——Login 侧 sanitizeRedirect 白名单原样放行站内
    // 绝对路径，登录后回跳本页
    expect(navigateMock).toHaveBeenCalledWith(
      state.router,
      '/login?redirect=%2F'
    );
    expect(favoriteMock).not.toHaveBeenCalled();
  });
});

describe('ArticlePreview memo（收藏翻转只重渲染受影响卡片）', () => {
  // 基线：20 张卡的页 + 同形 key 的 homeCache 预置条目（favorite 写穿的
  // miss-bail 语义要求 settled 基线，见 favorite describe 同款注释）
  function setupPage20() {
    const articles = makeArticles(20);
    state.data = {articles, articlesCount: 20};
    homeCache.set([state.parseSearch(state.search)], state.data as ArticlePage);
    return articles;
  }

  it('乐观写穿与服务端校正各只重渲染 article 引用变化的那张卡', async () => {
    const articles = setupPage20();
    const pending = deferred();
    favoriteMock.mockReturnValueOnce(pending.promise);
    renderView(<Home />);

    expect(screen.getByText('title-0')).toBeDefined();
    // 挂载期：20 张卡各渲染一次（计数基准，无 StrictMode 双渲染）
    const mounted = state.cardRenders;
    expect(mounted).toBe(20);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    await screen.findByRole('button', {name: '❤ 1'});
    // 乐观补丁：patchArticleIn（services/mutations.ts）对页内数组 map
    // 时只替换目标项，其余 19 项原引用返回 → memo 浅比较跳过；Card
    // 计数只 +1（slug-0 那张）。若 memo 未生效，bindRefresh 的整页
    // refresh 会带来 +20
    expect(state.cardRenders).toBe(mounted + 1);

    // 服务端权威值：刻意取不与任何卡片原计数（i*3 序列）冲突的 100，
    // 保证 findByRole 命中的是变化后的 slug-0 卡而非同名邻卡
    pending.resolve({...articles[0], favorited: true, favoritesCount: 100});
    const applied = await screen.findByRole('button', {name: '❤ 100'});
    expect(applied.getAttribute('aria-pressed')).toBe('true');
    // 服务端权威值 apply 同路：仍然只有一张卡重渲染（+2 收口）
    expect(state.cardRenders).toBe(mounted + 2);
  });

  it('on* 回调身份每次新建不击穿 memo：父级重渲染（缓存未变）零卡片重渲染', () => {
    setupPage20();
    renderView(<Home />);

    const mounted = state.cardRenders;
    expect(mounted).toBe(20);

    // 直接触发 useData 的重渲染广播（articles 引用全部保持不变）：Home
    // 重渲染会新建 onFavorite 闭包——react-toolroom memo 对 on* props
    // 自动稳定化（稳定转发器 + 调用时转发最新闭包），20 张卡全部跳过。
    // 若稳定化缺失，仅回调身份变化即带来 +20 的重渲染
    act(() => state.emit());

    expect(state.cardRenders).toBe(mounted);
  });
});
