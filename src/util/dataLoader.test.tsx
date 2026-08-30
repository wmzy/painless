// 来源：#6 设计落地——createDataLoader 三元组（loader / useData / useQuery
// preset）的验证。util 下已有 loaderCache.test.ts（withCache 缓存层）与
// useQuery.test.ts（useQuery 组合层），本文件覆盖其上的工厂收敛层：DEV
// 来源身份校验（错配 / optional / 箭头重包 / POP 往返）与三元素同 cache
// 的通道收敛，职责与两个既有文件不重叠。
// 归并建议：dataLoader 若随胶水层上移为独立包（decisions.md 第 2 条），
// 本文件随迁；机制与应用绑定的分界见 services/dataloaders.ts 文件头。
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, waitFor, fireEvent, renderHook} from '@testing-library/react';
import {Component, type ReactNode} from 'react';
import {MemoryRouter, View, useMatched} from '@native-router/react';
import {navigate} from '@native-router/core';

import {createDataLoader} from './dataLoader';
import {clearAllCaches, createQueryCache} from './useQuery';

// —— 测试专用的两个 triple：值形状 {v: string}，与 Article 等应用实体解耦 ——
const fetchPage = vi.fn(async (key: string, _signal?: AbortSignal) => ({v: key}));
const fetchOther = vi.fn(async (key: string, _signal?: AbortSignal) => ({v: key}));

const [pageLoader, usePageData, usePageQuery] = createDataLoader({
  fetch: fetchPage,
  cache: createQueryCache<{v: string}, [string]>('dl-page'),
  keyOf: ({params}: {params: {slug?: string}}): [string] => [params.slug!]
});
const [, useOtherData] = createDataLoader({
  fetch: fetchOther,
  cache: createQueryCache<{v: string}, [string]>('dl-other'),
  keyOf: ({params}: {params: {slug?: string}}): [string] => [params.slug!]
});

// DEV 校验在 render 期 throw：用错误边界捕获并渲染 message 断言文案
class Catch extends Component<{children: ReactNode}, {err: Error | null}> {
  state: {err: Error | null} = {err: null};
  static getDerivedStateFromError(err: Error) {
    return {err};
  }
  render() {
    return this.state.err ? <i>{this.state.err.message}</i> : this.props.children;
  }
}

function PageView() {
  const {v} = usePageData();
  const {router} = useMatched();
  return (
    <div>
      <b>page:{v}</b>
      <button onClick={() => void navigate(router, '/page/b')}>go-b</button>
      <button onClick={() => router.history.back()}>back</button>
    </div>
  );
}

// 路由表：/page/:slug 挂 pageLoader；/mismatch 挂 pageLoader 但视图读别的
// triple；/wrapped 把 pageLoader 再包一层箭头；/plain 不挂 data
const routes = [
  {path: '/page/:slug', data: pageLoader, component: () => Promise.resolve(PageView)},
  {
    path: '/mismatch',
    data: pageLoader,
    component: () =>
      Promise.resolve(function MismatchView() {
        const d = useOtherData();
        return <b>other:{d.v}</b>;
      })
  },
  {
    path: '/plain',
    component: () =>
      Promise.resolve(function PlainView() {
        // optional 形态：无 data 路由合法，读到 undefined
        const d = usePageData({optional: true});
        return <b>plain:{String(d?.v)}</b>;
      })
  },
  {
    path: '/plain-strict',
    component: () =>
      Promise.resolve(function PlainStrictView() {
        // 非 optional：无 data 路由不合法——严格性与 optional 对偶
        const d = usePageData();
        return <b>strict:{d.v}</b>;
      })
  },
  {
    path: '/wrapped',
    data: (ctx: any) => pageLoader(ctx),
    component: () => Promise.resolve(PageView)
  }
];

const renderApp = (initial: string) =>
  render(
    <Catch>
      <MemoryRouter routes={routes} initialEntries={[initial]}>
        <View />
      </MemoryRouter>
    </Catch>
  );

beforeEach(() => {
  clearAllCaches();
  fetchPage.mockClear();
  fetchOther.mockClear();
});

describe('createDataLoader：DEV 来源身份校验', () => {
  // React 会把边界捕获的错误 console.error 出来——预期内的教学式错误，
  // 静音以免测试输出噪音
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('匹配的 loader：正常读到数据（校验静默通过）', async () => {
    renderApp('/page/a');
    expect(await screen.findByText('page:a')).toBeDefined();
    expect(screen.queryByText(/不匹配/)).toBeNull();
  });

  it('错配 loader：DEV throw，文案点名「复制视图忘换 loader」', async () => {
    renderApp('/mismatch');
    const err = await screen.findByText(/不匹配/);
    expect(err.textContent).toContain('[createDataLoader]');
    expect(err.textContent).toContain('复制视图后忘换 loader');
  });

  it('loader 再包一层箭头：DEV throw，文案点名该 case', async () => {
    renderApp('/wrapped');
    const err = await screen.findByText(/不匹配/);
    expect(err.textContent).toContain('再包了一层箭头');
  });

  it('optional 且无 data 路由：合法，返回 undefined', async () => {
    renderApp('/plain');
    expect(await screen.findByText('plain:undefined')).toBeDefined();
  });

  it('非 optional 且无 data 路由：DEV throw（optional 的对偶严格性）', async () => {
    renderApp('/plain-strict');
    expect(await screen.findByText(/不匹配/)).toBeDefined();
  });
});

describe('createDataLoader：POP 往返（viewStack 快照回放）', () => {
  it('push → push → back 后数据与身份校验仍成立，且零新请求', async () => {
    renderApp('/page/a');
    expect(await screen.findByText('page:a')).toBeDefined();
    expect(fetchPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('go-b'));
    expect(await screen.findByText('page:b')).toBeDefined();
    expect(fetchPage).toHaveBeenCalledTimes(2);

    // POP：viewStack 回放已 resolve 的快照（MatchedContext 随快照保留），
    // 身份校验对快照里的 route.data 依然成立；数据原样回来，不重发请求
    fireEvent.click(screen.getByText('back'));
    expect(await screen.findByText('page:a')).toBeDefined();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/不匹配/)).toBeNull();
  });
});

describe('createDataLoader：useQueryPreset（组件通道）', () => {
  it('initData 兜底 → fetch 结果就位；args 形状即 [...K, signal]', async () => {
    const {result} = renderHook(() => usePageQuery(['k'], {initData: {v: 'init'}}));
    expect(result.current.data).toEqual({v: 'init'});
    await waitFor(() => expect(result.current.data).toEqual({v: 'k'}));
    expect(fetchPage).toHaveBeenCalledWith('k', expect.any(AbortSignal));
  });

  it('loader 通道写入的条目 preset 新鲜命中：三元素共享同一 cache', async () => {
    renderApp('/page/a');
    await screen.findByText('page:a');

    // loader 已把 [a] 写进实体 cache（cache.load）——preset 同 args 消费
    // 时新鲜命中，fetch 不再执行（staleTime 窗口内）
    const {result} = renderHook(() => usePageQuery(['a']));
    await waitFor(() => expect(result.current.data).toEqual({v: 'a'}));
    expect(fetchPage.mock.calls.filter(([k]) => k === 'a')).toHaveLength(1);
  });
});
