// 来源：painless 生态改进批——About 页无限滚动示范（services/feed.ts 的
// 原子 hooks 组装场景 + About/Feed.tsx 的哨兵交互）的行为验证。About
// 目录此前无测试文件，故新建；归并建议：若后续 Feed 演示区块拆出 About
// 或 About 增多区块，本文件应随 Feed 组件迁移为 About/Feed.test.tsx。
//
// mock 面：服务层 query（可控分页数据源 + 一次性失败 + 定向挂起）、
// haze-ui 与 @native-router/react（TypedLink）最小 stub、
// IntersectionObserver（jsdom 未实现，用手动触发的 Fake 替代——真实 IO
// 的「observe 即初始通知」与视口剪裁语义由 e2e 的真实浏览器覆盖）。
import type {ReactNode} from 'react';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {screen, fireEvent, act} from '@testing-library/react';

type FixtureArticle = {
  slug: string;
  title: string;
  description: string;
  body: string;
  tagList: string[];
  author: {username: string; image: string; following: boolean};
  createdAt: string;
  updatedAt: string;
  favoritesCount: number;
  favorited: boolean;
};

// 25 篇：limit 10 → 三页 10/10/5，第三页后追平 articlesCount 进终态
const makeArticles = (n: number): FixtureArticle[] =>
  Array.from({length: n}, (_, i) => {
    const no = String(i + 1).padStart(2, '0');
    return {
      slug: `feed-article-${no}`,
      title: `Feed article ${no}`,
      description: `Description of feed article ${no}`,
      body: `Body of feed article ${no}`,
      tagList: ['infinite', 'feed'],
      author: {username: `user${no}`, image: 'https://example.com/a.png', following: false},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      favoritesCount: i,
      favorited: false
    };
  });

const state = vi.hoisted(() => ({
  articles: [] as FixtureArticle[],
  calls: [] as Array<{offset: number; limit: number}>,
  // 一次性失败：offset 命中即 reject 并移除（重试即成功）
  failOnce: new Set<number>(),
  // 定向挂起：offset 命中的调用停在 gate 上，测试手动放行（加载态断言用）
  holdOffset: null as number | null,
  release: null as (() => void) | null
}));

vi.mock('@/services/article', () => ({
  query: (params?: {offset?: number; limit?: number}) => {
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? 10;
    state.calls.push({offset, limit});
    if (state.failOnce.delete(offset)) {
      return Promise.reject(new Error(`feed exploded at ${offset}`));
    }
    const settle = () => ({
      articles: state.articles.slice(offset, offset + limit),
      articlesCount: state.articles.length
    });
    if (state.holdOffset === offset) {
      return new Promise((resolve) => {
        state.release = () => resolve(settle());
      });
    }
    return Promise.resolve(settle());
  }
}));

vi.mock('haze-ui', async () => {
  const React = await import('react');
  const box = (Tag: string) => {
    const C = ({
      children,
      ...rest
    }: {children?: ReactNode} & Record<string, unknown>) =>
      React.createElement(Tag, rest, children);
    return C;
  };
  return {
    Title: ({level, children}: {level?: number; children?: ReactNode}) =>
      React.createElement(`h${level ?? 1}`, null, children),
    Text: box('span'),
    Badge: box('span'),
    Card: box('section'),
    Avatar: box('img'),
    Flex: box('div'),
    Button: ({
      children,
      disabled,
      onClick
    }: {children?: ReactNode; disabled?: boolean; onClick?: () => void}) =>
      React.createElement(
        'button',
        {type: 'button', disabled, onClick},
        children
      ),
    // renderView 包装用的 provider：透传 children 即可
    ToastContainer: ({children}: {children?: ReactNode}) =>
      React.createElement(React.Fragment, null, children)
  };
});

vi.mock('@native-router/react', async () => {
  const React = await import('react');
  return {
    // 视图里的 <TypedLink> 在 mock 中退化为普通锚点即可
    TypedLink: ({
      to,
      children,
      ...rest
    }: {to: string; children?: ReactNode} & Record<string, unknown>) =>
      React.createElement('a', {href: to, ...rest}, children)
  };
});

// Fake IO：记录全部实例（组件随翻页状态重建观察器，测试始终触发最新的
// 那个——即闭包里持有当前 hasNextPage/isFetchingNextPage 的实例）
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  trigger = async (isIntersecting: boolean) => {
    await act(async () => {
      this.callback(
        [{isIntersecting} as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    });
  };
}

// 哨兵进入视口（组件重建观察器后 at(-1) 即当前生效的那个）
const intersect = async () => {
  const observer = FakeIntersectionObserver.instances.at(-1);
  if (!observer) throw new Error('no active IntersectionObserver');
  await observer.trigger(true);
};

import {renderView} from '@/test-utils';

import About from './index';

describe('About infinite feed（useFeed 场景 + 哨兵交互）', () => {
  beforeEach(() => {
    state.articles = makeArticles(25);
    state.calls = [];
    state.failOnce.clear();
    state.holdOffset = null;
    state.release = null;
    FakeIntersectionObserver.instances.length = 0;
    // 只 stub 不 unstub：React 19 的被动效应可能迟于用例断言落地（store
    // 广播在 act 外触发的渲染），若在 afterEach 撤掉 stub，迟到的 effect
    // 里 new IntersectionObserver 会以 ReferenceError 炸进下一个用例。
    // 测试文件各自独立的 jsdom 环境让「整文件存活的 stub」无泄漏面。
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });

  it('首页自动拉取：useRun 发起 offset 0 的第一页，仅渲染本页内容', async () => {
    renderView(<About />);

    expect(
      await screen.findByRole('heading', {name: 'Feed article 01'})
    ).toBeDefined();
    expect(
      screen.getByRole('heading', {name: 'Feed article 10'})
    ).toBeDefined();
    // 第二页不预拉、不渲染
    expect(
      screen.queryByRole('heading', {name: 'Feed article 11'})
    ).toBeNull();
    expect(state.calls).toEqual([{offset: 0, limit: 10}]);

    // 演示区块不破坏 About 原有内容
    expect(
      screen.getByRole('heading', {name: 'About Native Router'})
    ).toBeDefined();
  });

  it('滚到底自动续页：哨兵可见触发 offset 递增的下一页，加载反馈可见', async () => {
    renderView(<About />);
    await screen.findByRole('heading', {name: 'Feed article 01'});

    // 第二页挂起：加载反馈（哨兵即 role=status 反馈区）必须先行可见
    state.holdOffset = 10;
    await intersect();
    expect(screen.getByRole('status').textContent).toBe('Loading more…');

    await act(async () => {
      state.release?.();
    });
    expect(
      await screen.findByRole('heading', {name: 'Feed article 11'})
    ).toBeDefined();
    expect(
      screen.getByRole('heading', {name: 'Feed article 20'})
    ).toBeDefined();
    expect(state.calls).toEqual([
      {offset: 0, limit: 10},
      {offset: 10, limit: 10}
    ]);
  });

  it('终态：追平 articlesCount 后停止续拉并显示结束标记', async () => {
    renderView(<About />);
    await screen.findByRole('heading', {name: 'Feed article 01'});

    await intersect();
    expect(
      await screen.findByRole('heading', {name: 'Feed article 11'})
    ).toBeDefined();
    await intersect();
    expect(
      await screen.findByRole('heading', {name: 'Feed article 25'})
    ).toBeDefined();

    // 结束标记 + 停止：哨兵再可见也不再发请求
    expect(screen.getByRole('status').textContent).toBe(
      'All 25 articles loaded'
    );
    await intersect();
    await intersect();
    expect(state.calls.map((c) => c.offset)).toEqual([0, 10, 20]);
  });

  it('首页失败：错误呈现，Retry 重拉首页（手动直调重置聚合的语义）', async () => {
    state.failOnce.add(0);
    renderView(<About />);

    expect(await screen.findByText('feed exploded at 0')).toBeDefined();
    fireEvent.click(screen.getByRole('button', {name: 'Retry'}));

    expect(
      await screen.findByRole('heading', {name: 'Feed article 01'})
    ).toBeDefined();
    expect(state.calls.map((c) => c.offset)).toEqual([0, 0]);
  });

  it('翻页失败：哨兵区呈现错误与重试，已有内容不丢，重试续拉同一页', async () => {
    renderView(<About />);
    await screen.findByRole('heading', {name: 'Feed article 01'});

    state.failOnce.add(10);
    await intersect();
    expect(await screen.findByText('feed exploded at 10')).toBeDefined();
    // 已加载的 10 篇保持可见（失败只影响续拉，不清列表）
    expect(
      screen.getByRole('heading', {name: 'Feed article 10'})
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
    expect(
      await screen.findByRole('heading', {name: 'Feed article 11'})
    ).toBeDefined();
    expect(state.calls.map((c) => c.offset)).toEqual([0, 10, 10]);
  });
});
