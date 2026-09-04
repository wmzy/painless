// 来源：第 3 批评审任务——Article 评论表单提交中状态（isSubmitting 防重复提交）。
// 第 4 批扩展：favorite/follow 乐观更新与失败回滚、未登录引导去 /login、
// 发评论后 CommentList 刷新。第 4 批起评论提交走 services/article.addComment，
// mock 收敛到 service 层；CommentList 用真实实现（数据源同被 mock），
// 模块级 articleCache 在用例间清空以防缓存串场。乐观写穿管道（cache.mutation
// 组合，见 services/mutations.ts）：useData mock 直读
// articleCache 的最新 settled 值、refresh mock 广播重渲染，模拟「loader 重跑
// → withCache 新鲜命中 → 视图换新」链路。
import type {Comment} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent, waitFor} from '@testing-library/react';





const state = vi.hoisted(() => ({
  article: {
    tagList: [],
    author: {username: 'alice', bio: null, image: 'https://example.com/a.png', following: false},
    description: 'desc',
    title: 'Some title',
    body: 'line1\nline2',
    slug: 'some-title-1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    favoritesCount: 0,
    favorited: false
  },
  router: {history: {}},
  // createDataLoader 的 DEV 来源校验（src/util/dataLoader.ts）要求
  // useMatched 提供 matched[index].route.data：模块加载后由测试体把
  // articleLoader 填进来（mock 工厂内 import dataloaders 会与被 mock 的
  // '@native-router/react' 循环，故走 hoisted state 中转）
  matchedRoute: {route: {}} as {route: {data: unknown}},
  // refresh mock 的重渲染广播：视图写穿缓存后调 refresh(router)，真实
  // 链路是「loader 重跑 → withCache 新鲜命中 → useData 换新」，这里用
  // bump 回调近似——useData mock 每次渲染直读 articleCache 的最新 settled
  // 值（loader 命中的就是它）
  listeners: new Set<() => void>(),
  emit: () => {
    for (const l of state.listeners) l();
  }
}));

vi.mock('@native-router/react', async () => {
  const React = await import('react');
  const {articleCache} = await import('@/util/useQuery');
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
      // 初始 article
      return articleCache.peek!(['some-title-1'])?.value ?? state.article;
    },
    useMatched: () => ({
      location: {pathname: '/article/some-title-1', search: '', hash: ''},
      params: {title: 'some-title-1'},
      router: state.router,
      // useArticleData 的 DEV 来源校验读 matched[index].route.data——见
      // state.matchedRoute 注释
      matched: [state.matchedRoute],
      index: 0
    })
  };
});
vi.mock('@native-router/core', () => ({
  // navigate 返回 Promise：产线 useRequireAuth 对被取代/取消的导航
  // reject NCE 挂了 .catch（core 1.15 语义），undefined 会让回调抛 TypeError
  navigate: vi.fn(async () => undefined),
  refresh: vi.fn(async () => state.emit())
}));
vi.mock('@/services/article', () => ({
  favoriteArticle: vi.fn(),
  followAuthor: vi.fn(),
  addComment: vi.fn(),
  fetchCommentsByTitle: vi.fn(),
  query: vi.fn(),
  findByTitle: vi.fn(),
  fetchTags: vi.fn()
}));
vi.mock('@/services/auth', () => ({getCurrentUser: vi.fn()}));

import {navigate, refresh} from '@native-router/core';

import {renderView} from '@/test-utils';
import {getCurrentUser} from '@/services/auth';
import * as articleService from '@/services/article';
import {withCache} from '@/util/loaderCache';
import {articleCache, commentsCache, resetAllCaches} from '@/util/useQuery';
import {articleLoader} from '@/services/dataloaders';

import ArticleView from './index';

// DEV 来源校验的路由声明（见 state.matchedRoute 注释）：与
// src/views/index.tsx 的真实路由表同源
state.matchedRoute.route.data = articleLoader;

const navigateMock = vi.mocked(navigate);
const refreshMock = vi.mocked(refresh);
const getCurrentUserMock = vi.mocked(getCurrentUser);
const favoriteMock = vi.mocked(articleService.favoriteArticle);
const followMock = vi.mocked(articleService.followAuthor);
const addCommentMock = vi.mocked(articleService.addComment);
const fetchCommentsMock = vi.mocked(articleService.fetchCommentsByTitle);

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<any>((res) => (resolve = res));
  return {promise, resolve};
}

// 同 Editor/index.test.tsx：显式收窄规避 getByRole 在两条类型检查路径下
// 的推断分歧。
function asButton(el: HTMLElement): HTMLButtonElement {
  return el as HTMLButtonElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  // resetAllMocks 会清掉 vi.fn 的实现：refresh 的「重渲染广播」与
  // navigate 的 Promise 返回（产线 .catch 挂钩，mock 工厂注释）逐用例重建
  refreshMock.mockImplementation(async () => state.emit());
  navigateMock.mockImplementation(async () => undefined);
  state.article = {
    ...state.article,
    favorited: false,
    favoritesCount: 0,
    author: {...state.article.author, following: false}
  };
  getCurrentUserMock.mockReturnValue({
    username: 'me',
    email: 'me@example.com',
    token: 'jwt',
    bio: null,
    image: null
  });
  fetchCommentsMock.mockResolvedValue([]);
  // 逐用例清全部实体缓存 + 注册表还原基线（旧单 cache 时代的一条 clear
  // 等价物）：否则前序用例写入的 commentsCache 条目被新鲜命中，Once
  // 队列不被消费
  resetAllCaches();
  // 模拟生产链路的 loader 首跑：withCache 绑定「cache set → refresh」
  // 订阅并写入首份缓存（真实路由里视图数据必来自 loader 写入的缓存
  // 条目——乐观写穿因此恒为「已见 key 换值」，必触发 refresh 回写）。
  // 返回 state.article：与 useData mock 的 fallback 同源同引用，后续
  // 写穿以它为基线。
  void withCache(
    articleCache,
    ({params}: {params?: {title?: string}}): [string] => [params?.title ?? 'some-title-1'],
    async (_ctx: unknown) => state.article
  )({params: {title: 'some-title-1'}, router: state.router});
});

describe('Article 评论表单', () => {
  it('提交中按钮禁用并显示 Posting...，完成后恢复且双击不双发', async () => {
    const pending = deferred();
    addCommentMock.mockReturnValueOnce(pending.promise);
    renderView(<ArticleView />);

    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {target: {value: 'Nice!'}});
    fireEvent.click(screen.getByRole('button', {name: 'Post Comment'}));

    const submitting = asButton(await screen.findByRole('button', {name: 'Posting...'}));
    expect(submitting.disabled).toBe(true);

    // 提交中再次点击（禁用态）不应再次发请求
    fireEvent.click(submitting);
    expect(addCommentMock).toHaveBeenCalledTimes(1);

    pending.resolve(undefined);
    const restored = asButton(await screen.findByRole('button', {name: 'Post Comment'}));
    expect(restored.disabled).toBe(false);
    expect(addCommentMock).toHaveBeenCalledTimes(1);
    expect(addCommentMock).toHaveBeenCalledWith('some-title-1', 'Nice!');
  });

  it('空评论：展示 FieldError 且不发请求', async () => {
    renderView(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: 'Post Comment'}));

    expect(await screen.findByText('Comment is required')).toBeDefined();
    expect(addCommentMock).not.toHaveBeenCalled();
  });

  // useTitle 接入批：页标题取文章 title（loader 保证进组件前 resolve，
  // 首帧即有，基线铺设见 Home/index.test.tsx 同款注释）
  it('document.title：进入设为文章标题页，卸载恢复进入前值', () => {
    document.title = 'Painless';
    const view = renderView(<ArticleView />);

    expect(document.title).toBe('Some title · Painless');

    view.unmount();
    expect(document.title).toBe('Painless');
  });
});

describe('Article favorite / follow（写穿缓存 + refresh）', () => {
  it('favorite：点击即时 +1 并高亮，成功后以服务端返回为准', async () => {
    const pending = deferred();
    favoriteMock.mockReturnValueOnce(pending.promise);
    renderView(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));

    // 乐观：请求未决时已写穿缓存，视图换新 +1 且置高亮（refresh 经
    // loaderCache 的 set 事件订阅微任务扇出——不再是视图直调）。
    // scope 队列（react-toolroom 0.11）把 mutate 的执行推迟一个微任务
    //（链空的首次调用也要先 resolve 队列尾），乐观断言随之异步等待
    const optimistic = await screen.findByRole('button', {name: '❤ 1'});
    expect(optimistic.getAttribute('aria-pressed')).toBe('true');
    expect(favoriteMock).toHaveBeenCalledWith('some-title-1', true);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledWith(state.router));

    // 服务端权威值写穿校正（写穿以整个 Article 为单位，返回须是完整对象）
    pending.resolve({...state.article, favorited: true, favoritesCount: 42});
    expect(await screen.findByRole('button', {name: '❤ 42'})).toBeDefined();
    // 校正后的值已在缓存里：loader 若重跑将新鲜命中该值
    expect(articleCache.peek!(['some-title-1'])?.value).toEqual({
      ...state.article,
      favorited: true,
      favoritesCount: 42
    });
  });

  it('favorite：失败回滚计数并展示错误', async () => {
    favoriteMock.mockRejectedValueOnce(new Error('favorite failed'));
    renderView(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    // rejected mock 下乐观翻转与回滚都在微任务内完成，中间态不可观测
    //（scope 队列又推迟一个微任务）——直接断言终态：回滚后的 0 值 +
    // toast 错误文案 + 服务调用发生
    expect(await screen.findByRole('button', {name: '❤ 0'})).toBeDefined();
    expect(screen.getByRole('button', {name: '❤ 0'}).getAttribute('aria-pressed')).toBe('false');
    expect(favoriteMock).toHaveBeenCalledWith('some-title-1', true);
    expect(await screen.findByText('favorite failed')).toBeDefined();
  });

  it('follow：点击即时切换文案，成功后以 peek 当前值合并服务端 profile', async () => {
    const pending = deferred();
    followMock.mockReturnValueOnce(pending.promise);
    renderView(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(followMock).toHaveBeenCalledWith('alice', true);

    // 成功回调经 peek 取缓存当前值合并——而非闭包快照
    pending.resolve({username: 'alice', bio: null, image: '', following: true});
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(articleCache.peek!(['some-title-1'])?.value).toMatchObject({
      author: {username: 'alice', following: true}
    });
  });

  it('follow 在飞期间 favorite 已写穿：成功合并不覆盖并发写', async () => {
    const followPending = deferred();
    const favPending = deferred();
    followMock.mockReturnValueOnce(followPending.promise);
    favoriteMock.mockReturnValueOnce(favPending.promise);
    renderView(<ArticleView />);

    // 先点 follow（pending），再点 favorite：favorite 乐观写穿把缓存换成
    // favorited: true / count 1
    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    expect(await screen.findByRole('button', {name: '❤ 1'})).toBeDefined();

    // follow 成功返回：经 peek 合并 author，favorite 的乐观值必须保留
    //（闭包快照里还是 favorited: false——直接铺开就会覆盖掉它）
    followPending.resolve({username: 'alice', bio: null, image: '', following: true});
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(await screen.findByRole('button', {name: '❤ 1'})).toBeDefined();

    // favorite 随后成功：以服务端返回为准
    favPending.resolve({...state.article, favorited: true, favoritesCount: 7});
    expect(await screen.findByRole('button', {name: '❤ 7'})).toBeDefined();
  });

  it('favorite 在飞期间 follow 已写穿 following：响应合并不回滚并发写', async () => {
    const favPending = deferred();
    // mock 实现须在点击前就位——点击即调用，晚挂实现会拿到 undefined
    // 引发同步 TypeError
    favoriteMock.mockReturnValueOnce(favPending.promise);
    followMock.mockResolvedValueOnce({username: 'alice', bio: null, image: '', following: true});
    renderView(<ArticleView />);

    // 先点 favorite（pending），再点 follow：follow 乐观写穿 + 服务端返回
    // 依次把 author.following 换成 true
    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();

    // favorite 随后成功：响应里的 author 是点击那一刻的旧值（following:
    // false）——只取 favorited/favoritesCount 两个权威域字段，following
    // 不能被旧响应回滚（对称于 toggleFollow 的 peek 合并防御）
    favPending.resolve({...state.article, favorited: true, favoritesCount: 5});
    expect(await screen.findByRole('button', {name: '❤ 5'})).toBeDefined();
    expect(screen.getByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    // 缓存终值：follow 与 favorite 的并发写都保留
    expect(
      articleCache.peek!(['some-title-1'])?.value
    ).toMatchObject({
      favorited: true,
      favoritesCount: 5,
      author: {username: 'alice', following: true}
    });
  });

  it('follow：失败回滚文案并展示错误', async () => {
    followMock.mockRejectedValueOnce(new Error('follow failed'));
    renderView(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    // 同上：rejected mock 的中间态不可观测，断言终态（回滚 + toast）
    expect(await screen.findByRole('button', {name: 'Follow alice'})).toBeDefined();
    expect(await screen.findByText('follow failed')).toBeDefined();
  });

  it('未登录点击 favorite/follow：引导去 /login（带原目的页 redirect）且不发请求', () => {
    getCurrentUserMock.mockReturnValue(null);
    renderView(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));

    expect(navigateMock).toHaveBeenCalledTimes(2);
    // redirect 机制对齐 requireLogin 守卫（favorite 走 useFavorite 的
    // loginRedirect，follow 走视图内 requireAuth 同款）：pathname
    // '/article/some-title-1' 整体 encode，登录后回跳本页
    expect(navigateMock).toHaveBeenCalledWith(
      state.router,
      '/login?redirect=%2Farticle%2Fsome-title-1'
    );
    expect(favoriteMock).not.toHaveBeenCalled();
    expect(followMock).not.toHaveBeenCalled();
  });
});

describe('发评论后刷新评论列表', () => {
  const commentA: Comment = {
    id: 'c1',
    body: 'first comment',
    slug: 'some-title-1',
    // PastDate（date-time 字符串）：对齐 Article 同款字段与真实 API 契约
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    author: {username: 'bob', bio: null, image: 'https://example.com/b.png', following: false}
  };
  const commentB: Comment = {...commentA, id: 'c2', body: 'second comment'};

  it('提交成功：表单清空、CommentList 绕过缓存重拉并出现新评论', async () => {
    fetchCommentsMock
      .mockResolvedValueOnce([commentA])
      .mockResolvedValueOnce([commentA, commentB]);
    addCommentMock.mockResolvedValueOnce(commentB);
    renderView(<ArticleView />);

    expect(await screen.findByText('first comment')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
      target: {value: 'second comment'}
    });
    fireEvent.click(screen.getByRole('button', {name: 'Post Comment'}));

    // 重挂后的表单清空（textarea 的 value 属内部态，不受 form reset 影响，
    // 由 key 重挂清空）
    // 注：不能直接 findByText('second comment')——重挂提交前 textarea 的
    // DOM 文本仍短暂保留该值，会假命中；限定在评论列表项内断言。
    await waitFor(() => expect(fetchCommentsMock).toHaveBeenCalledTimes(2));
    // 场景 hook（useCommentsQuery）的 useRun({signal: true}) 给每次 run
    // （含 invalidate 触发的重拉）尾附 AbortSignal，args 变化/卸载时取消
    // 上一次。
    expect(fetchCommentsMock).toHaveBeenNthCalledWith(
      1,
      'some-title-1',
      expect.any(AbortSignal)
    );
    expect(fetchCommentsMock).toHaveBeenNthCalledWith(
      2,
      'some-title-1',
      expect.any(AbortSignal)
    );
    expect(
      await screen.findByText('second comment', {selector: 'li span'})
    ).toBeDefined();
    expect(addCommentMock).toHaveBeenCalledWith('some-title-1', 'second comment');
    const commentBox = screen.getByPlaceholderText('Write a comment...');
    expect(
      commentBox instanceof HTMLInputElement
        ? commentBox.value
        : (commentBox as HTMLTextAreaElement).value
    ).toBe('');
  });

  it('前缀失效：只清本 slug 的评论条目，其它 slug 缓存不被误清', async () => {
    // 预置另一 slug 的已 settle 条目——失效若仍是整实体（裸 provider
    // [commentsCache]），它会连带给清、peek 落空，本用例即红
    commentsCache.set(['another-article'], [commentA]);
    fetchCommentsMock
      .mockResolvedValueOnce([commentA])
      .mockResolvedValueOnce([commentA, commentB]);
    addCommentMock.mockResolvedValueOnce(commentB);
    renderView(<ArticleView />);

    expect(await screen.findByText('first comment')).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
      target: {value: 'second comment'}
    });
    fireEvent.click(screen.getByRole('button', {name: 'Post Comment'}));

    // 新评论上屏后才保证重拉已 settle 且写回缓存，peek 断言无时序竞态
    expect(
      await screen.findByText('second comment', {selector: 'li span'})
    ).toBeDefined();
    // 重拉只发生在本 slug：另一 slug 的条目没被失效也就没有请求
    expect(fetchCommentsMock.mock.calls.map(([title]) => title)).toEqual([
      'some-title-1',
      'some-title-1'
    ]);
    // 本 slug 条目按新数据重建；另一 slug 条目原样存活
    expect(commentsCache.peek!(['some-title-1'])?.value).toEqual([
      commentA,
      commentB
    ]);
    expect(commentsCache.peek!(['another-article'])?.value).toEqual([commentA]);
  });

  it('「Updated x ago」：首载 settle 后出现，失效重拉后时间戳刷新', async () => {
    // Date.now 打桩成可控时钟：dataUpdatedAt 的打点与文案推导都以它为
    // 唯一时间源——两次 settle 的真实间隔是毫秒级，不打桩则「时间刷新」
    // 在文案上不可分辨（恒为「less than a minute ago」），断言会假绿
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      fetchCommentsMock
        .mockResolvedValueOnce([commentA])
        .mockResolvedValueOnce([commentA, commentB]);
      addCommentMock.mockResolvedValueOnce(commentB);
      renderView(<ArticleView />);

      // 初载 Spinner 窗口 dataUpdatedAt 为 undefined：克制小字不渲染
      expect(screen.queryByText(/^Updated/)).toBeNull();

      expect(await screen.findByText('first comment')).toBeDefined();
      expect(screen.getByText('Updated less than a minute ago')).toBeDefined();

      // 快进 2 分钟再发评论：stamp 若未随重拉刷新，文案会停在「2 minutes ago」
      now += 2 * 60_000;
      fireEvent.change(screen.getByPlaceholderText('Write a comment...'), {
        target: {value: 'second comment'}
      });
      fireEvent.click(screen.getByRole('button', {name: 'Post Comment'}));

      expect(
        await screen.findByText('second comment', {selector: 'li span'})
      ).toBeDefined();
      // 重拉 settle 用新 now 打点：距离回到零区间，旧文案不再出现
      expect(screen.getByText('Updated less than a minute ago')).toBeDefined();
      expect(screen.queryByText('Updated 2 minutes ago')).toBeNull();
    } finally {
      clock.mockRestore();
    }
  });
});

describe('评论加载失败：Retry 入口（CommentList 错误态）', () => {
  const comment: Comment = {
    id: 'c1',
    body: 'comment after retry',
    slug: 'some-title-1',
    // PastDate（date-time 字符串）：对齐上文 commentA 的同款字段契约
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    author: {username: 'bob', bio: null, image: 'https://example.com/b.png', following: false}
  };

  it('失败呈现错误与 Retry 按钮，点击绕过缓存重拉成功后恢复列表', async () => {
    fetchCommentsMock
      .mockRejectedValueOnce(new Error('comments down'))
      .mockResolvedValueOnce([comment]);
    renderView(<ArticleView />);

    // 失败态：错误 Alert + Retry（对齐 About/Feed 的错误模式）
    expect(await screen.findByText('Failed to load comments')).toBeDefined();
    expect(screen.getByRole('button', {name: 'Retry'})).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'Retry'}));

    // refetch 删条目后重拉：第二条 mock 队列被消费，评论上屏
    expect(await screen.findByText('comment after retry')).toBeDefined();
    expect(fetchCommentsMock).toHaveBeenCalledTimes(2);
  });
});
