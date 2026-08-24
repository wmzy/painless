// 来源：第 3 批评审任务——Article 评论表单提交中状态（isSubmitting 防重复提交）。
// 第 4 批扩展：favorite/follow 乐观更新与失败回滚、未登录引导去 /login、
// 发评论后 CommentList 刷新。第 4 批起评论提交走 services/article.addComment，
// mock 收敛到 service 层；CommentList 用真实实现（数据源同被 mock），
// 模块级 queryCache 在用例间清空以防缓存串场。双通道缓存落地批改为
// 写穿共享缓存（applyCache = queryCache.set + refresh）：useData mock 直读
// queryCache 的最新 settled 值、refresh mock 广播重渲染，模拟「loader 重跑
// → withCache 新鲜命中 → 视图换新」链路。
import type {Comment} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';


const state = vi.hoisted(() => ({
  article: {
    tagList: [],
    author: {username: 'alice', image: 'https://example.com/a.png', following: false},
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
  // refresh mock 的重渲染广播：视图写穿缓存后调 refresh(router)，真实
  // 链路是「loader 重跑 → withCache 新鲜命中 → useData 换新」，这里用
  // bump 回调近似——useData mock 每次渲染直读 queryCache 的最新 settled
  // 值（loader 命中的就是它）
  listeners: new Set<() => void>(),
  emit: () => {
    for (const l of state.listeners) l();
  }
}));

vi.mock('@native-router/react', async () => {
  const React = await import('react');
  const {articleCacheArgs} = await import('@/util/loaderCache');
  const {queryCache} = await import('@/util/useQuery');
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
      return (
        queryCache.peek!(articleCacheArgs('some-title-1'))?.value ??
        state.article
      );
    },
    useMatched: () => ({
      location: {pathname: '/article/some-title-1', search: '', hash: ''},
      params: {title: 'some-title-1'},
      router: state.router
    })
  };
});
vi.mock('@native-router/core', () => ({
  navigate: vi.fn(),
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

import {getCurrentUser} from '@/services/auth';
import * as articleService from '@/services/article';
import {articleCacheArgs} from '@/util/loaderCache';
import {queryCache} from '@/util/useQuery';

import ArticleView from './index';

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
  // resetAllMocks 会清掉 vi.fn 的实现：refresh 的「重渲染广播」语义逐
  // 用例重建（navigate 无实现需求，仅断言调用）
  refreshMock.mockImplementation(async () => state.emit());
  state.article = {
    ...state.article,
    favorited: false,
    favoritesCount: 0,
    author: {...state.article.author, following: false}
  };
  getCurrentUserMock.mockReturnValue({
    username: 'me',
    email: 'me@example.com',
    token: 'jwt'
  });
  fetchCommentsMock.mockResolvedValue([]);
  queryCache.clear();
});

describe('Article 评论表单', () => {
  it('提交中按钮禁用并显示 Posting...，完成后恢复且双击不双发', async () => {
    const pending = deferred();
    addCommentMock.mockReturnValueOnce(pending.promise);
    render(<ArticleView />);

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
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: 'Post Comment'}));

    expect(await screen.findByText('Comment is required')).toBeDefined();
    expect(addCommentMock).not.toHaveBeenCalled();
  });
});

describe('Article favorite / follow（写穿缓存 + refresh）', () => {
  it('favorite：点击即时 +1 并高亮，成功后以服务端返回为准', async () => {
    const pending = deferred();
    favoriteMock.mockReturnValueOnce(pending.promise);
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));

    // 乐观：请求未决时已写穿缓存并 refresh，视图换新 +1 且置高亮
    const optimistic = screen.getByRole('button', {name: '❤ 1'});
    expect(optimistic.getAttribute('aria-pressed')).toBe('true');
    expect(favoriteMock).toHaveBeenCalledWith('some-title-1', true);
    expect(refreshMock).toHaveBeenCalledWith(state.router);

    // 服务端权威值写穿校正（写穿以整个 Article 为单位，返回须是完整对象）
    pending.resolve({...state.article, favorited: true, favoritesCount: 42});
    expect(await screen.findByRole('button', {name: '❤ 42'})).toBeDefined();
    // 校正后的值已在缓存里：loader 若重跑将新鲜命中该值
    expect(queryCache.peek!(articleCacheArgs('some-title-1'))?.value).toEqual({
      ...state.article,
      favorited: true,
      favoritesCount: 42
    });
  });

  it('favorite：失败回滚计数并展示错误', async () => {
    favoriteMock.mockRejectedValueOnce(new Error('favorite failed'));
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    expect(screen.getByRole('button', {name: '❤ 1'})).toBeDefined();

    // 回滚：写回点击时快照（请求失败即服务端状态未变，快照即权威值）
    expect(await screen.findByRole('button', {name: '❤ 0'})).toBeDefined();
    expect(screen.getByRole('button', {name: '❤ 0'}).getAttribute('aria-pressed')).toBe('false');
    expect(await screen.findByText('favorite failed')).toBeDefined();
  });

  it('follow：点击即时切换文案，成功后以 peek 当前值合并服务端 profile', async () => {
    const pending = deferred();
    followMock.mockReturnValueOnce(pending.promise);
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    expect(screen.getByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(followMock).toHaveBeenCalledWith('alice', true);

    // 成功回调经 peek 取缓存当前值合并——而非闭包快照
    pending.resolve({username: 'alice', image: '', following: true});
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(queryCache.peek!(articleCacheArgs('some-title-1'))?.value).toMatchObject({
      author: {username: 'alice', following: true}
    });
  });

  it('follow 在飞期间 favorite 已写穿：成功合并不覆盖并发写', async () => {
    const followPending = deferred();
    const favPending = deferred();
    followMock.mockReturnValueOnce(followPending.promise);
    favoriteMock.mockReturnValueOnce(favPending.promise);
    render(<ArticleView />);

    // 先点 follow（pending），再点 favorite：favorite 乐观写穿把缓存换成
    // favorited: true / count 1
    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    expect(screen.getByRole('button', {name: '❤ 1'})).toBeDefined();

    // follow 成功返回：经 peek 合并 author，favorite 的乐观值必须保留
    //（闭包快照里还是 favorited: false——直接铺开就会覆盖掉它）
    followPending.resolve({username: 'alice', image: '', following: true});
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(screen.getByRole('button', {name: '❤ 1'})).toBeDefined();

    // favorite 随后成功：以服务端返回为准
    favPending.resolve({...state.article, favorited: true, favoritesCount: 7});
    expect(await screen.findByRole('button', {name: '❤ 7'})).toBeDefined();
  });

  it('follow：失败回滚文案并展示错误', async () => {
    followMock.mockRejectedValueOnce(new Error('follow failed'));
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    expect(screen.getByRole('button', {name: 'Unfollow alice'})).toBeDefined();

    expect(await screen.findByRole('button', {name: 'Follow alice'})).toBeDefined();
    expect(await screen.findByText('follow failed')).toBeDefined();
  });

  it('未登录点击 favorite/follow：引导去 /login 且不发请求', () => {
    getCurrentUserMock.mockReturnValue(null);
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));

    expect(navigateMock).toHaveBeenCalledTimes(2);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/login');
    expect(favoriteMock).not.toHaveBeenCalled();
    expect(followMock).not.toHaveBeenCalled();
  });
});

describe('发评论后刷新评论列表', () => {
  const commentA: Comment = {
    id: 'c1',
    body: 'first comment',
    slug: 'some-title-1',
    createdAt: 0,
    updatedAt: 0,
    author: {username: 'bob', image: 'https://example.com/b.png', following: false}
  };
  const commentB: Comment = {...commentA, id: 'c2', body: 'second comment'};

  it('提交成功：表单清空、CommentList 绕过缓存重拉并出现新评论', async () => {
    fetchCommentsMock
      .mockResolvedValueOnce([commentA])
      .mockResolvedValueOnce([commentA, commentB]);
    addCommentMock.mockResolvedValueOnce(commentB);
    render(<ArticleView />);

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
    // useQuery 的 useRun({signal: true}) 给每次 run（含 invalidate 触发的
    // 重拉）尾附 AbortSignal，args 变化/卸载时取消上一次。
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
});
