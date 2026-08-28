// withCache（双通道缓存的 loader 侧）行为验证：新鲜命中零请求、stale
// 旧值先行+后台重验证成功后（经 set 事件订阅）refresh 回写、miss 走
// load（并发共享 in-flight）、后台失败保旧且不 refresh。用真实每实体
// cache（articleCache/homeCache，withCache 寻址的就是它们），
// @native-router/core 只 mock refresh——断言「值变了才回写视图」这一
// 关键语义；router 用裸对象即可（类型断言已在 withCache 内完成）。
import type {ArticlePage} from '@/types';
import type {HomeSearch} from '@/types/search';

import {describe, it, expect, vi, beforeEach} from 'vitest';
import {waitFor} from '@testing-library/react';

vi.mock('@native-router/core', () => ({refresh: vi.fn()}));

import {refresh} from '@native-router/core';

import {getMockConfigs, mockViewData, setMockConfig} from './mock';
import {withCache} from './loaderCache';

import {clearAllCaches, createQueryCache, homeCache} from './useQuery';

const refreshMock = vi.mocked(refresh);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

const fakeRouter = {history: {}};
// withCache 机制用本地类型化 cache（与 Article 实体解耦）：值形状即本
// 文件的 {article: string} 假数据
const entryCache = createQueryCache<{article: string}, [string]>('loader-test');
// Article 形态的 ctx：路由无 search schema → 寻址落到 params
const ctx = {params: {title: 'some-title'}, router: fakeRouter};
// key 由 withCache 的 keyOf 定义——测试侧与 loader 同源（同一表达式）
const args = ['some-title'] as [string];

// 与路由表同形的 loader 包装：keyOf 从 params 提取 [title]（路由 ctx
// 异构，keyOf 参数收 any——同实现签名）
const articleLoader = (fn: (ctx: any) => Promise<any>, opts?: {staleTime?: number}) =>
  withCache(entryCache, ({params}: any): [string] => [params.title!], fn, opts);

beforeEach(() => {
  vi.resetAllMocks();
  clearAllCaches();
  // 本地机制 cache 不在注册表内，自行清（防跨用例的绑定 seen 污染）
  entryCache.clear();
});

describe('withCache', () => {
  it('新鲜命中：直接返回缓存值，不发请求也不 refresh', async () => {
    const fn = vi.fn();
    const cached = {article: 'cached'};
    entryCache.set(args, cached);
    const loader = articleLoader(fn);

    // 同步落定：结果就是缓存值本身（无 in-flight 等待）
    await expect(loader(ctx)).resolves.toBe(cached);
    expect(fn).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('stale 命中：立即返回旧值，后台重验证成功后 refresh 回写', async () => {
    // 只 fake Date：staleness 判定用 Date.now，断言节奏用 waitFor 的
    // 真实定时器——否则轮询间隔会把「重验后的新鲜期」也拖成 stale，
    // 第二次 loader 触发又一次后台重验证
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(1000);
    try {
      const pending = deferred<{article: string}>();
      const fn = vi.fn().mockReturnValue(pending.promise);
      const old = {article: 'old'};
      const loader = articleLoader(fn, {staleTime: 10});
      entryCache.set(args, old); // cachedAt = 1000
      vi.setSystemTime(2000); // 跨过 staleTime=10

      // 旧值先行：fn 未决时 loader 已同步拿到旧值
      await expect(loader(ctx)).resolves.toBe(old);
      expect(fn).toHaveBeenCalledTimes(1);

      // 后台重验证落定 → 值引用变化 → refresh 以 ctx.router 回写当前视图
      pending.resolve({article: 'new'});
      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
      expect(refreshMock).toHaveBeenCalledWith(fakeRouter);
      // 新值已入缓存且新鲜（cachedAt 取 settle 时刻 = 2000）：下一次
      // loader 直接新鲜命中，不再发请求
      await expect(loader(ctx)).resolves.toEqual({article: 'new'});
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('后台失败：保旧且不 refresh（视图不闪错误态）', async () => {
    const pending = deferred<{article: string}>();
    const fn = vi.fn().mockReturnValue(pending.promise);
    const old = {article: 'old'};
    const loader = articleLoader(fn, {staleTime: 10});
    entryCache.set(args, old);
    await new Promise((r) => setTimeout(r, 20));

    await expect(loader(ctx)).resolves.toBe(old);
    pending.reject(new Error('network down'));
    // rejection 被静默吞掉（无悬空 unhandled rejection）；失败 settle 的
    // set 事件经快照 diff（值未变）不触发 refresh
    await new Promise((r) => setTimeout(r, 0));
    expect(refreshMock).not.toHaveBeenCalled();
    // 旧值仍在缓存里（load 拒绝保留旧 settled 条目）
    expect(entryCache.peek!(args)?.value).toBe(old);
  });

  it('值引用不变的重验证 settle：不 refresh（结构共享等价物）', async () => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(1000);
    try {
      const same = {article: 'same'};
      // factory resolve 同一引用：diff 前后值相等
      const fn = vi.fn().mockResolvedValue(same);
      const loader = articleLoader(fn, {staleTime: 10});
      entryCache.set(args, same);
      vi.setSystemTime(2000);

      await expect(loader(ctx)).resolves.toBe(same);
      await new Promise((r) => setTimeout(r, 0));
      expect(refreshMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('miss：走 load 并把结果写回缓存，失败原样上抛', async () => {
    const pending = deferred<{article: string}>();
    const fn = vi.fn().mockReturnValue(pending.promise);
    const loader = articleLoader(fn);

    const promise = loader(ctx);
    expect(fn).toHaveBeenCalledTimes(1);
    pending.resolve({article: 'fresh'});
    await expect(promise).resolves.toEqual({article: 'fresh'});
    expect(entryCache.peek!(args)?.value).toEqual({article: 'fresh'});
  });

  it('miss 失败：promise 拒绝上抛（路由 errorComponent 接管）', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('404'));
    const loader = articleLoader(fn);

    await expect(loader(ctx)).rejects.toThrow('404');
  });

  it('并发 miss：同参数两次调用共享同一 in-flight，fn 只执行一次', async () => {
    const pending = deferred<{article: string}>();
    const fn = vi.fn().mockReturnValue(pending.promise);
    const loader = articleLoader(fn);

    const first = loader(ctx);
    const second = loader(ctx);
    pending.resolve({article: 'one'});
    await expect(Promise.all([first, second])).resolves.toEqual([
      {article: 'one'},
      {article: 'one'}
    ]);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('mock 面板与 loader 缓存的交互（DevTool Refresh 语义）', () => {
  // 本组必须用注册表内的 homeCache：mock 的 refresh 闭包清的是
  // clearAllCaches（注册表），本地 cache 清不到——语义即生产链路
  const homeCtx = {search: {offset: 0, limit: 10}, router: fakeRouter};
  const homeLoader = (fn: (ctx: any) => Promise<any>) =>
    mockViewData(
      withCache(homeCache, ({search}: any): [HomeSearch] => [search as HomeSearch], fn),
      {},
      'articlePage'
    );

  it('mockViewData 透传连跑不清缓存：新鲜命中挡在重复请求之前', async () => {
    // 'disabled' = 透传分支（不走 faker 动态导入），隔离出
    // mockViewData → setMockConfig（纯状态写）→ withCache 的纯链路。
    // mockViewData 每次 loader 运行都会 setMockConfig 刷新面板条目，
    // 但不得因此清缓存——否则 dev 下凡带 mock 的 loader 永远 miss，
    // 共享缓存形同虚设。
    setMockConfig('articlePage', {when: 'disabled'});
    const fn = vi.fn(async (_ctx: unknown): Promise<ArticlePage> => ({articles: [], articlesCount: 0}));
    const loader = homeLoader(fn);

    await loader(homeCtx);
    expect(fn).toHaveBeenCalledTimes(1);

    // 再跑：新鲜命中零请求——mock 注册的副作用不破坏缓存
    await loader(homeCtx);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('DevTool 用户交互清缓存（Refresh/切换 when）后，loader miss 重跑真实 fn', async () => {
    setMockConfig('articlePage', {when: 'disabled'});
    const fn = vi.fn(async (_ctx: unknown): Promise<ArticlePage> => ({articles: [], articlesCount: 0}));
    const loader = homeLoader(fn);

    await loader(homeCtx);
    expect(fn).toHaveBeenCalledTimes(1);

    // Refresh 按钮语义 = mockViewData 存入配置的 refresh 闭包：清缓存
    // + refresh(router)。这里直接执行该闭包验证其清缓存效果
    const config = getMockConfigs().articlePage!;
    const refresh = config.refresh as (() => void) | undefined;
    expect(typeof refresh).toBe('function');
    refresh!();
    expect(homeCache.peek!([{offset: 0, limit: 10}])).toBeUndefined();

    await loader(homeCtx);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('key 归一（hash 剥 undefined 键）', () => {
  it('{tag: undefined} 与 {} 同 key：schema 输出与视图状态永不擦肩', () => {
    // 真实 loader 的 ctx.search 来自 homeSearchSchema 输出：无 tag 时
    // 对象上没有 tag 键；视图侧 useSearch 解构得到 undefined 后回填
    // {tag: undefined} 不得拆成另一条 key
    homeCache.set([{tag: undefined, offset: 0, limit: 10}], {articles: [], articlesCount: 0});
    expect(homeCache.peek!([{offset: 0, limit: 10}])?.value).toEqual({
      articles: [],
      articlesCount: 0
    });
    // 反向同样成立：loader 先写，视图侧带 undefined 补丁同 key 命中
    homeCache.set([{offset: 20, limit: 10}], {articles: [], articlesCount: 0});
    expect(
      homeCache.peek!([{tag: undefined, offset: 20, limit: 10}])?.value
    ).toBeDefined();
  });

  it('keyOf 与 mutation 侧寻址同实体：params 提取一致命中', () => {
    entryCache.set(['t1'], {article: 'cached'});
    const loader = articleLoader(vi.fn());
    // loader 侧 ctx.params = {title: 't1'} → ['t1'] 与 mutation 的
    // key: [slug] 同一寻址空间：新鲜命中零请求
    return expect(
      loader({params: {title: 't1'}, router: fakeRouter})
    ).resolves.toEqual({article: 'cached'});
  });
});
