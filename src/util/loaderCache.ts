// 双通道共享缓存：路由 loader 与 useQuery 共用每实体 cache。
// 两个通道的触发时机与阻塞语义不同——loader 在导航 resolve 期运行（可
// 阻塞视图切换，pendingComponent 兜底），useQuery 在组件挂载后运行
// （非阻塞，loading/error 状态化）——但缓存与失效是同一份：loader 侧
// withCache(cache, keyOf, fn) 按 keyOf(ctx) 寻址，视图侧 mutation 写穿
// 同一 cache，于是「loader 拉过的数据 useQuery 直接命中、mutation 写穿
// 的值 loader 新鲜命中」。
// 分层职责：viewStack 管「要不要跑 loader」（POP 命中快照零请求、
// invalidate 后重解析），cache 管「跑了 loader 发不发请求」（新鲜命中
// 零请求 / stale 旧值先行后台重验证 / miss 骨架）。
//
// refresh 自动化（bindRefresh）：cache 的 set 事件（mutation 写穿/回滚、
// patchWhere 批量补丁、load 后台重验证 settle）自动 refresh 最近使用
// 该 cache 的 router——视图代码不再手调 refresh(router) 扇出。同一微任务
// 内多次 set 合并为一次 refresh；delete/clear 不订阅（登出清场走
// Layout 的 invalidate + navigate，DevTool Clear 自带 refresh）。收敛性：
// refresh 重跑 loader → withCache 新鲜命中（只读不写）→ 链条终止。
import type {CacheProvider} from 'react-toolroom/async';

import {refresh} from '@native-router/core';

const DEFAULT_STALE_TIME = 2000;
// 显式带返回值，规避 no-empty-function；语义即吞掉后台重验证的拒绝
const noop = () => undefined;

type LoaderCtx = {
  search?: unknown;
  params?: unknown;
  router?: unknown;
  signal?: AbortSignal;
};

// 每个 cache 一份订阅：记录最近使用它的 router（多路由/测试场景下取
// 最后一个），set 事件微任务去抖后 refresh。refresh 的触发条件是
// 「settled 值引用发生变化」——set 事件本身分不清 in-flight 注册与
// 成败 settle（失败 settle 也发 set，provider 靠它刷新 pending 态），
// 靠前后快照 diff 才能只回写真正的数据变化（写穿/回滚/patch/成功
// settle）。这同时是结构共享的等价物：重验证结果引用不变则不
// refresh，视图零重渲染。delete/clear 不订阅（登出清场走 Layout 的
// invalidate + navigate，DevTool Clear 自带 refresh）。
const bindings = new WeakMap<
  CacheProvider<unknown, unknown[]>,
  {router: unknown; scheduled: boolean; seen: Map<string, unknown>}
>();

function snapshotValues(cache: CacheProvider<unknown, unknown[]>) {
  return new Map((cache.snapshot?.() ?? []).map((e) => [e.key, e.value]));
}

// 导出供测试与非常规接入点使用：把「cache 写穿 → refresh(router)」订阅
// 显式建立（withCache 首跑时内部调用同一函数）
export function bindCacheRefresh<T, K extends unknown[]>(
  cache: CacheProvider<T, K>,
  router: unknown
) {
  bindRefresh(cache as unknown as CacheProvider<unknown, unknown[]>, router);
}

function bindRefresh(cache: CacheProvider<unknown, unknown[]>, router: unknown) {
  let binding = bindings.get(cache);
  if (binding) {
    binding.router = router;
    return;
  }
  binding = {router, scheduled: false, seen: snapshotValues(cache)};
  bindings.set(cache, binding);
  cache.subscribe?.((e) => {
    const cur = bindings.get(cache);
    if (!cur) return;
    // 所有事件都同步 seen；refresh 的判据是「视图已见过的 key 换了值」：
    // 写穿/回滚/patchWhere/stale 重验证 settle 都命中；而 miss settle
    //（新 key——路由 resolution 本就携带该数据）、in-flight 注册（值未
    // 变）、失败 settle（旧值原地保留）都不产生 refresh
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
    cur.seen = next;
    if (!changed || !cur.router || cur.scheduled) return;
    cur.scheduled = true;
    queueMicrotask(() => {
      cur.scheduled = false;
      // refresh 不会因「数据没变」失败，但 router 可能已被测试销毁；
      // Promise.resolve 包裹兼容返回 void 的测试替身
      void Promise.resolve(
        refresh(cur.router as Parameters<typeof refresh>[0])
      ).catch(noop);
    });
  });
}

// loader 返回值的静态类型（缓存里存的就是它）
type LoaderValue<F extends (ctx: any) => Promise<any>> = Awaited<ReturnType<F>>;

// 把路由 loader 接入实体 cache（SWR 语义）：
// - 新鲜命中（now - cachedAt < staleTime）：直接返回缓存值，不发请求；
// - stale 命中：立即返回旧值（视图不等待、不闪骨架），后台经 load 重
//   验证（原子 get-or-insert：与并发 useQuery / PrefetchLink 预取共享
//   同一 in-flight promise，factory 只执行一次；期间任何 set/delete 会
//   bump 代次，晚到的响应不回写覆盖），settle 的 set 事件经 bindRefresh
//   自动回写当前视图；失败/被取消则静默保旧；
// - miss：返回 load 的 promise，pendingComponent 骨架照旧，失败原样
//   上抛给路由 errorComponent。
// keyOf：从 loader ctx 提取该实体的 key 元组——key 的定义只此一处，
// mutation 侧经 cache.mutation 寻址同一实体，视图不再手工拼 key。
export function withCache<
  T,
  K extends unknown[],
  F extends (ctx: any) => Promise<any>
>(
  cache: CacheProvider<T, K>,
  // 路由 loader ctx 按路由异构（search/params/signal/router 各异），
  // keyOf 收 any：调用方按本路由的实际形状解构。返回收 unknown[] 而非
  // K：keyOf 常是注解-free 的箭头（ctx.search 在字面量内是 any），返回
  // any[] 会与 cache 推导出的元组 K 冲突；K 的元组形状以 cache 为唯一
  // 契约源，key 的运行时形状经 load 的 hash 归一，错形状不产生错误条目
  keyOf: (ctx: any) => unknown[],
  fn: F,
  opts?: {staleTime?: number}
): F {
  const staleTime = opts?.staleTime ?? DEFAULT_STALE_TIME;
  return (async (ctx: LoaderCtx) => {
    if (ctx.router !== undefined) {
    // 泛型 CacheProvider<T, K> 对统一订阅表是逆变的（set 参数），经
    // unknown 收拢——运行时只是注册订阅，无任何成员调用
    bindRefresh(cache as unknown as CacheProvider<unknown, unknown[]>, ctx.router);
  }
    const args = keyOf(ctx) as K;
    // load/peek 在 CacheProvider 契约里是可选成员，但 createQueryCache
    // 恒由 createMemoryCacheProvider 创建，二者必然存在
    const entry = cache.peek!(args);
    if (entry) {
      if (Date.now() - entry.cachedAt < staleTime) {
        return entry.value as LoaderValue<F>;
      }
      void cache.load!(args, () => fn(ctx)).catch(noop);
      return entry.value as LoaderValue<F>;
    }
    return cache.load!(args, () => fn(ctx)) as Promise<LoaderValue<F>>;
  }) as F;
}
