// 来源：第 3 批评审任务——useQuery（项目级数据获取 preset）的组合行为验证：
// loading→data、缓存复用、stale 标记、refetch 与 error。util 下已有测试文件
// 主题各异（http/faker），不便追加，故新建本文件。
import {describe, it, expect, vi} from 'vitest';
import {renderHook, act, waitFor} from '@testing-library/react';

// useQuery 经 DevTool.useMock 支持 mock 配置，而 DevTool 顶层引用了 haze-ui；
// haze-ui 依赖 UMD 版 babel-runtime-jsx-plus，在 vitest 的 ESM 环境下无法
// 提供命名导出（与 Article 视图测试失败同因），这里整体 mock 掉。
vi.mock('haze-ui', () => ({
  Button: () => null,
  Card: () => null,
  useControl: () => [undefined, () => undefined]
}));

import {createQueryCache, useQuery} from './useQuery';

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
    const cache = createQueryCache();

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
    const cache = createQueryCache();

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
    const cache = createQueryCache();
    const staleTime = 20;

    const first = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[], staleTime})
    );
    await waitFor(() => expect(first.result.current.data).toEqual(['old']));
    expect(first.result.current.stale).toBe(false);
    first.unmount();

    await sleep(30); // 跨过 staleTime=20，仍在 cacheTime 内

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
    const cache = createQueryCache();

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
    const cache = createQueryCache();

    const {result} = renderHook(() => useQuery(fn, [], {cache}));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).toBe('boom');
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('已有结果后的重拉：loading 保持 false，fetching 如实为 true', async () => {
    const pending = deferred<string[]>();
    const fn = vi.fn().mockResolvedValueOnce(['v1']).mockReturnValueOnce(pending.promise);
    const cache = createQueryCache();

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
    const cache = createQueryCache();

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

  it('并发去重：同 fn 同 args 同时挂载，底层 fn 只执行一次', async () => {
    const pending = deferred<string[]>();
    const fn = vi.fn().mockReturnValue(pending.promise);
    const cache = createQueryCache();

    const first = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );
    const second = renderHook(() =>
      useQuery(fn, [], {cache, initData: [] as string[]})
    );

    // 两者都处于 in-flight，但共享同一次底层调用
    expect(first.result.current.loading).toBe(true);
    expect(second.result.current.loading).toBe(true);

    await act(async () => {
      pending.resolve(['shared']);
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(first.result.current.data).toEqual(['shared']);
    expect(second.result.current.data).toEqual(['shared']);
    first.unmount();
    second.unmount();
  });

  it('signal：args 变化触发重跑时，上一次调用收到的 signal 变 aborted', async () => {
    const calls: {id: string; signal?: AbortSignal}[] = [];
    const fn = vi.fn((id: string, signal?: AbortSignal) => {
      calls.push({id, signal});
      return Promise.resolve([id]);
    });
    const cache = createQueryCache();

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
    const fn = vi.fn(() => Promise.resolve(['v1']));
    const cache = createQueryCache();

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
});
