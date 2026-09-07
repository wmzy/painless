// 双通道共享缓存：loader 与场景 hook 共用每实体 cache（不抽包，decisions.md #13 补记）。
// 条目按 lastUsedAt 逐条计龄回收（react-toolroom per-entry）；viewStack 管跑不跑 loader，cache 管发不发请求。
import type {CacheProvider} from 'react-toolroom/async';

import {refresh} from '@native-router/core';

// 两通道共用 staleTime 缺省（单一来源）。
export const DEFAULT_STALE_TIME = 2000;
// 吞掉后台重验证拒绝（显式返回值规避 no-empty-function）
const noop = () => undefined;

export type LoaderCtx = {
  search?: unknown;
  params?: unknown;
  router?: unknown;
  signal?: AbortSignal;
};

// 订阅记录最近使用的 router；set 事件微任务去抖后 refresh。
// 判据「settled 值引用变化」：失败 settle 也发 set，需 diff 过滤；delete/clear 不订阅（decisions.md #13 补记）。
const bindings = new WeakMap<
  CacheProvider<unknown, unknown[]>,
  {
    router: unknown;
    scheduled: boolean;
    seen: Map<string, unknown>;
    warned?: boolean;
  }
>();

function snapshotValues(cache: CacheProvider<unknown, unknown[]>) {
  return new Map((cache.snapshot?.() ?? []).map((e) => [e.key, e.value]));
}

// 显式重绑：整体重置 seen 为调用时刻快照基线（decisions.md #13 补记）。
export function bindCacheRefresh<T, K extends unknown[]>(
  cache: CacheProvider<T, K>,
  router: unknown
) {
  const wide = cache as unknown as CacheProvider<unknown, unknown[]>;
  bindRefresh(wide, router);
  bindings.set(wide, {router, scheduled: false, seen: snapshotValues(wide)});
}

// clear/delete 发同形事件不可判，整实体 clear 显式归零 seen（decisions.md #13 补记）。
export function resetRefreshSeen<T, K extends unknown[]>(
  cache: CacheProvider<T, K>
) {
  const binding = bindings.get(
    cache as unknown as CacheProvider<unknown, unknown[]>
  );
  if (binding) binding.seen = new Map();
}

function bindRefresh(cache: CacheProvider<unknown, unknown[]>, router: unknown) {
  let binding = bindings.get(cache);
  if (binding) {
    // DEV 告警（每 cache 一次）：多 router 共用时 refresh 目标静默切换（decisions.md #21）。
    if (
      import.meta.env.DEV &&
      binding.router !== router &&
      !binding.warned
    ) {
      binding.warned = true;
      console.warn(
        '[loaderCache] 同一 cache 被多个 router 使用：refresh 目标已切到最后使用它的 router（微前端/多 Router/并发测试场景）——若非有意共享，请检查 cache 与 router 的对应关系。本 cache 仅告警一次'
      );
    }
    binding.router = router;
    return;
  }
  binding = {router, scheduled: false, seen: snapshotValues(cache)};
  bindings.set(cache, binding);
  cache.subscribe?.((e) => {
    const cur = bindings.get(cache);
    if (!cur) return;
    // 判据「已见 key 换了值」：miss/in-flight/失败 settle 都不 refresh。
    const next = snapshotValues(cache);
    let changed = false;
    if (e.type === 'set') {
      for (const [k, v] of next) {
        if (cur.seen.has(k) && cur.seen.get(k) !== v) {
          changed = true;
          break;
        }
      }
    }
    // seen 合并写入（保留最后所见值）；clear 代际归零在 resetRefreshSeen（#13 补记）。
    for (const [k, v] of next) cur.seen.set(k, v);
    if (!changed || !cur.router || cur.scheduled) return;
    cur.scheduled = true;
    queueMicrotask(() => {
      cur.scheduled = false;
      // Promise.resolve 兼容返回 void 的测试替身。
      void Promise.resolve(
        refresh(cur.router as Parameters<typeof refresh>[0])
      ).catch(noop);
    });
  });
}

// never 参数位收任意单参异步函数（不含 any）。
type LoaderValue<F extends (ctx: never) => Promise<any>> = Awaited<ReturnType<F>>;

// SWR：stale 旧值先行 + 后台重验证（load 共享 in-flight，失败保旧）；maxAge 超龄按 miss；失败上抛 errorComponent。
// keyOf 是 key 定义唯一处。
export function withCache<
  T,
  K extends unknown[],
  C extends LoaderCtx = LoaderCtx,
  F extends (ctx: C) => Promise<any> = never
>(
  cache: CacheProvider<T, K>,
  // 返回收 unknown[]：K 以 cache 为契约源，key 运行时经 hash 归一。
  keyOf: (ctx: C) => unknown[],
  fn: F,
  opts?: {staleTime?: number; maxAge?: number}
): F {
  const staleTime = opts?.staleTime ?? DEFAULT_STALE_TIME;
  // maxAge 超龄按 miss，堵「重验证持续失败旧值无限端出」（decisions.md #13 补记）。
  const maxAge = opts?.maxAge;
  // peek/load 契约可选但 createQueryCache 恒创建为必有；缺失早抛（decisions.md #13 补记）。
  const peek = cache.peek?.bind(cache);
  const load = cache.load?.bind(cache);
  if (!peek || !load) {
    throw new Error(
      '[withCache] cache 缺少 peek/load 成员——须经 createQueryCache（createMemoryCacheProvider）创建'
    );
  }
  return (async (ctx: C) => {
    if (ctx.router !== undefined) {
    bindRefresh(cache as unknown as CacheProvider<unknown, unknown[]>, ctx.router);
  }
    const args = keyOf(ctx) as K;
    const entry = peek(args);
    if (entry) {
      const age = Date.now() - entry.cachedAt;
      if (age < staleTime) {
        return entry.value as LoaderValue<F>;
      }
      if (maxAge !== undefined && age > maxAge) {
        return load(args, () => fn(ctx)) as Promise<LoaderValue<F>>;
      }
      void load(args, () => fn(ctx)).catch(noop);
      return entry.value as LoaderValue<F>;
    }
    return load(args, () => fn(ctx)) as Promise<LoaderValue<F>>;
  }) as F;
}
