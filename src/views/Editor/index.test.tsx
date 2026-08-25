// 来源：第 3 批评审任务——Editor 提交中状态（isSubmitting 防重复提交）与 tagList 事件适配。
// Editor 视图此前无测试文件，故新建。
// react-f0rm 0.5.0 + haze-ui 1.8.0 接入批：422 拒绝值改用鸭子形状普通对象
// （http 层错误升级为 fetch-fun HTTPError 后不再有可构造的 ApiError 类），
// 断言走 FormItem 渲染的字段错误 span 与 aria 接线。
// 提交链路 useMutation 批：提交走 services/article.saveArticle（内部仍
// http.post/put，mock 层不变），成功经 invalidates 失效共享 queryCache 的
// ['home']/['article'] 前缀条目——用 queryCache.set 预置条目断言被删。
import type {Article} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';


const state = vi.hoisted(() => ({
  article: undefined as Article | undefined,
  router: {pathname: '/editor'}
}));

// 保留真实模块，只覆写视图用到的 post/put；422 拒绝值直接用鸭子形状
// 普通对象（catch 侧按 {status, data.errors} 判断，不依赖错误类身份）
vi.mock('@/util/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/util/http')>()),
  post: vi.fn(),
  put: vi.fn()
}));
vi.mock('@native-router/react', () => ({
  useRouter: () => state.router,
  // useData<T>() 泛型在 mock 中以类型断言透传即可
  useData: () => state.article
}));
vi.mock('@native-router/core', () => ({navigate: vi.fn()}));

import {navigate} from '@native-router/core';

import * as http from '@/util/http';
import {articleCache, clearAllCaches, homeCache} from '@/util/useQuery';

import Editor from './index';

const postMock = vi.mocked(http.post);
const putMock = vi.mocked(http.put);
const navigateMock = vi.mocked(navigate);

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<any>((res) => (resolve = res));
  return {promise, resolve};
}

// testing-library 的 getByRole/findByRole 在两个类型检查路径下推断不一致
// （eslint typed-lint 认为 button 查询已返回 HTMLButtonElement，tsc 认为是
// HTMLElement）。经 HTMLElement 参数显式收窄，两条路径都成立。
function asButton(el: HTMLElement): HTMLButtonElement {
  return el as HTMLButtonElement;
}

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    tagList: ['existing'],
    author: {username: 'alice', image: 'https://example.com/a.png', following: false},
    description: 'Old description',
    title: 'Old title',
    body: 'Old body',
    slug: 'old-title-1',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    favoritesCount: 0,
    favorited: false,
    ...overrides
  };
}

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText('Article Title'), {target: {value: 'New title'}});
  fireEvent.change(screen.getByPlaceholderText("What's this article about?"), {
    target: {value: 'New description'}
  });
  fireEvent.change(screen.getByPlaceholderText('Write your article...'), {target: {value: 'New body'}});
}

beforeEach(() => {
  postMock.mockReset();
  putMock.mockReset();
  navigateMock.mockReset();
  state.article = undefined;
  // 模块级共享缓存逐用例清空，防止 invalidates 断言被上一用例残留串场
  clearAllCaches();
});

describe('Editor', () => {
  it('新建文章：提交中按钮禁用并显示 Publishing...，完成后恢复且双击不双发', async () => {
    const pending = deferred();
    postMock.mockReturnValueOnce(pending.promise);
    render(<Editor />);

    const button = asButton(screen.getByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);

    fillRequired();
    fireEvent.click(button);

    const submitting = asButton(await screen.findByRole('button', {name: 'Publishing...'}));
    expect(submitting.disabled).toBe(true);

    // 提交中再次点击（禁用态）不应再次发请求
    fireEvent.click(submitting);
    expect(postMock).toHaveBeenCalledTimes(1);

    // saveArticle 按契约解包 {article}，mock 响应给同形载荷
    pending.resolve({article: makeArticle({slug: 'new-title-1'})});
    const restored = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(restored.disabled).toBe(false);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
    // saveArticle 透传尾参 signal（未用时为 undefined），按调用元组断言
    // payload 本体（同 tagList 用例的取位方式）
    expect(postMock.mock.calls[0]?.slice(0, 2)).toEqual([
      'articles',
      expect.objectContaining({article: expect.objectContaining({title: 'New title'})})
    ]);
  });

  it('编辑文章：提交中按钮禁用并显示 Updating...，走 http.put', async () => {
    state.article = makeArticle();
    const pending = deferred();
    putMock.mockReturnValueOnce(pending.promise);
    render(<Editor />);

    expect(screen.getByText('Edit Article')).toBeDefined();
    const button = asButton(screen.getByRole('button', {name: 'Update Article'}));
    fireEvent.click(button);

    const submitting = asButton(await screen.findByRole('button', {name: 'Updating...'}));
    expect(submitting.disabled).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock.mock.calls[0]?.slice(0, 2)).toEqual([
      'articles/old-title-1',
      expect.objectContaining({article: expect.objectContaining({tagList: ['existing'], title: 'Old title'})})
    ]);

    pending.resolve({article: makeArticle()});
    const restored = asButton(await screen.findByRole('button', {name: 'Update Article'}));
    expect(restored.disabled).toBe(false);
    expect(navigateMock).toHaveBeenCalled();
  });

  it('tagList：TagInput 录入的标签进入提交 payload', async () => {
    postMock.mockResolvedValueOnce({article: makeArticle()});
    render(<Editor />);

    fillRequired();
    const tagInput = screen.getByPlaceholderText('Add tags');
    fireEvent.change(tagInput, {target: {value: 'react'}});
    fireEvent.keyDown(tagInput, {key: 'Enter'});
    expect(screen.getByText('react')).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));
    await screen.findByRole('button', {name: 'Publish Article'});
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({article: expect.objectContaining({tagList: ['react']})})
    );  });

  it('校验失败：展示字段错误且不发请求，按钮恢复可用', async () => {
    render(<Editor />);

    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    expect(await screen.findByText('Title is required')).toBeDefined();
    // a11y：错误出现时 FormItem 接线生效——input 带 aria-invalid，且
    // aria-describedby 指向承载错误文案的 role='alert' 元素（错误 span
    // 不渲染时无悬空 id）
    const titleInput = screen.getByPlaceholderText('Article Title');
    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    const describedBy = titleInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorEl = document.getElementById(describedBy!);
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent).toBe('Title is required');
    expect(postMock).not.toHaveBeenCalled();
    const button = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);
  });

  // P1 表单层收敛：服务端 422 字段错误经共享回填落到对应字段下方，
  // 顶部 Alert 不再显示整句 e.message
  it('服务端 422 字段错误：回填到字段下方且顶部不显示整句 Alert', async () => {
    // 鸭子形状（fetch-fun HTTPError 映射后：status + data.errors），视图
    // catch 不依赖错误类身份
    postMock.mockRejectedValueOnce({
      status: 422,
      message: 'title has already been taken',
      data: {errors: {title: ['has already been taken']}}
    });
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    // title 字段下方出现服务端文案（FormItem 的错误 span 渲染），且
    // 服务端错误同样走 aria-invalid + aria-describedby 接线
    expect(await screen.findByText('has already been taken')).toBeDefined();
    const titleInput = screen.getByPlaceholderText('Article Title');
    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    const errorEl = document.getElementById(
      titleInput.getAttribute('aria-describedby')!
    );
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent).toBe('has already been taken');
    const button = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);
    // 全部错误已回填字段：顶部 Alert 不显示 e.message 整句
    expect(screen.queryByText('title has already been taken')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // 提交链路 useMutation 化：成功经 invalidates 失效共享 queryCache 的
  // ['home']/['article'] 前缀条目——否则 navigate('/') 后 Home / Article
  // 的 loader 在 staleTime 内新鲜命中旧缓存，新文章 2 秒内不出现
  it('发布成功：navigate 前失效 home/article 前缀缓存条目', async () => {
    // 预置与 loader 同 key 的缓存条目（homeCacheArgs / articleCacheArgs
    // 与 views/index.tsx 的 withCache(['home'])/['article'] 寻址同形）
    homeCache.set([{offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    homeCache.set([{tag: 'react', offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    articleCache.set(['old-title-1'], makeArticle());
    postMock.mockResolvedValueOnce({article: makeArticle({slug: 'new-title-1'})});
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    // await mutate → invalidates 已在其成功分支执行 → 才 navigate
    await screen.findByRole('button', {name: 'Publish Article'});
    expect(homeCache.peek!([{offset: 0, limit: 10}])).toBeUndefined();
    expect(homeCache.peek!([{tag: 'react', offset: 0, limit: 10}])).toBeUndefined();
    expect(articleCache.peek!(['old-title-1'])).toBeUndefined();
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
  });

  it('编辑成功：同样失效 home/article 前缀缓存条目', async () => {
    state.article = makeArticle();
    homeCache.set([{offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    articleCache.set(['old-title-1'], makeArticle());
    putMock.mockResolvedValueOnce({article: makeArticle({title: 'New title'})});
    render(<Editor />);

    fireEvent.click(screen.getByRole('button', {name: 'Update Article'}));

    await screen.findByRole('button', {name: 'Update Article'});
    expect(homeCache.peek!([{offset: 0, limit: 10}])).toBeUndefined();
    expect(articleCache.peek!(['old-title-1'])).toBeUndefined();
    expect(navigateMock).toHaveBeenCalled();
  });

  // 失败自动不失效（useMutation 契约）：422 被拒时缓存条目保留，错误仍
  // 走 applyApiFieldErrors 回填字段下方
  it('提交失败：不失效缓存条目，错误回填字段下方', async () => {
    homeCache.set([{offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    postMock.mockRejectedValueOnce({
      status: 422,
      message: 'title has already been taken',
      data: {errors: {title: ['has already been taken']}}
    });
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    expect(await screen.findByText('has already been taken')).toBeDefined();
    expect(homeCache.peek!([{offset: 0, limit: 10}])).toBeDefined();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
