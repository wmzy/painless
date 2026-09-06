// 来源：/profile/:username 页（档案 banner × tabs 文章列表 × follow）。
// 口径对齐 Article 测试：mock 服务层（follow/favorite/feed 取数），真实
// cache.mutation 管道跑在真实实体缓存上；useData mock 直读 profileCache
// 的最新 settled 值、refresh mock 广播重渲染，模拟「loader 重跑 →
// withCache 新鲜命中 → 视图换新」链路（同 Article 测试的成熟形态）。
import type {Article, Author, ProfileFeedQuery} from '@/types';

import type {ReactNode} from 'react';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent, waitFor} from '@testing-library/react';

const state = vi.hoisted(() => ({
  profile: {
    username: 'alice',
    bio: 'hello world',
    image: 'https://example.com/a.png',
    following: false
  },
  // useMatched/useData 的当前路由参数：换档案回归测试（profile→profile
  // 导航不卸载组件）靠改这里 + emit 重渲染模拟
  params: {username: 'alice'},
  router: {history: {}},
  matchedRoute: {route: {}} as {route: {data: unknown}},
  listeners: new Set<() => void>(),
  emit: () => {
    for (const l of state.listeners) l();
  }
}));

vi.mock('@native-router/react', async () => {
  const React = await import('react');
  const {profileCache} = await import('@/util/useQuery');
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
      // 写穿后的视图换新：无缓存条目（loader 未跑过的冷启动态）回落到
      // 初始 profile（按当前路由参数寻址——换档案用例切 state.params 后
      // 读新档案）
      return profileCache.peek!([state.params.username])?.value ?? state.profile;
    },
    useMatched: () => ({
      location: {
        pathname: `/profile/${state.params.username}`,
        search: '',
        hash: ''
      },
      params: state.params,
      router: state.router,
      matched: [state.matchedRoute],
      index: 0
    }),
    useRouter: () => state.router,
    // TypedLink 替身：本人档案的 Edit Profile Settings 入口只需 href 契约
    TypedLink: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children?: ReactNode;
    } & Record<string, unknown>) =>
      React.createElement('a', {...rest, href: to}, children)
  };
});
vi.mock('@native-router/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@native-router/core')>()),
  navigate: vi.fn(async () => undefined),
  refresh: vi.fn(async () => state.emit())
}));
// ArticlePreview 里的 PreviewLink 换成透传替身（Home 测试同款先例）
vi.mock('@/components/PreviewLink', () => ({
  default: ({children}: {children?: ReactNode}) => children ?? null
}));
vi.mock('@/services/article', () => ({
  favoriteArticle: vi.fn(),
  followAuthor: vi.fn(),
  queryProfileFeed: vi.fn(),
  query: vi.fn(),
  findByTitle: vi.fn(),
  fetchCommentsByTitle: vi.fn(),
  fetchTags: vi.fn()
}));
vi.mock('@/services/auth', () => ({
  getCurrentUser: vi.fn(),
  onAuthChange: vi.fn(() => () => undefined)
}));

import {navigate} from '@native-router/core';

import {renderView} from '@/test-utils';
import {getCurrentUser} from '@/services/auth';
import * as articleService from '@/services/article';
import {profileLoader} from '@/services/dataloaders';
import {profileCache, resetAllCaches} from '@/util/useQuery';
import {withCache} from '@/util/loaderCache';

import Profile from './index';

// DEV 来源校验的路由声明：与 src/views/index.tsx 的真实路由表同源
state.matchedRoute.route.data = profileLoader;

const navigateMock = vi.mocked(navigate);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const followMock = vi.mocked(articleService.followAuthor);
const feedMock = vi.mocked(articleService.queryProfileFeed);

// 同 Article/Editor 测试的 asButton 先例：显式收窄规避 getByRole 在
// 两条类型检查路径下的推断分歧
function asButton(el: HTMLElement): HTMLButtonElement {
  return el as HTMLButtonElement;
}

const article = (i: number): Article => ({
  slug: `article-${i}`,
  title: `Article title ${i}`,
  description: 'desc',
  body: 'body',
  tagList: [],
  favorited: false,
  favoritesCount: 0,
  author: {username: 'alice', bio: null, image: null, following: false},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
});

// 12 篇（两页）× 两个维度：feed 服务 mock 按 query 的 offset/limit
// 切片，覆盖分页与维度切换的取数契约
const ALL = Array.from({length: 12}, (_, i) => article(i));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

beforeEach(() => {
  vi.resetAllMocks();
  navigateMock.mockImplementation(async () => undefined);
  getCurrentUserMock.mockReturnValue({
    username: 'me',
    email: 'me@example.com',
    token: 'jwt',
    bio: null,
    image: null
  });
  feedMock.mockImplementation(
    async (q: ProfileFeedQuery) => ({
      articles: ALL.slice(q.offset, q.offset + q.limit),
      articlesCount: ALL.length
    })
  );
  state.profile = {
    username: 'alice',
    bio: 'hello world',
    image: 'https://example.com/a.png',
    following: false
  };
  state.params = {username: 'alice'};
  resetAllCaches();
  // 模拟生产链路的 loader 首跑（同 Article 测试）：withCache 绑定
  //「profileCache set → refresh」订阅并写入首份档案条目——follow 乐观
  // 写穿因此恒为「已见 key 换值」，必触发 refresh 回写
  void withCache(
    profileCache,
    ({params}: {params?: {username?: string}}): [string] => [
      params?.username ?? 'alice'
    ],
    async (_ctx: unknown) => state.profile
  )({params: {username: 'alice'}, router: state.router});
});

describe('Profile banner（档案实体 + follow）', () => {
  it('渲染档案：avatar alt、username、bio 与 follow 按钮（非本人）', async () => {
    renderView(<Profile />);

    expect(screen.getByRole('img', {name: 'alice'})).toBeDefined();
    // username 出现在 banner 标题与按钮文案两处（tab 里也有维度名）
    expect(screen.getAllByText('alice', {exact: true}).length).toBeGreaterThan(0);
    expect(screen.getByText('hello world')).toBeDefined();
    expect(screen.getByRole('button', {name: 'Follow alice'})).toBeDefined();
    expect(screen.queryByRole('link', {name: 'Edit Profile Settings'})).toBeNull();
  });

  it('本人档案：Edit Profile Settings 入口（/settings），无 follow 按钮', () => {
    getCurrentUserMock.mockReturnValue({
      username: 'alice',
      email: 'alice@example.com',
      token: 'jwt',
      bio: null,
      image: null
    });
    renderView(<Profile />);

    expect(
      screen.getByRole('link', {name: 'Edit Profile Settings'}).getAttribute('href')
    ).toBe('/settings');
    expect(screen.queryByRole('button', {name: 'Follow alice'})).toBeNull();
  });

  it('follow：乐观翻转 + 服务端权威值收口（profileCache 写穿）', async () => {
    const pending = deferred<Author>();
    followMock.mockReturnValueOnce(pending.promise);
    renderView(<Profile />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(followMock).toHaveBeenCalledWith('alice', true);

    pending.resolve({...state.profile, following: true});
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(profileCache.peek!(['alice'])?.value).toMatchObject({
      username: 'alice',
      following: true
    });
  });

  it('follow：失败回滚并 toast 错误', async () => {
    followMock.mockRejectedValueOnce(new Error('follow failed'));
    renderView(<Profile />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));

    expect(await screen.findByRole('button', {name: 'Follow alice'})).toBeDefined();
    expect(await screen.findByText('follow failed')).toBeDefined();
  });

  it('未登录 follow：引导去 /login（带原目的页 redirect）且不发请求', () => {
    getCurrentUserMock.mockReturnValue(null);
    renderView(<Profile />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));

    expect(navigateMock).toHaveBeenCalledWith(
      state.router,
      '/login?redirect=%2Fprofile%2Falice'
    );
    expect(followMock).not.toHaveBeenCalled();
  });
});

describe('Profile tabs（维度切换 × 分页）', () => {
  it('默认 author 维度：feed 按 {username, scope, offset, limit} 查询并渲染列表', async () => {
    renderView(<Profile />);

    expect(await screen.findByText('Article title 0')).toBeDefined();
    expect(feedMock.mock.calls.at(-1)?.[0]).toEqual({
      username: 'alice',
      scope: 'author',
      offset: 0,
      limit: 10
    });
  });

  it('切 favorited 维度：换查询并回第一页（分页偏移不跨维度）', async () => {
    renderView(<Profile />);
    expect(await screen.findByText('Article title 0')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', {name: 'Favorited Articles'}));

    // 维度切换触发的新查询经 useRun 的 effect 异步发起：断言等调用落地
    await waitFor(() =>
      expect(feedMock.mock.calls.at(-1)?.[0]).toEqual({
        username: 'alice',
        scope: 'favorited',
        offset: 0,
        limit: 10
      })
    );
  });

  it('分页：Next/Prev 按 limit 步进 offset，页码随动', async () => {
    renderView(<Profile />);
    expect(await screen.findByText('Article title 0')).toBeDefined();
    expect(screen.getByText('1 / 2')).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'Next →'}));
    expect(await screen.findByText('Article title 10')).toBeDefined();
    expect(feedMock.mock.calls.at(-1)?.[0]).toMatchObject({
      scope: 'author',
      offset: 10
    });
    expect(screen.getByText('2 / 2')).toBeDefined();
    expect(asButton(screen.getByRole('button', {name: 'Next →'})).disabled).toBe(
      true
    );

    fireEvent.click(screen.getByRole('button', {name: '← Previous'}));
    // 回第一页命中已缓存条目（SWR 新鲜命中）：零新请求，只断言 UI
    expect(await screen.findByText('Article title 0')).toBeDefined();
    expect(screen.getByText('1 / 2')).toBeDefined();
    expect(
      asButton(screen.getByRole('button', {name: '← Previous'})).disabled
    ).toBe(true);
  });

  it('换维度回第一页，切回原维度保留原页位（分页状态挂 tab 维度）', async () => {
    renderView(<Profile />);
    expect(await screen.findByText('Article title 0')).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'Next →'}));
    expect(await screen.findByText('Article title 10')).toBeDefined();

    fireEvent.click(screen.getByRole('tab', {name: 'Favorited Articles'}));
    await waitFor(() =>
      expect(feedMock.mock.calls.at(-1)?.[0]).toMatchObject({
        scope: 'favorited',
        offset: 0
      })
    );

    // 切回 author：原页位（offset 10）保留——该页已在缓存，零新请求，
    // 断言 UI 页位（不产生「新 tab × 旧 offset」的中间查询）
    fireEvent.click(screen.getByRole('tab', {name: 'My Articles'}));
    expect(await screen.findByText('Article title 10')).toBeDefined();
    expect(screen.getByText('2 / 2')).toBeDefined();
  });

  it('换档案（:username 参数变化不卸载组件）：分页偏移回第一页', async () => {
    renderView(<Profile />);
    expect(await screen.findByText('Article title 0')).toBeDefined();

    // alice 翻到第二页（offset 10）
    fireEvent.click(screen.getByRole('button', {name: 'Next →'}));
    expect(await screen.findByText('Article title 10')).toBeDefined();

    // 同路由参数切换（Layout 用户名链接的 profile→profile 导航形态）：
    // 组件不卸载、paging 状态穿透。改路由参数 + 换档案实体 + 广播重渲染
    state.params = {username: 'bob'};
    state.profile = {
      username: 'bob',
      bio: 'bob bio',
      image: null,
      following: false
    };
    state.emit();

    // 新档案回第一页：旧 offset 10 不跨档案（另一人的总量不同，稀疏
    // 档案会停在越界 offset 上误显 No articles yet）
    await waitFor(() =>
      expect(feedMock.mock.calls.at(-1)?.[0]).toEqual({
        username: 'bob',
        scope: 'author',
        offset: 0,
        limit: 10
      })
    );
  });

  it('空列表：No articles yet. 占位', async () => {
    feedMock.mockResolvedValueOnce({articles: [], articlesCount: 0});
    renderView(<Profile />);

    expect(await screen.findByText('No articles yet.')).toBeDefined();
  });

  it('加载失败：错误框 + Retry 重拉', async () => {
    feedMock
      .mockRejectedValueOnce(new Error('feed down'))
      .mockImplementation(async (q: ProfileFeedQuery) => ({
        articles: ALL.slice(q.offset, q.offset + q.limit),
        articlesCount: ALL.length
      }));
    renderView(<Profile />);

    expect(await screen.findByText('Failed to load articles')).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
    expect(await screen.findByText('Article title 0')).toBeDefined();
    await waitFor(() => expect(feedMock).toHaveBeenCalledTimes(2));
  });

  it('document.title：进入设为 <username> · Painless，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = renderView(<Profile />);

    expect(document.title).toBe('alice · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
  });
});
