// 来源：第 3 批评审任务——useQuery（项目级数据获取 preset）的组合行为验证：
// loading→data、缓存复用、stale 标记、refetch 与 error。util 下已有测试文件
// 主题各异（http/faker），不便追加，故新建本文件。
import {describe, it, expect, vi} from 'vitest';
import {renderHook, render, screen, act, waitFor} from '@testing-library/react';
import {memo, createElement} from 'react';

// useQuery 的 mock 钩子已随 DevTool 拆分迁至 @/util/mock（无 haze-ui
// 依赖），本测试无需再 mock haze-ui（早期 useQuery → DevTool → haze-ui
// 链路在 vitest ESM 下无法提供 UMD 命名导出，故曾整体 mock）。

import {stableHash} from 'react-toolroom/async';

import {clearAllCaches, createQueryCache, useQuery} from './useQuery';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return {promise, resolve};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useQuery', () => {
  it('loading → data：初始给 initData，请求完成后 data/loading/stale 就位', async () => {
    const pending = deferred<string[]>();
    const fetchTags = () => pending.promise;
    const cache = createQueryCache<any, any>('loading-data');

    const {result} = renderHook(() =>
      useQuery(fetchTags, [], {cache, initData: ['init']})
    );

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

  it('同参数重新挂载：新鲜期内命中缓存，不再发请求', async () => {
    const fn = vi.fn().mockResolvedValue(['v1']);
    const cache = createQueryCache<any, any>('fresh-remount');

    const first = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
    await waitFor(() => expect(first.result.current.data).toEqual(['v1']));
    first.unmount();

    const second = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
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

    const first = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[], staleTime})
    );
    await waitFor(() => expect(first.result.current.data).toEqual(['old']));
    expect(first.result.current.stale).toBe(false);
    first.unmount();

    await sleep(30); // 跨过 staleTime=20，远在 cacheTime(5min) 内

    const second = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[], staleTime})
    );
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

    const {result, rerender} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
    await waitFor(() => expect(result.current.data).toEqual(['v1']));

    const refetch = result.current.refetch;
    rerender();
    expect(result.current.refetch).toBe(refetch); // 重渲染不变

    await act(async () => {
      refetch();
    });
    await waitFor(() => expect(result.current.data).toEqual(['v2']));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('请求失败：错误进入 error 状态，loading 复位', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const cache = createQueryCache<any, any>('error-state');

    const {result} = renderHook(() => useQuery(fn, [], {cache}));

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

    const {result} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );

    await waitFor(() => expect(result.current.error?.message).toBe('boom-1'));
    expect(result.current.failureCount).toBe(1);

    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.error?.message).toBe('boom-2'));
    expect(result.current.failureCount).toBe(2);

    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.data).toEqual(['ok']));
    expect(result.current.failureCount).toBe(0); // 成功即归零
    expect(result.current.error).toBeUndefined();
  });

  it('已有结果后的重拉：loading 保持 false，fetching 如实为 true', async () => {
    const pending = deferred<string[]>();
    const fn = vi.fn().mockResolvedValueOnce(['v1']).mockReturnValueOnce(pending.promise);
    const cache = createQueryCache<any, any>('background-fetching');

    const {result} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
    await waitFor(() => expect(result.current.data).toEqual(['v1']));
    expect(result.current.loading).toBe(false);

    await act(async () => {
      result.current.refetch(); // 同 invalidate 触发的重拉路径
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

    const {result} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );

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

    const {result} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
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
      result.current.refetch();
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

    const {result, rerender} = renderHook(
      ({key}: {key: string}) => useQuery(fn, [key], {cache, initData: [] as string[]}),
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

    // 0.8 形态：useCache 的 miss 走 provider.load——两个组件实例并发首载
    // 同参数，共享同一条 in-flight（fn 只执行一次），双方各自广播拿到
    // 一致数据；跨组件的数据复用由共享 cache 承担（下方重挂载验证）。
    const first = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
    const second = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );

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
    const third = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
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

    const {rerender} = renderHook(
      ({id}) => useQuery(fn, [id], {cache}),
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

    const first = renderHook(
      ({args}) => useQuery(fn, [args], {cache, initData: [] as string[]}),
      {initialProps: {args: {page: 1, tab: 'feed'}}}
    );
    await waitFor(() => expect(first.result.current.data).toEqual(['v1']));
    first.unmount();

    // 键序颠倒 + 全新对象字面量：stableHash 结构化归一为同一缓存 key
    // （JSON.stringify 会因键序产出两个 key 而重发）
    const second = renderHook(
      ({args}) => useQuery(fn, [args], {cache, initData: [] as string[]}),
      {initialProps: {args: {tab: 'feed', page: 1}}}
    );
    await waitFor(() => expect(second.result.current.data).toEqual(['v1']));
    expect(fn).toHaveBeenCalledTimes(1); // 缓存命中，未重发
    second.unmount();
  });

  // select 选项：透传 useResultSelect，data 变为投影切片；initData 语义
  // 是「select 之前的原始数据」——注入 init 槽后同样经投影返回
  it('select：data 为投影切片，initData 以原始数据注入经投影返回', async () => {
    const pending = deferred<{articlesCount: number; title: string}>();
    const fn = () => pending.promise;
    const cache = createQueryCache<any, any>('select-slice');

    const {result} = renderHook(() =>
      useQuery(fn, [], {
        cache,
        select: (r) => r.articlesCount,
        initData: {articlesCount: 0, title: 'init'}
      })
    );

    // 首帧：initData 投影后的切片，而非整个原始对象
    expect(result.current.data).toBe(0);

    await act(async () => {
      pending.resolve({articlesCount: 5, title: 'v1'});
    });

    expect(result.current.data).toBe(5);
  });

  // 订阅粒度：useResultSelect 按「结果 + select」身份 memo——原始结果换
  // 新但切片不变时（Object.is），订阅组件不重渲染。用 memo 子组件承接
  // 切片做 render count spy：父组件因 loading 态等无关 store 仍会重渲染，
  // memo 屏蔽后子组件只在切片真正变化时渲染。select 用每渲染新建的内联
  // 箭头（项目不强制 useCallback）：useQuery 内部锁定首个身份，不影响 memo。
  it('select：切片变化才重渲染，未变切片不触发（memo 子组件 render count）', async () => {
    const p1 = deferred<{articlesCount: number; title: string}>();
    const p2 = deferred<{articlesCount: number; title: string}>();
    const p3 = deferred<{articlesCount: number; title: string}>();
    const fn = vi
      .fn()
      .mockReturnValueOnce(p1.promise)
      .mockReturnValueOnce(p2.promise)
      .mockReturnValueOnce(p3.promise);
    const cache = createQueryCache<any, any>('select-rerender');

    let childRenders = 0;
    const Slice = memo(({count}: {count: number}) => {
      childRenders++;
      return createElement('span', {'data-testid': 'slice'}, count);
    });

    function Page({id}: {id: string}) {
      const {data} = useQuery(fn, [id], {
        cache,
        select: (r) => r.articlesCount,
        initData: {articlesCount: 0, title: 'init'}
      });
      // 本文件是 .ts（无 JSX）：createElement 等价表达
      return createElement(Slice, {count: data!});
    }

    const {rerender} = render(createElement(Page, {id: 'a'}));
    expect(screen.getByTestId('slice').textContent).toBe('0'); // initData 投影
    childRenders = 0; // 首帧渲染不计入

    // 首个结果：切片 0 → 3 变化，子组件渲染一次
    await act(async () => {
      p1.resolve({articlesCount: 3, title: 'v1'});
    });
    expect(screen.getByTestId('slice').textContent).toBe('3');
    expect(childRenders).toBe(1);
    childRenders = 0;

    // args 变化重跑：新结果 title 变了但 articlesCount 仍为 3——父组件
    // 随 loading 态重渲染，切片未变的 memo 子组件不渲染
    rerender(createElement(Page, {id: 'b'}));
    await act(async () => {
      p2.resolve({articlesCount: 3, title: 'v2'});
    });
    expect(screen.getByTestId('slice').textContent).toBe('3');
    expect(childRenders).toBe(0);

    // 切片真正变化（3 → 9）：子组件渲染
    rerender(createElement(Page, {id: 'c'}));
    await act(async () => {
      p3.resolve({articlesCount: 9, title: 'v3'});
    });
    expect(screen.getByTestId('slice').textContent).toBe('9');
    expect(childRenders).toBe(1);
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

    const {result} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[], staleTime: 20})
    );
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

    const {result} = renderHook(() =>
      // staleTime 给宽（waitFor 的轮询本身要耗 ~10ms/次，20ms 会把
      // dispatch 拖出新鲜窗口——这里只验新鲜语义，不卡毫秒）
      useQuery(fn, [], {cache, initData: [] as string[], staleTime: 1000})
    );
    await waitFor(() => expect(result.current.data).toEqual(['v1']));

    await act(async () => {
      window.dispatchEvent(new Event('online')); // 仍在 staleTime 内
    });
    expect(fn).toHaveBeenCalledTimes(1); // 新鲜条目零请求
  });

  it('断网恢复：卸载后 online 事件不再触发重拉（监听已清理）', async () => {
    const fn = vi.fn().mockResolvedValue(['v1']);
    const cache = createQueryCache<any, any>('online-unmounted');

    const {unmount} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[], staleTime: 20})
    );
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
    // useQuery 调用点的既有约定：cache 用 <any, any>（QueryKey<F> 对
    // 零参 fn 推导出 unknown[]，强类型 K=[] 反而逆变不兼容）
    const cache = createQueryCache<any, any>('crosstab', 60_000, {
      persist: KEY
    });

    const {result} = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
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
    // 用旧会话留在内存里的镜像（与冷启动「不得 hydrate 回上个账号数
    // 据」同一语义的会话内对偶）
    window.dispatchEvent(
      new StorageEvent('storage', {key: KEY, newValue: null, storageArea: localStorage})
    );
    expect(cache.peek!([])).toBeUndefined();

    localStorage.removeItem(KEY);
  });
});
