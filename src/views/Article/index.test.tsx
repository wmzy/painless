// 来源：第 3 批评审任务——Article 评论表单提交中状态（isSubmitting 防重复提交）。
// 第 4 批扩展：favorite/follow 乐观更新与失败回滚、未登录引导去 /login、
// 发评论后 CommentList 刷新。第 4 批起评论提交走 services/article.addComment，
// mock 收敛到 service 层；CommentList 用真实实现（数据源同被 mock），
// 模块级 queryCache 在用例间清空以防缓存串场。
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
  router: {history: {}}
}));

vi.mock('@native-router/react', () => ({
  useData: () => state.article,
  useMatched: () => ({
    location: {pathname: '/article/some-title-1', search: '', hash: ''},
    router: state.router
  })
}));
vi.mock('@native-router/core', () => ({navigate: vi.fn()}));
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

import {navigate} from '@native-router/core';

import {getCurrentUser} from '@/services/auth';
import * as articleService from '@/services/article';
import {queryCache} from '@/util/useQuery';

import ArticleView from './index';

const navigateMock = vi.mocked(navigate);
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

describe('Article favorite / follow（乐观更新）', () => {
  it('favorite：点击即时 +1 并高亮，成功后以服务端返回为准', async () => {
    const pending = deferred();
    favoriteMock.mockReturnValueOnce(pending.promise);
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));

    // 乐观：请求未决时已 +1 且置高亮
    const optimistic = screen.getByRole('button', {name: '❤ 1'});
    expect(optimistic.getAttribute('aria-pressed')).toBe('true');
    expect(favoriteMock).toHaveBeenCalledWith('some-title-1', true);

    // 服务端权威值校正本地乐观值
    pending.resolve({favorited: true, favoritesCount: 42});
    expect(await screen.findByRole('button', {name: '❤ 42'})).toBeDefined();
  });

  it('favorite：失败回滚计数并展示错误', async () => {
    favoriteMock.mockRejectedValueOnce(new Error('favorite failed'));
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 0'}));
    expect(screen.getByRole('button', {name: '❤ 1'})).toBeDefined();

    expect(await screen.findByRole('button', {name: '❤ 0'})).toBeDefined();
    expect(screen.getByRole('button', {name: '❤ 0'}).getAttribute('aria-pressed')).toBe('false');
    expect(await screen.findByText('favorite failed')).toBeDefined();
  });

  it('follow：点击即时切换文案，成功后保持服务端状态', async () => {
    const pending = deferred();
    followMock.mockReturnValueOnce(pending.promise);
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', {name: 'Follow alice'}));
    expect(screen.getByRole('button', {name: 'Unfollow alice'})).toBeDefined();
    expect(followMock).toHaveBeenCalledWith('alice', true);

    pending.resolve({username: 'alice', image: '', following: true});
    expect(await screen.findByRole('button', {name: 'Unfollow alice'})).toBeDefined();
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
