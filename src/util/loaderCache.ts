// 双通道共享缓存：路由 loader 与场景 hook 共用每实体 cache。
// 【归宿已定】不抽包、常驻模板（docs/decisions.md #13 补记）。
// 两通道触发时机不同（loader 阻塞导航 / hook 挂载后），但缓存与失效同一份：
// withCache 按 keyOf 寻址，mutation 写穿同一 cache，命中互相可见。
// 条目回收按 lastUsedAt 逐条计龄（react-toolroom per-entry），闲置满窗口回收后按 miss 重拉。
// 分层：viewStack 管「跑不跑 loader」（POP 快照/invalidate），cache 管「跑 loader 发不发请求」。
// bindRefresh：set 事件（写穿/回滚/patch/重验证 settle）微任务去抖后 refresh 最近使用该 cache 的
// router；delete/clear 不订阅；refresh 重跑 loader 新鲜命中只读不写，链终止。
import type {CacheProvider} from 'react-toolroom/async';

import {refresh} from '@native-router/core';

// 两通道共用 staleTime 缺省（单一来源，useQuery import 收敛，不各自漂移）。
export const DEFAULT_STALE_TIME = 2000;
// 吞掉后台重验证拒绝（显式返回值规避 no-empty-function）
const noop = () => undefined;

// loader 公开类型（DataLoader<T>）的 ctx 形状：各成员可选，容纳按路由异构的字段。
export type LoaderCtx = {
  search?: unknown;
  params?: unknown;
  router?: unknown;
  signal?: AbortSignal;
};

// 每 cache 一份订阅：记录最近使用它的 router，set 事件微任务去抖后 refresh。
// 触发条件是「settled 值引用变化」（快照 diff——失败 settle 也发 set，需 diff 过滤）；
// delete/clear 不订阅。seen 单键 delete 保留最后所见值、整实体 clear 开新代际（decisions.md #13 补记）。
const bindings = new WeakMap<
  CacheProvider<unknown, unknown[]>,
  {
    router: unknown;
    scheduled: boolean;
    seen: Map<string, unknown>;
    /** 多 router 覆盖的 DEV 告警只发一次（见 bindRefresh） */
    warned?: boolean;
  }
>();

function snapshotValues(cache: CacheProvider<unknown, unknown[]>) {
  return new Map((cache.snapshot?.() ?? []).map((e) => [e.key, e.value]));
}

// 测试/非常规接入点：显式（重）建立订阅。与 withCache 常规重绑（只改 router）不同，
// 整体重置 seen 为调用时刻快照基线（decisions.md #13 补记）。
export function bindCacheRefresh<T, K extends unknown[]>(
  cache: CacheProvider<T, K>,
  router: unknown
) {
  const wide = cache as unknown as CacheProvider<unknown, unknown[]>;
  bindRefresh(wide, router);
  bindings.set(wide, {router, scheduled: false, seen: snapshotValues(wide)});
}

// 整实体 clear 的 seen 代际重置（createQueryCache 的 clear 包装调用）：
// clear/delete 发同形 delete 事件不可判，seen 语义分家（decisions.md #13 补记；e2e 劫杀实测）。
export function resetRefreshSeen<T, K extends unknown[]>(
  cache: CacheProvider<T, K>
) {
  const binding = bindings.get(
    cache as unknown as CacheProvider<unknown, unknown[]>
  );
  // 只重置 seen：router 指向与在途去抖旗标原样（挂起的 refresh 幂等无害）
  if (binding) binding.seen = new Map();
}

function bindRefresh(cache: CacheProvider<unknown, unknown[]>, router: unknown) {
  let binding = bindings.get(cache);
  if (binding) {
    // DEV 覆盖告警（每 cache 一次）：多 router 用同一 cache 时 refresh 目标静默切换（decisions.md #21）
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
    // 所有事件同步 seen；判据「已见 key 换了值」：miss settle（新 key）、
    // in-flight 注册、失败 settle（旧值原地）都不 refresh。
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
    // seen 合并写入（保留最后所见值），refetch 的 delete→set 不静默失效；整实体 clear 代际归零在 resetRefreshSeen（#13 补记）
    for (const [k, v] of next) cur.seen.set(k, v);
    if (!changed || !cur.router || cur.scheduled) return;
    cur.scheduled = true;
    queueMicrotask(() => {
      cur.scheduled = false;
      // Promise.resolve 包裹兼容返回 void 的测试替身
      void Promise.resolve(
        refresh(cur.router as Parameters<typeof refresh>[0])
      ).catch(noop);
    });
  });
}

// 缓存存的就是 loader 返回值；never 参数位收任意单参异步函数（不含 any）。
type LoaderValue<F extends (ctx: never) => Promise<any>> = Awaited<ReturnType<F>>;

// loader 接入实体 cache 的 SWR 语义：新鲜直返零请求；stale 旧值先行 + 后台 load 重验证
//（get-or-insert 共享 in-flight，失败保旧）；maxAge 超龄按 miss（走骨架，不旧值先行）；
// miss 返回 load，失败上抛 errorComponent。keyOf 是 key 定义唯一处。
export function withCache<
  T,
  K extends unknown[],
  C extends LoaderCtx = LoaderCtx,
  F extends (ctx: C) => Promise<any> = never
>(
  cache: CacheProvider<T, K>,
  // keyOf 按本路由实际形状声明（C 从注解推断）；返回收 unknown[] 而非 K——
  // K 以 cache 为契约源，key 运行时经 hash 归一。
  keyOf: (ctx: C) => unknown[],
  fn: F,
  opts?: {staleTime?: number; maxAge?: number}
): F {
  const staleTime = opts?.staleTime ?? DEFAULT_STALE_TIME;
  // maxAge 硬过期（默认不启用）：超龄按 miss，不再旧值先行——堵「重验证持续失败
  // 旧值无限端出」的缺口（decisions.md #13 补记）。
  const maxAge = opts?.maxAge;
  // peek/load 契约可选但 createQueryCache 恒由 createMemoryCacheProvider 创建：
  // bind 一次收窄为必有，缺失早抛（decisions.md #13 补记）。
  const peek = cache.peek?.bind(cache);
  const load = cache.load?.bind(cache);
  if (!peek || !load) {
    throw new Error(
      '[withCache] cache 缺少 peek/load 成员——须经 createQueryCache（createMemoryCacheProvider）创建'
    );
  }
  return (async (ctx: C) => {
    if (ctx.router !== undefined) {
    // 泛型对订阅表逆变，经 unknown 收拢——运行时仅注册订阅
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
