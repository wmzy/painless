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
    // 盘上是 dehydrate 形状：hashed key → [value, cachedAt]，cachedAt 为
    // 写入毫秒时间戳—— staleness 计算的原材料
    const stored = JSON.parse(raw!);
    expect(stored[stableHash([])]).toEqual([
      ['tag-a', 'tag-b'],
      expect.any(Number)
    ]);
    const cachedAt = stored[stableHash([])][1] as number;

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
});
