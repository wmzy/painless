// 来源：第 3 批评审任务——Editor 提交中状态（isSubmitting 防重复提交）与 tagList 事件适配。
// Editor 视图此前无测试文件，故新建。
import type {Article} from '@/types';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';


const state = vi.hoisted(() => ({
  article: undefined as Article | undefined,
  router: {pathname: '/editor'}
}));

// 保留真实模块（构造 422 拒绝值需要 ApiError 类），只覆写视图用到的 post/put
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

    pending.resolve(undefined);
    const restored = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(restored.disabled).toBe(false);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
    expect(postMock).toHaveBeenCalledWith(
      'articles',
      expect.objectContaining({article: expect.objectContaining({title: 'New title'})})
    );
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
    expect(putMock).toHaveBeenCalledWith(
      'articles/old-title-1',
      expect.objectContaining({article: expect.objectContaining({tagList: ['existing'], title: 'Old title'})})
    );

    pending.resolve(undefined);
    const restored = asButton(await screen.findByRole('button', {name: 'Update Article'}));
    expect(restored.disabled).toBe(false);
    expect(navigateMock).toHaveBeenCalled();
  });

  it('tagList：TagInput 录入的标签进入提交 payload', async () => {
    postMock.mockResolvedValueOnce(undefined);
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
    );
  });

  it('校验失败：展示 FieldError 且不发请求，按钮恢复可用', async () => {
    render(<Editor />);

    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    expect(await screen.findByText('Title is required')).toBeDefined();
    expect(postMock).not.toHaveBeenCalled();
    const button = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);
  });

  // P1 表单层收敛：服务端 422 字段错误经共享回填落到对应字段下方，
  // 顶部 Alert 不再显示整句 e.message
  it('服务端 422 字段错误：回填到字段下方且顶部不显示整句 Alert', async () => {
    postMock.mockRejectedValueOnce(
      new http.ApiError(422, 'title has already been taken', {
        title: ['has already been taken']
      })
    );
    render(<Editor />);

    fillRequired();
    fireEvent.click(screen.getByRole('button', {name: 'Publish Article'}));

    // title 字段下方出现服务端文案（FieldError 渲染），按钮恢复可用
    expect(await screen.findByText('has already been taken')).toBeDefined();
    const button = asButton(await screen.findByRole('button', {name: 'Publish Article'}));
    expect(button.disabled).toBe(false);
    // 全部错误已回填字段：顶部 Alert 不显示 e.message 整句
    expect(screen.queryByText('title has already been taken')).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
