// 来源：第 3 批评审任务——Home 视图「当前 tag」Chip 取消、上一页/下一页
// 分页（含边界禁用）的行为验证。Home 目录此前无测试文件，故新建；路由与
// UI 库均 mock，Tags 侧栏以 stub 隔离（真实 Tags 静态依赖 vite 插件的虚拟
// 模块 '@/types/index.schema'，vitest 管线无法解析，其交互在浏览器中验证）。
import type {ReactNode} from 'react';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';

const state = vi.hoisted(() => ({
  data: {articles: [] as unknown[], articlesCount: 0},
  search: '',
  router: {history: {}}
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
    Card: box('section'),
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
      React.createElement('button', {type: 'button', disabled, onClick, ...rest}, children)
  };
});

vi.mock('@native-router/react', () => ({
  useData: () => state.data,
  useSearch: () => {
    // 解析逻辑与 src/types/search.ts 的 schema 等价（coerce + 缺省）
    const raw = Object.fromEntries(new URLSearchParams(state.search));
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
  useMatched: () => ({
    location: {pathname: '/', search: state.search, hash: ''},
    router: state.router
  })
}));

vi.mock('@native-router/core', () => ({navigate: vi.fn()}));
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

import {navigate} from '@native-router/core';

import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';

import Home from './index';

const navigateMock = vi.mocked(navigate);
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

function paginationButtons() {
  return {
    // 同 Editor 测试：显式收窄规避 getByRole 在 tsc 与 eslint typed-lint
    // 两条路径下的 button 推断分歧。
    prev: asButton(screen.getByRole('button', {name: '← Previous'})),
    next: asButton(screen.getByRole('button', {name: 'Next →'}))
  };
}

function asButton(el: HTMLElement): HTMLButtonElement {
  return el as HTMLButtonElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.data = {articles: makeArticles(10), articlesCount: 25};
  state.search = '';
  getCurrentUserMock.mockReturnValue({
    username: 'me',
    email: 'me@example.com',
    token: 'jwt'
  });
});

describe('Home 视图', () => {
  it('默认视图：无筛选 Chip，Previous 禁用、Next 可用，页码 1 / 3', () => {
    render(<Home />);

    expect(screen.queryByTestId('chip')).toBeNull();
    expect(screen.getByText('title-0')).toBeDefined();
    expect(screen.getByText('1 / 3')).toBeDefined();
    const {prev, next} = paginationButtons();
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it('点击 Next 把 offset 写进 search', () => {
    render(<Home />);

    fireEvent.click(paginationButtons().next);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/?offset=10');
  });

  it('search 含 tag：展示可取消 Chip，关闭即清空筛选', () => {
    state.search = '?tag=react';
    render(<Home />);

    expect(screen.getByTestId('chip').textContent).toContain('react');

    fireEvent.click(screen.getByRole('button', {name: 'Remove tag'}));
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/');
  });

  it('第二页：Previous 可用且翻页保留 tag、回到首页时省略 offset', () => {
    state.search = '?tag=react&offset=10';
    state.data = {articles: makeArticles(10), articlesCount: 25};
    render(<Home />);

    expect(screen.getByText('2 / 3')).toBeDefined();
    const {prev} = paginationButtons();
    expect(prev.disabled).toBe(false);

    fireEvent.click(prev);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/?tag=react');
  });

  it('末页边界：Next 禁用，Previous 回退一页', () => {
    state.search = '?tag=react&offset=20';
    state.data = {articles: makeArticles(5), articlesCount: 25};
    render(<Home />);

    expect(screen.getByText('3 / 3')).toBeDefined();
    const {prev, next} = paginationButtons();
    expect(next.disabled).toBe(true);
    expect(prev.disabled).toBe(false);

    fireEvent.click(prev);
    expect(navigateMock).toHaveBeenCalledWith(state.router, '/?tag=react&offset=10');
  });

  it('单页数据：两个方向均禁用', () => {
    state.data = {articles: makeArticles(3), articlesCount: 3};
    render(<Home />);

    expect(screen.getByText('1 / 1')).toBeDefined();
    const {prev, next} = paginationButtons();
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });
});

describe('Home 文章卡片 favorite（乐观更新）', () => {
  beforeEach(() => {
    state.data = {
      articles: [{...makeArticles(1)[0], favoritesCount: 5}],
      articlesCount: 1
    };
  });

  it('点击即时 +1 高亮，成功后以服务端值为准', async () => {
    const pending = deferred();
    favoriteMock.mockReturnValueOnce(pending.promise);
    render(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));

    // 乐观：请求未决时已 +1 且置高亮
    const optimistic = screen.getByRole('button', {name: '❤ 6'});
    expect(optimistic.getAttribute('aria-pressed')).toBe('true');
    expect(favoriteMock).toHaveBeenCalledWith('slug-0', true);

    // 服务端权威值校正本地乐观值
    pending.resolve({favorited: true, favoritesCount: 9});
    expect(await screen.findByRole('button', {name: '❤ 9'})).toBeDefined();
  });

  it('失败回滚到服务端值', async () => {
    favoriteMock.mockRejectedValueOnce(new Error('network down'));
    render(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));
    expect(screen.getByRole('button', {name: '❤ 6'})).toBeDefined();

    const rolledBack = await screen.findByRole('button', {name: '❤ 5'});
    expect(rolledBack.getAttribute('aria-pressed')).toBe('false');
    expect(favoriteMock).toHaveBeenCalledWith('slug-0', true);
  });

  it('未登录点击：引导去 /login 且不发请求', () => {
    getCurrentUserMock.mockReturnValue(null);
    render(<Home />);

    fireEvent.click(screen.getByRole('button', {name: '❤ 5'}));

    expect(navigateMock).toHaveBeenCalledWith(state.router, '/login');
    expect(favoriteMock).not.toHaveBeenCalled();
  });
});
