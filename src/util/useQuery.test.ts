// 来源：第 3 批评审任务——createQueryHook（场景 hook 工厂）的组合行为验证：
// loading→data、缓存复用、stale 标记、refetch 与 error。util 下已有测试文件
// 主题各异（http/faker），不便追加，故新建本文件。
// 场景化改造（原 useQuery(fn, args, opts) 四重载 → createQueryHook(config)）
// 后：config 在用例内创建 hook 时全量闭合，renderHook 调用点只给 args——
// 与生产调用点（Tags/CommentList）同款零 option 形态。select/retry 已按
// YAGNI 裁剪未实现，对应旧用例随之移除。
import type {Article} from '@/types';

import {describe, it, expect, vi} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';

// mock 钩子在 @/util/mock（无 haze-ui 依赖），本测试无需 mock haze-ui
//（早期链路在 vitest ESM 下无法提供 UMD 命名导出，故曾整体 mock）。

import {stableHash} from 'react-toolroom/async';

import {getMockConfigs, setMockConfig} from './mock-config';
import {
  allCaches,
  bindQueryFn,
  clearAllCaches,
  createQueryCache,
  createQueryHook,
  getCache,
  resetAllCaches
} from './useQuery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return {promise, resolve};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createQueryHook（场景 hook）', () => {
  it('loading → data：初始给 initData，请求完成后 data/loading/stale 就位', async () => {
    const pending = deferred<string[]>();
    const fetchTags = () => pending.promise;
    const cache = createQueryCache<any, any>('loading-data');
    const useTagsQuery = createQueryHook({
      queryFn: bindQueryFn(fetchTags, cache),
      initData: ['init']
    });

    const {result} = renderHook(() => useTagsQuery([]));

    expect(result.current.data).toEqual(['init']);
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeUndefined();

    await act(async () => {
      pending.resolve(['a', 'b']);
    });

    expect(result.current.data).toEqual(['a', 'b']);
    expect(result.current.loading).toBe(false);
    expect(result.current.stale).toBe(false);
  });

  it('dataUpdatedAt：成功 settle 打点、重拉成功刷新、失败保留上次成功', async () => {
    // 可控时钟：打点值直接可比（真实 Date.now 两次 settle 几乎同值，
    // 「刷新」不可断言）；固定值对 staleTime/cacheTime 均单调安全
    let now = 1_000_000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const fn = vi
        .fn()
        .mockResolvedValueOnce(['v1'])
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(['v2']);
      const cache = createQueryCache<any, any>('data-updated-at');
      const useQ = createQueryHook({
        queryFn: bindQueryFn(fn, cache),
        initData: [] as string[]
      });

      const {result} = renderHook(() => useQ([]));
      // 首个结果到达前（initData 兜底窗口）无打点
      expect(result.current.dataUpdatedAt).toBeUndefined();

      await waitFor(() => expect(result.current.data).toEqual(['v1']));
      expect(result.current.dataUpdatedAt).toBe(now);

      // 失败的重拉不触碰打点：「数据截至 T」跨错误态保持真话。注：fc 恰
      // +1 依赖 react-toolroom ≥0.18.2（fix 59abeb5）——此前 painless 的
      // signal 剥离自定义 hash 下，refetch 的删除事件在 pending claim 只
      // 落一半时派发，消费者重跑与 refetch 自身重取经 in-flight 去重合并
      // 为一次 fetch、两趟 wrapper 链 settle，一次失败被 failureCount 双计
      now += 5_000;
      await act(async () => {
        void result.current.refetch();
      });
      await waitFor(() => expect(result.current.failureCount).toBe(1));
      expect(result.current.dataUpdatedAt).toBe(1_000_000);
      expect(result.current.data).toEqual(['v1']);

      // 成功的重拉刷新到新时刻
      now += 5_000;
      await act(async () => {
        void result.current.refetch();
      });
      await waitFor(() => expect(result.current.data).toEqual(['v2']));
      expect(result.current.dataUpdatedAt).toBe(1_010_000);
    } finally {
      clock.mockRestore();
    }
  });

  it('同参数重新挂载：新鲜期内命中缓存，不再发请求', async () => {
    const fn = vi.fn().mockResolvedValue(['v1']);
    const cache = createQueryCache<any, any>('fresh-remount');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const first = renderHook(() => useQ([]));
    await waitFor(() => expect(first.result.current.data).toEqual(['v1']));
    first.unmount();

    const second = renderHook(() => useQ([]));
    await waitFor(() => expect(second.result.current.data).toEqual(['v1']));
    expect(fn).toHaveBeenCalledTimes(1);
    second.unmount();
  });

  it('超过 staleTime 的缓存命中：先给旧值并标记 stale，同时后台刷新', async () => {
    const pending = deferred<string[]>();
    const fn = vi
      .fn()
      .mockResolvedValueOnce(['old'])
      .mockReturnValueOnce(pending.promise);
    const cache = createQueryCache<any, any>('stale-swr');
    const staleTime = 20;
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[],
      staleTime
    });

    const first = renderHook(() => useQ([]));
    await waitFor(() => expect(first.result.current.data).toEqual(['old']));
    expect(first.result.current.stale).toBe(false);
    first.unmount();

    await sleep(30); // 跨过 staleTime=20，远在 cacheTime(5min) 内

    const second = renderHook(() => useQ([]));
    await waitFor(() => expect(second.result.current.stale).toBe(true));
    expect(second.result.current.data).toEqual(['old']); // 旧值先行
    expect(fn).toHaveBeenCalledTimes(2); // 已在后台重发

    await act(async () => {
      pending.resolve(['new']);
    });
    expect(second.result.current.data).toEqual(['new']);
    expect(second.result.current.stale).toBe(false);
    second.unmount();
  });

  it('refetch：绕过新鲜缓存强制重发，且引用稳定', async () => {
    const fn = vi.fn().mockResolvedValueOnce(['v1']).mockResolvedValueOnce(['v2']);
    const cache = createQueryCache<any, any>('refetch-stable');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const {result, rerender} = renderHook(() => useQ([]));
    await waitFor(() => expect(result.current.data).toEqual(['v1']));

    const refetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(refetch); // 重渲染不变

    await act(async () => {
      void refetch();
    });
    await waitFor(() => expect(result.current.data).toEqual(['v2']));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('请求失败：错误进入 error 状态，loading 复位', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const cache = createQueryCache<any, any>('error-state');
    const useQ = createQueryHook({queryFn: bindQueryFn(fn, cache)});

    const {result} = renderHook(() => useQ([]));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe('boom');
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  // failureCount（useArgsStatus 的 per-args 观测透出）：失败递增、同参
  // 数成功归零。验证序列 fail → fail → success：两个失败各 +1，最终成
  // 功既清 error 也清零计数——调用方做「第 N 次失败」提示/降级时无需
  // 自己维护计数器，也不存在成功后忘清零的残留。
  it('failureCount：每次失败递增，同参数成功后归零', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom-1'))
      .mockRejectedValueOnce(new Error('boom-2'))
      .mockResolvedValueOnce(['ok']);
    const cache = createQueryCache<any, any>('failure-count');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const {result} = renderHook(() => useQ([]));

    await waitFor(() => expect(result.current.error?.message).toBe('boom-1'));
    expect(result.current.failureCount).toBe(1);

    await act(async () => {
      void result.current.refetch();
    });
    await waitFor(() => expect(result.current.error?.message).toBe('boom-2'));
    expect(result.current.failureCount).toBe(2);

    await act(async () => {
      void result.current.refetch();
    });
    await waitFor(() => expect(result.current.data).toEqual(['ok']));
    expect(result.current.failureCount).toBe(0); // 成功即归零
    expect(result.current.error).toBeUndefined();
  });

  it('已有结果后的重拉：loading 保持 false，fetching 如实为 true', async () => {
    const pending = deferred<string[]>();
    const fn = vi.fn().mockResolvedValueOnce(['v1']).mockReturnValueOnce(pending.promise);
    const cache = createQueryCache<any, any>('background-fetching');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const {result} = renderHook(() => useQ([]));
    await waitFor(() => expect(result.current.data).toEqual(['v1']));
    expect(result.current.loading).toBe(false);

    await act(async () => {
      void result.current.refetch(); // 同 invalidate 触发的重拉路径
    });

    // 已有结果：不回到初载 loading（不闪整屏 Spinner），in-flight 由 fetching 表达
    expect(result.current.loading).toBe(false);
    expect(result.current.fetching).toBe(true);
    expect(result.current.data).toEqual(['v1']); // 旧值保持渲染

    await act(async () => {
      pending.resolve(['v2']);
    });
    expect(result.current.fetching).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(['v2']);
  });

  it('初次加载：loading 与 fetching 均 true，直到首个结果 settle', async () => {
    const pending = deferred<string[]>();
    const fn = vi.fn().mockReturnValue(pending.promise);
    const cache = createQueryCache<any, any>('initial-loading');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const {result} = renderHook(() => useQ([]));

    // initData 只是本地兜底，store 中尚无结果：初载语义下 loading 也为 true
    expect(result.current.data).toEqual([]);
    expect(result.current.loading).toBe(true);
    expect(result.current.fetching).toBe(true);

    await act(async () => {
      pending.resolve(['a']);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.fetching).toBe(false);
    expect(result.current.data).toEqual(['a']);
  });

  it('refetch 拆除在飞请求：单次点击重发一次（删除即被动重拉+显式调用共享）', async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const fn = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const cache = createQueryCache<any, any>('refetch-inflight');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const {result} = renderHook(() => useQ([]));
    await act(async () => {
      first.resolve(['v1']);
    });
    await waitFor(() => expect(result.current.data).toEqual(['v1']));
    expect(fn).toHaveBeenCalledTimes(1);

    // refetch = 删除缓存条目 + 重发。删除会连带拆掉 in-flight 注册并触发
    // useCache 的被动重验证（delete 事件 → 已见 args 重跑），随后的显式
    // injectable 调用则与被动重验证共享同一 in-flight——一次点击仍是
    // 一次底层请求。注意：连续点击期间的在飞请求会被下一次 delete 拆除
    // 重发（useDedup 时代的「连点合并」不再保留，provider 去重只在同一条
    // in-flight 生命周期内生效）。
    await act(async () => {
      void result.current.refetch();
    });
    await act(async () => {
      second.resolve(['v2']);
    });
    await waitFor(() => expect(result.current.data).toEqual(['v2']));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // useArgsStatus 换装批（react-toolroom ≥0.14.1）：loading/error 改按
  // args key 独立观测。本用例锁住与旧 injectable 级 useInitialLoading 的
  // 行为差异：args 切到无缓存的新参数时，旧实现因「store 已有（旧参数
  // 的）结果」恒 hasResult=true 而漏报初载（loading=false 但新参数数据
  // 未到，屏上是旧参数的陈旧值）；per-args 观测下 keyed 槽按当前 args
  // 寻址，初载如实为 true。
  it('args 切换到无缓存参数：loading 如实回到 true（per-args 初载判定）', async () => {
    const forA = deferred<string[]>();
    const forB = deferred<string[]>();
    const fn = vi
      .fn()
      .mockImplementationOnce(() => forA.promise)
      .mockImplementationOnce(() => forB.promise);
    const cache = createQueryCache<any, any>('args-switch-loading');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const {result, rerender} = renderHook(
      ({key}: {key: string}) => useQ([key]),
      {initialProps: {key: 'a'}}
    );

    expect(result.current.loading).toBe(true);
    await act(async () => {
      forA.resolve(['from-a']);
    });
    await waitFor(() => expect(result.current.data).toEqual(['from-a']));
    expect(result.current.loading).toBe(false);

    // 切到无缓存的 b：b 在飞且 b 尚无结果 → loading 回到 true
    rerender({key: 'b'});
    expect(result.current.loading).toBe(true);

    await act(async () => {
      forB.resolve(['from-b']);
    });
    await waitFor(() => expect(result.current.data).toEqual(['from-b']));
    expect(result.current.loading).toBe(false);
  });

  it('跨组件同时挂载：provider 层共享同一 in-flight，重挂载命中缓存', async () => {
    const pending = deferred<string[]>();
    const fn = vi.fn().mockReturnValue(pending.promise);
    const cache = createQueryCache<any, any>('shared-inflight');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    // 0.8 形态：useCache 的 miss 走 provider.load——两个组件实例并发首载
    // 同参数，共享同一条 in-flight（fn 只执行一次），双方各自广播拿到
    // 一致数据；跨组件的数据复用由共享 cache 承担（下方重挂载验证）。
    const first = renderHook(() => useQ([]));
    const second = renderHook(() => useQ([]));

    expect(first.result.current.loading).toBe(true);
    expect(second.result.current.loading).toBe(true);

    await act(async () => {
      pending.resolve(['shared']);
    });

    expect(first.result.current.data).toEqual(['shared']);
    expect(second.result.current.data).toEqual(['shared']);
    expect(fn).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();

    // 缓存新鲜期内重挂载：不再发请求，直接拿缓存值
    const third = renderHook(() => useQ([]));
    await waitFor(() => expect(third.result.current.data).toEqual(['shared']));
    expect(fn).toHaveBeenCalledTimes(1);
    third.unmount();
  });

  it('signal：args 变化触发重跑时，上一次调用收到的 signal 变 aborted', async () => {
    const calls: {id: string; signal?: AbortSignal}[] = [];
    const fn = vi.fn((id: string, signal?: AbortSignal) => {
      calls.push({id, signal});
      return Promise.resolve([id]);
    });
    const cache = createQueryCache<any, any>('signal-abort');
    const useQ = createQueryHook({queryFn: bindQueryFn(fn, cache)});

    const {rerender} = renderHook(
      ({id}) => useQ([id]),
      {initialProps: {id: 'a'}}
    );

    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    // useRun({signal: true}) 给每次 run 尾附 AbortSignal
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);

    rerender({id: 'b'});
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));

    expect(calls[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(calls[1]?.signal).not.toBe(calls[0]?.signal); // 每次 run 一个新 signal
    expect(calls[0]?.signal?.aborted).toBe(true); // 依赖变化 abort 上一次
    expect(calls[1]?.signal?.aborted).toBe(false); // 当前调用不受影响
  });

  it('hash 归一：对象参数键序不同视为同一 key，新鲜期内命中缓存不重发', async () => {
    // fn 带一个对象参数：覆盖 args 为对象字面量时的 hash 归一。参数
    // 签名经显式类型标注进入 Parameters<F>（vi.fn 本体无参，少参可赋
    // 多参签名），避免 unused 参数。
    const fn: (args: Record<string, unknown>) => Promise<string[]> = vi.fn(
      () => Promise.resolve(['v1'])
    );
    const cache = createQueryCache<any, any>('hash-normalize');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const first = renderHook(
      ({args}) => useQ([args]),
      {initialProps: {args: {page: 1, tab: 'feed'}}}
    );
    await waitFor(() => expect(first.result.current.data).toEqual(['v1']));
    first.unmount();

    // 键序颠倒 + 全新对象字面量：stableHash 结构化归一为同一缓存 key
    // （JSON.stringify 会因键序产出两个 key 而重发）
    const second = renderHook(
      ({args}) => useQ([args]),
      {initialProps: {args: {tab: 'feed', page: 1}}}
    );
    await waitFor(() => expect(second.result.current.data).toEqual(['v1']));
    expect(fn).toHaveBeenCalledTimes(1); // 缓存命中，未重发
    second.unmount();
  });

  it('hash 归一：对象参数内嵌的 AbortSignal 递归剥除，与不嵌同 key', async () => {
    // 顶层剥 signal（useRun 尾附）与递归剥 undefined 键原是两层不对称的
    // 归一：signal 嵌在对象参数内时不剥——stableHash 虽把 signal 值折叠
    // 为固定占位，多出的键仍参与结构比较，同逻辑参数被拆成两条 key。
    // 场景：service 形参是 options 对象且调用方把 AbortSignal 混进对象
    const fn: (args: Record<string, unknown>) => Promise<string[]> = vi.fn(
      () => Promise.resolve(['v1'])
    );
    const cache = createQueryCache<any, any>('hash-nested-signal');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const first = renderHook(
      ({args}) => useQ([args]),
      {initialProps: {args: {page: 1, signal: new AbortController().signal}}}
    );
    await waitFor(() => expect(first.result.current.data).toEqual(['v1']));
    first.unmount();

    // 不带 signal 的同逻辑参数（loader 侧 schema 输出形态）与带另一个
    // 新 signal 实例的调用（signal 身份每次 run 都换）都命中同一 key，
    // 不重发
    const second = renderHook(
      ({args}) => useQ([args]),
      {initialProps: {args: {page: 1}}}
    );
    await waitFor(() => expect(second.result.current.data).toEqual(['v1']));
    second.unmount();
    const third = renderHook(
      ({args}) => useQ([args]),
      {initialProps: {args: {page: 1, signal: new AbortController().signal}}}
    );
    await waitFor(() => expect(third.result.current.data).toEqual(['v1']));
    third.unmount();
    expect(fn).toHaveBeenCalledTimes(1);

    // 更深一层（对象参数内嵌对象再嵌 signal）：同形状带/不带 signal
    // 仍归一为同一 key。形状与前述不同是新 key，fn 第二次调用合理
    const fourth = renderHook(
      ({args}) => useQ([{filters: args}]),
      {initialProps: {args: {page: 1, signal: new AbortController().signal}}}
    );
    await waitFor(() => expect(fourth.result.current.data).toEqual(['v1']));
    fourth.unmount();
    expect(fn).toHaveBeenCalledTimes(2);

    const fifth = renderHook(
      ({args}) => useQ([{filters: args}]),
      {initialProps: {args: {page: 1}}}
    );
    await waitFor(() => expect(fifth.result.current.data).toEqual(['v1']));
    fifth.unmount();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  // 断网恢复重验证（useReconnectRevalidate）：toolroom 监听 window 的
  // 'online' 事件（内部再经 navigator.onLine 守卫，jsdom 默认 true 不
  // 拦截），触发时对 miss/stale 条目后台重拉，新鲜期内零请求。
  it('断网恢复：stale 条目在 online 事件后后台重拉', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(['v1'])
      .mockResolvedValueOnce(['v2']);
    const cache = createQueryCache<any, any>('online-revalidate');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[],
      staleTime: 20
    });

    const {result} = renderHook(() => useQ([]));
    await waitFor(() => expect(result.current.data).toEqual(['v1']));

    await sleep(30); // 跨过 staleTime=20，条目转为 stale

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(fn).toHaveBeenCalledTimes(2); // stale 条目后台重发
    await waitFor(() => expect(result.current.data).toEqual(['v2']));
    expect(result.current.stale).toBe(false);
  });

  it('断网恢复：新鲜期内 online 事件不重发请求', async () => {
    const fn = vi.fn().mockResolvedValue(['v1']);
    const cache = createQueryCache<any, any>('online-fresh');
    // staleTime 给宽（waitFor 的轮询本身要耗 ~10ms/次，20ms 会把
    // dispatch 拖出新鲜窗口——这里只验新鲜语义，不卡毫秒）
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[],
      staleTime: 1000
    });

    const {result} = renderHook(() => useQ([]));
    await waitFor(() => expect(result.current.data).toEqual(['v1']));

    await act(async () => {
      window.dispatchEvent(new Event('online')); // 仍在 staleTime 内
    });
    expect(fn).toHaveBeenCalledTimes(1); // 新鲜条目零请求
  });

  it('断网恢复：卸载后 online 事件不再触发重拉（监听已清理）', async () => {
    const fn = vi.fn().mockResolvedValue(['v1']);
    const cache = createQueryCache<any, any>('online-unmounted');
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[],
      staleTime: 20
    });

    const {unmount} = renderHook(() => useQ([]));
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    unmount();

    await sleep(30); // 跨过 staleTime，但监听已随卸载移除
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // ---- 持久化（opts.persist：localStorage 冷启动镜像）------------------
  //
  // 这组用例各建带 persist 的临时 cache，localStorage 键唯一（共享真键
  // 会与模块级 tagsCache 的镜像互相覆盖）。jsdom 的 localStorage 用例间
  // 不自动清空，beforeAll 统一清场；各用例收尾自清键，杜绝向下游用例
  // （尤其断网恢复组，它们重新 import 本模块的产物已固定）渗漏。

  it('持久化 round-trip：写入落盘，新 cache 同键 hydrate 回同值且 cachedAt 保留', async () => {
    const KEY = 'painless.test.roundtrip';
    localStorage.clear();

    const writer = createQueryCache<string[], []>('roundtrip-writer', 60_000, {
      persist: KEY
    });
    writer.set([], ['tag-a', 'tag-b']);
    // set 事件同步驱动镜像落盘
    const raw = localStorage.getItem(KEY);
    expect(raw).toBeDefined();
    // 盘上是版本包 {v, data}：v 是 hydrate 门禁（版本不符整体丢弃），
    // data 才是 dehydrate 表（hashed key → [value, cachedAt]，cachedAt
    // 为写入毫秒时间戳——staleness 计算的原材料）
    const stored = JSON.parse(raw!);
    expect(stored.v).toBe(1);
    expect(stored.data[stableHash([])]).toEqual([
      ['tag-a', 'tag-b'],
      expect.any(Number)
    ]);
    const cachedAt = stored.data[stableHash([])][1] as number;

    // 模拟重启：全新 cache 读同一键。hydrate 合并语义保留盘上 cachedAt
    // ——重启后条目年龄按真实年龄计，条目天然 stale，消费侧旧值先行 +
    // 后台重验证（SWR），陈旧数据不会冒充新鲜值
    const reader = createQueryCache<string[], []>('roundtrip-reader', 60_000, {
      persist: KEY
    });
    const entry = reader.peek!([]);
    expect(entry?.value).toEqual(['tag-a', 'tag-b']);
    expect(entry?.cachedAt).toBe(cachedAt);

    localStorage.removeItem(KEY);
  });

  it('clearAllCaches 同步清持久化 storage（登出擦盘语义完整）', () => {
    const KEY = 'painless.test.logout';
    localStorage.clear();

    const cache = createQueryCache<string[], []>('logout-wipe', 60_000, {
      persist: KEY
    });
    cache.set([], ['tag']);
    expect(localStorage.getItem(KEY)).not.toBeNull();

    clearAllCaches();
    // 内存与盘同清：下个账号冷启动不得 hydrate 回上个账号的数据
    expect(cache.snapshot?.()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('坏 JSON / 坏形状静默降级：不抛、cache 空开始、盘上坏数据不清（等覆写）', () => {
    // 坏 JSON：模块加载路径上不允许存储层炸掉——静默丢弃，cache 空开始
    const BAD1 = 'painless.test.bad-json';
    localStorage.setItem(BAD1, '{not json');
    const c1 = createQueryCache<string[], []>('bad-json', 60_000, {
      persist: BAD1
    });
    expect(c1.snapshot?.()).toEqual([]);

    // 坏形状（值不是 [value, cachedAt] 二元组）：粗验不合格整体丢弃
    const BAD2 = 'painless.test.bad-shape';
    localStorage.setItem(BAD2, JSON.stringify({k: ['v']}));
    const c2 = createQueryCache<string[], []>('bad-shape', 60_000, {
      persist: BAD2
    });
    expect(c2.snapshot?.()).toEqual([]);

    // 降级路径不写盘：盘上坏数据原样保留，等下次真实 set 的镜像覆写。
    // 读侧丢弃 ≠ 写侧擦除——避免 hydrate 失败时误清用户数据
    expect(localStorage.getItem(BAD1)).toBe('{not json');
    expect(localStorage.getItem(BAD2)).toBe(JSON.stringify({k: ['v']}));

    localStorage.removeItem(BAD1);
    localStorage.removeItem(BAD2);
  });

  it('版本门禁：{v, data} 才 hydrate；旧格式（裸表）与版本不符整体丢弃且不清盘', () => {
    // 旧格式：v 引入前的裸 dehydrate 表（历史版本模板写入的镜像）。
    // 版本门禁不认 → 整体丢弃静默重来，不做跨版本迁移（缓存可随时
    // 重建，迁移路径的维护成本高于一次冷启动重拉）
    const OLD = 'painless.test.persist-old';
    const oldPayload = JSON.stringify({
      [stableHash([])]: [['legacy-tag'], Date.now()]
    });
    localStorage.setItem(OLD, oldPayload);
    const cOld = createQueryCache<string[], []>('persist-old', 60_000, {
      persist: OLD
    });
    expect(cOld.peek!([])).toBeUndefined(); // 未 hydrate 进内存

    // 读侧丢弃 ≠ 写侧擦除：盘上旧数据原样保留，等下次真实 set 覆写
    expect(localStorage.getItem(OLD)).toBe(oldPayload);

    // 版本不符：未来/未知版本的载荷同样整体丢弃（手改或前滚后回滚）
    const FUTURE = 'painless.test.persist-future';
    localStorage.setItem(
      FUTURE,
      JSON.stringify({v: 99, data: {[stableHash([])]: [['x'], Date.now()]}})
    );
    const cFuture = createQueryCache<string[], []>('persist-future', 60_000, {
      persist: FUTURE
    });
    expect(cFuture.peek!([])).toBeUndefined();

    // 当前版本 {v: 1, data}：hydrate 生效，value 与 cachedAt 均保留
    const CUR = 'painless.test.persist-v1';
    const cachedAt = Date.now();
    localStorage.setItem(
      CUR,
      JSON.stringify({v: 1, data: {[stableHash([])]: [['tag'], cachedAt]}})
    );
    const cCur = createQueryCache<string[], []>('persist-v1', 60_000, {
      persist: CUR
    });
    expect(cCur.peek!([])?.value).toEqual(['tag']);
    expect(cCur.peek!([])?.cachedAt).toBe(cachedAt);

    localStorage.removeItem(OLD);
    localStorage.removeItem(FUTURE);
    localStorage.removeItem(CUR);
  });

  it('跨 tab 同步：storage 事件清本 tab 内存，消费者 miss 重拉服务端真相', async () => {
    const KEY = 'painless.test.crosstab';
    localStorage.clear();
    const pending = deferred<string[]>();
    const fn = vi
      .fn()
      .mockResolvedValueOnce(['v1'])
      .mockReturnValueOnce(pending.promise);
    // cache 用 <any, any>（0 参 fn 的元组推导为 []，显式强类型 K 反而
    // 与 mock 的调用签名不兼容——同本文件既有约定）
    const cache = createQueryCache<any, any>('crosstab', 60_000, {
      persist: KEY
    });
    const useQ = createQueryHook({
      queryFn: bindQueryFn(fn, cache),
      initData: [] as string[]
    });

    const {result} = renderHook(() => useQ([]));
    await waitFor(() => expect(result.current.data).toEqual(['v1']));

    // 模拟另一 tab 清空镜像：写盘 + 广播。jsdom 不会自动跨「文档」广播
    // storage 事件，手动派发 StorageEvent 还原浏览器行为（storageArea
    // 指明来源是 localStorage）。
    const emptyMirror = JSON.stringify({v: 1, data: {}});
    localStorage.setItem(KEY, emptyMirror);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: KEY,
          newValue: emptyMirror,
          storageArea: localStorage
        })
      );
    });

    // 事件 → 本 tab 内存清空 → useCache 被动重验证（delete 事件重跑）
    expect(cache.peek!([])).toBeUndefined();
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));

    // 回环防护：clear 的 delete 事件驱动镜像写回，但写前 diff 发现盘上
    // 已是同一份空表 → 跳过写盘（不依赖浏览器「同值不广播」的实现细
    // 节，链路一轮收敛，不再给其它 tab 制造新事件源）
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();

    // 消费者从服务端重建真相（不是 hydrate 别 tab 的盘上字节）
    await act(async () => {
      pending.resolve(['v2']);
    });
    await waitFor(() => expect(result.current.data).toEqual(['v2']));

    localStorage.removeItem(KEY);
  });

  it('跨 tab 登出擦盘（newValue=null）：本 tab 内存同样清空', () => {
    const KEY = 'painless.test.crosstab-null';
    localStorage.clear();
    const cache = createQueryCache<string[], []>('crosstab-null', 60_000, {
      persist: KEY
    });
    cache.set([], ['v1']);
    expect(cache.peek!([])?.value).toEqual(['v1']);

    // 另一 tab 登出擦盘：removeItem 广播 newValue=null——本 tab 不能继续
    // 用旧会话留在内存里的镜像（与冷启动「不得 hydrate 回上个账号
    // 数据」同一语义的会话内对偶）
    window.dispatchEvent(
      new StorageEvent('storage', {key: KEY, newValue: null, storageArea: localStorage})
    );
    expect(cache.peek!([])).toBeUndefined();

    localStorage.removeItem(KEY);
  });

  it('跨 tab 互写收敛：两个监听 tab 的写盘乒乓经 diff 一轮收敛不死循环', () => {
    // 回环防护的收敛性契约（useQuery.ts 镜像写盘的写前 diff）：两个 tab
    // 都在监听 storage、各自持有镜像写盘回调时，一轮事件→清内存→写回
    // 空表之后盘上稳定——第二个写回 diff 到同值跳过，链路不再产生新
    // 写盘（若 diff 失效，写回→广播→再清→再写回会无限乒乓）。
    // jsdom 不自动广播 storage 事件，手动派发还原浏览器行为；两个
    // cache 都挂在本 window 上、事件同时命中两者，是真实「只有其它
    // tab 收到」的保守超集——超集下收敛则真实链路必收敛
    const KEY = 'painless.test.crosstab-pingpong';
    localStorage.clear();
    const tabA = createQueryCache<string[], []>('tab-a', 60_000, {
      persist: KEY
    });
    const tabB = createQueryCache<string[], []>('tab-b', 60_000, {
      persist: KEY
    });

    // tabA 拿到新数据落盘（真实浏览器此刻会向 tabB 广播）
    tabA.set([], ['v1']);
    expect(tabB.peek!([])).toBeUndefined(); // 未 hydrate 别 tab 的字节
    const mirror = localStorage.getItem(KEY)!;

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: KEY,
        newValue: mirror,
        storageArea: localStorage
      })
    );

    // 两 tab 各自清内存；clear 的 delete 事件驱动各自的镜像写回空表：
    // 第一个写回发现盘上是 v1 镜像（不同值）→ 落盘；第二个写回 diff
    // 发现盘上已是同一份空表 → 跳过。全链路只多一次写盘
    expect(tabA.peek!([])).toBeUndefined();
    expect(tabB.peek!([])).toBeUndefined();
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const empty = JSON.stringify({v: 1, data: {}});
    expect(localStorage.getItem(KEY)).toBe(empty);

    // 广播链回环（真实浏览器会把这次空表写盘广播给另一 tab）：再派发
    // 一轮事件，两 tab 再清（已空，no-op）——写回 diff 同值跳过，无新
    // 写盘，链路就此收敛
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: KEY,
        newValue: empty,
        storageArea: localStorage
      })
    );
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KEY)).toBe(empty);

    setItemSpy.mockRestore();
    localStorage.removeItem(KEY);
  });

  // 编译期反向用例（tsc --noEmit 守门，vitest 本身不跑类型检查）：
  // QueryHookConfig 泛型化后 initData 收紧到 queryFn 的场景数据类型，
  // 错形状必须在编译期报错；判别若失效（initData 退回 unknown），下方
  // 钉子会反向报 Unused directive 的告警。
  // 正向对照（同 cache 的合法 initData）在上一用例与 dataLoader.test 的
  // 场景 hook 组里。两段调用只作类型检查消费，运行时零副作用（真实
  // bindQueryFn 产物，getCache 不会抛）。
  it('initData 类型收紧：错形状在声明点编译期报错（@ts-expect-error 钉住）', () => {
    const cache = createQueryCache<string[], []>('init-data-type');
    const fetchTags = async (): Promise<string[]> => ['x'];
    const queryFn = bindQueryFn(fetchTags, cache);
    expect(typeof createQueryHook({queryFn, initData: ['ok']})).toBe('function');
    void createQueryHook({
      queryFn,
      // @ts-expect-error initData 必须是 queryFn 的场景数据类型 string[]，对象形状应被拒
      initData: {wrong: true}
    });
  });

  // DevTool 面板 Refresh（query 通道）语义 = useMock 存进配置的 refresh
  // 闭包。粒度契约：只删当前 args 的条目 + 重发本请求——多 key 实体
  //（articleCache 各 slug 形态）的其他条目不得误伤（原实现 cache.clear()
  // 清整个实体，面板点一条 mock 的 Refresh 会把别的视图的缓存基线连
  // 带清空）。when 固定 'disabled'（透传分支），隔离出 中间件注册 →
  // 请求流过 → 闭包捕获 args 的纯链路
  it('DevTool Refresh（query 通道）只删当前 key：同实体其他 key 不误伤', async () => {
    const MOCK_KEY = 'mock-refresh-granularity';
    setMockConfig(MOCK_KEY, {when: 'disabled'});
    try {
      const cache = createQueryCache<{id: string}, [string]>('mock-refresh');
      const fetcher = vi.fn(async (id: string) => ({id}));
      const useQ = createQueryHook({
        queryFn: bindQueryFn(fetcher, cache),
        mock: {schema: {}, key: MOCK_KEY}
      });
      const {result} = renderHook(() => useQ(['a']));
      await waitFor(() => expect(result.current.data).toEqual({id: 'a'}));

      // 同实体另一条目（别的视图写进来的真实数据）
      cache.set(['b'], {id: 'b'});

      const refresh = getMockConfigs()[MOCK_KEY]!.refresh as
        | (() => void)
        | undefined;
      expect(typeof refresh).toBe('function');
      refresh!();

      // 当前 key 的条目已删（重发在飞）；无关 key 原样保留
      expect(cache.peek!(['a'])).toBeUndefined();
      expect(cache.peek!(['b'])?.value).toEqual({id: 'b'});
      // 重发经注入链回填：消费者拿到新结果（引用换新、data 就位）
      await waitFor(() =>
        expect(cache.peek!(['a'])?.value).toEqual({id: 'a'})
      );
      expect(fetcher.mock.calls.filter(([id]) => id === 'a').length)
        .toBeGreaterThanOrEqual(2);
    } finally {
      setMockConfig(MOCK_KEY, {when: 'disabled'});
    }
  });

  // mock always 挂起镜像写入（决策见 docs/decisions.md 第 12 条）：组件
  // 通道的 useMock 垫在缓存内层，always 造的 faker 数据会 settle 进持久
  // 化 cache——不拦落盘的话，刷新后 mockConfig（内存态）重置 off，盘上
  // 假数据被 hydrate 回来（侧栏显示 faker 造的 tags，脱离面板管理）。
  // setMockConfig 直接走状态模块（守卫读的就是它）。
  it('mock always 激活期间挂起镜像写入；关闭后恢复写盘', () => {
    const KEY = 'painless.test.mock-always';
    const MOCK_KEY = 'mock-always-guard';
    localStorage.clear();
    setMockConfig(MOCK_KEY, {when: 'always'});
    try {
      const cache = createQueryCache<string[], []>('mock-always', 60_000, {
        persist: KEY
      });
      cache.set([], ['faker-tag']);
      // 只拦镜像落盘：内存缓存照常更新（DevTool 缓存视图与组件消费不受
      // 影响），盘上不残留假数据
      expect(cache.peek!([])?.value).toEqual(['faker-tag']);
      expect(localStorage.getItem(KEY)).toBeNull();

      // 关闭 always（DevTool 切 when 即 clearAllCaches，真实数据随后
      // settle）：镜像写盘恢复，盘上是挂起窗口结束后的全量表
      setMockConfig(MOCK_KEY, {when: 'disabled'});
      cache.set([], ['real-tag']);
      const stored = JSON.parse(localStorage.getItem(KEY)!);
      expect(stored.data[stableHash([])]).toEqual([
        ['real-tag'],
        expect.any(Number)
      ]);
    } finally {
      // mockConfig 是模块级全局态：收尾复位，不把「always 即不写盘」
      // 渗漏给下游用例
      setMockConfig(MOCK_KEY, {when: 'disabled'});
      localStorage.removeItem(KEY);
    }
  });
});

describe('resetAllCaches（测试工具：注册表还原基线）', () => {
  it('清临时 cache 的注册与盘键，模块实体仍在册且 clearAllCaches 照常工作', () => {
    const KEY = 'painless.test.reset-all';
    localStorage.clear();
    const temp = createQueryCache<string[], []>('reset-temp', 60_000, {
      persist: KEY
    });
    temp.set([], ['x']);
    expect(localStorage.getItem(KEY)).not.toBeNull();

    resetAllCaches();

    // 注册表回到模块加载基线：只有四个模块实体，临时 cache 出册
    expect(allCaches.map(({name}) => name)).toEqual([
      'article',
      'home',
      'comments',
      'tags'
    ]);

    // 清场语义同登出：临时 cache 内存清空、盘键擦净
    expect(temp.snapshot?.()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();

    // 还原后的注册表功能完整：模块实体写入后 clearAllCaches 仍能清掉
    // （logout / DevTool Clear / mock refresh 闭包的既有链路不受重置影响）。
    // 实体经注册表寻址取得——同时验证还原的是原实例而非空表
    const entry = allCaches.find(({name}) => name === 'article')!;
    entry.cache.set(['reset-probe'] as [string], {});
    expect(entry.cache.peek!(['reset-probe'] as [string])).toBeDefined();
    clearAllCaches();
    expect(entry.cache.snapshot?.()).toEqual([]);
  });
});

describe('bindQueryFn / getCache（fetch × cache 配对）', () => {
  it('getCache 取回绑定的同一 cache；函数身份不变；DEV 下换绑不同 cache 早抛', () => {
    const fn = vi.fn(async () => ['v']);
    const first = createQueryCache<any, any>('bind-first');
    const second = createQueryCache<any, any>('bind-second');
    const queryFn = bindQueryFn(fn, first);

    // WeakMap 存配对：函数本身零改动（身份、fn.name、可枚举属性都不变）
    expect(queryFn).toBe(fn);
    expect(getCache(queryFn)).toBe(first);

    // 原契约是「后者静默覆盖」，症状隐蔽（先绑的 hook 运行时改读后绑的
    // cache）——改为 DEV 早抛（vitest 环境 import.meta.env.DEV 为 true），
    // 风格对齐 getCache 对未绑定函数的早抛。抛错即拒：既有绑定不被
    // 半途生效的违约改写
    expect(() => bindQueryFn(fn, second)).toThrow(/bindQueryFn/);
    expect(getCache(queryFn)).toBe(first);
  });

  it('重绑同一 cache 实例：幂等放行，不视为违约', () => {
    const fn = vi.fn(async () => ['v']);
    const cache = createQueryCache<any, any>('bind-same');
    const queryFn = bindQueryFn(fn, cache);
    expect(() => bindQueryFn(fn, cache)).not.toThrow();
    expect(getCache(queryFn)).toBe(cache);
  });

  it('非 DEV 维持后者覆盖（生产语义不变）', () => {
    vi.stubEnv('DEV', false);
    try {
      const fn = vi.fn(async () => ['v']);
      const first = createQueryCache<any, any>('bind-prod-first');
      const second = createQueryCache<any, any>('bind-prod-second');
      bindQueryFn(fn, first);
      expect(() => bindQueryFn(fn, second)).not.toThrow();
      expect(getCache(bindQueryFn(fn, second))).toBe(second);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('未绑定的函数抛错并指向 bindQueryFn（模拟品牌约束被 any 断链绕过）', () => {
    const plain = vi.fn(async () => ['v']) as any;
    expect(() => getCache(plain)).toThrow(/bindQueryFn/);
  });
});
