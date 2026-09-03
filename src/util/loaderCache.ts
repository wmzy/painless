// 双通道共享缓存：路由 loader 与场景 query hook（createQueryHook 产物）
// 共用每实体 cache。【归宿已定】本胶水层（withCache/bindRefresh）评估后
// 不抽包、常驻模板（2026-09-01，理由与翻案条件见 docs/decisions.md
// 第 13 条补记）。
// 两个通道的触发时机与阻塞语义不同——loader 在导航 resolve 期运行（可
// 阻塞视图切换，pendingComponent 兜底），场景 hook 在组件挂载后运行
// （非阻塞，loading/error 状态化）——但缓存与失效是同一份：loader 侧
// withCache(cache, keyOf, fn) 按 keyOf(ctx) 寻址，视图侧 mutation 写穿
// 同一 cache，于是「loader 拉过的数据场景 hook 直接命中、mutation 写穿
// 的值 loader 新鲜命中」。
// 条目回收（react-toolroom ≥0.12 per-entry 语义）：cacheTime 按条目的
// lastUsedAt 逐条计龄——loader 直写（cache.load）的条目即使当时没有
// 场景 hook 消费者，闲置满窗口也会被回收（消费即 touch：hook 命中、
// loader 新鲜/重验证读取都刷新 lastUsedAt），回收后下一次导航按 miss
// 重新拉取，无泄漏也无「永不回收」的特例。
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

// 两条通道共用的 staleTime 缺省（withCache 与 createQueryHook 的
// opts.staleTime 缺省同值）：单一来源在此导出，useQuery（组装层）import
// 收敛——依赖方向组装层→机制层无环，两通道缺省不会各自漂移
export const DEFAULT_STALE_TIME = 2000;
// 显式带返回值，规避 no-empty-function；语义即吞掉后台重验证的拒绝
const noop = () => undefined;

// 导出供 dataLoader 工厂复用：loader 的公开类型（DataLoader<T>）以它为
// ctx 形状——各成员可选，容纳按路由异构的 search/params/signal/router
export type LoaderCtx = {
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
// refresh，视图零重渲染。delete/clear 事件本身不订阅（登出清场走
// Layout 的 invalidate + navigate，DevTool Clear 自带 refresh）；seen
// 对单键 delete 保留最后所见值（refetch 的 delete→set 新值仍算换值，
// 不静默失效），整实体 clear 开新代际——分家理由与劫杀在飞链的实测
// 见 resetRefreshSeen 注释与 decisions.md 第 13 条补记。
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

// 导出供测试与非常规接入点使用：把「cache 写穿 → refresh(router)」订阅
// 显式（重）建立。与 withCache 每次 loader 运行的常规重绑（只改 router
// 指向）不同，显式重绑定整体重置——seen 以调用时刻的缓存快照为基线：
// seen 跨 delete/clear 保留最后所见值是修订后的正经语义（decisions.md
// 第 13 条补记），测试每用例重建订阅需要干净基线时经本接缝显式重置。
export function bindCacheRefresh<T, K extends unknown[]>(
  cache: CacheProvider<T, K>,
  router: unknown
) {
  const wide = cache as unknown as CacheProvider<unknown, unknown[]>;
  bindRefresh(wide, router);
  bindings.set(wide, {router, scheduled: false, seen: snapshotValues(wide)});
}

// 整实体 clear 的 seen 代际重置（导出供 createQueryCache 的 clear 包装
// 调用）：provider 的 clear() 与单键 delete() 发同一形状的 delete 事件
//（都是 {type:'delete', deleted: [...]}，元组多寡不可判），两者的 seen
// 语义却必须分家——单键 delete 保留最后所见值（refetch 的 delete→set
// 新值要触发 refresh）；整实体 clear 开新代际按新 key 处理：清场
//（登出/DevTool Clear）常伴随导航，随后导航 loader 的 miss settle 写入
// 若被 seen 残留判成「已见 key 换值」，排出的 refresh 会劫杀这条在飞
// 导航链（supersede：URL 不落、视图停留原地——e2e 实测）。
export function resetRefreshSeen<T, K extends unknown[]>(
  cache: CacheProvider<T, K>
) {
  const binding = bindings.get(
    cache as unknown as CacheProvider<unknown, unknown[]>
  );
  // 只重置 seen：router 指向与在途去抖旗标原样（挂起的 refresh 微任务
  // 照常落定，幂等无害）
  if (binding) binding.seen = new Map();
}

function bindRefresh(cache: CacheProvider<unknown, unknown[]>, router: unknown) {
  let binding = bindings.get(cache);
  if (binding) {
    // DEV 覆盖告警（每 cache 一次）：绑定记录只存最后一个 router，后用
    // 者覆盖前者——微前端 / 同页多 Router / 并发测试场景下 refresh 目标
    // 会静默切换。单 router 应用的常态是同实例重复重绑（不告警），只
    // 在换上不同实例时提示一次；非 DEV 不为它付检查成本
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
    // seen 合并写入而非整体替换：key 保留最后所见值，单键 delete 不摘
    // key——后续同 key set 新值仍是「已见 key 换值」，refetch 的
    // delete→set 链不会静默失效（语义修订见 decisions.md 第 13 条补记；
    // 判据只遍历 next 里存在的 key，摘除与否对 delete 事件本身无影响，
    // 保留的旧值只用于之后 set 的 diff。整实体 clear 的代际归零在
    // resetRefreshSeen——provider 事件分不清单键 delete 与 clear）
    for (const [k, v] of next) cur.seen.set(k, v);
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

// loader 返回值的静态类型（缓存里存的就是它）。约束用 never 参数位收
// 「任意单参异步函数」——与宽泛签名兼容且不含 any
type LoaderValue<F extends (ctx: never) => Promise<any>> = Awaited<ReturnType<F>>;

// 把路由 loader 接入实体 cache（SWR 语义）：
// - 新鲜命中（now - cachedAt < staleTime）：直接返回缓存值，不发请求；
// - stale 命中：立即返回旧值（视图不等待、不闪骨架），后台经 load 重
//   验证（原子 get-or-insert：与并发场景 hook / PrefetchLink 预取共享
//   同一 in-flight promise，factory 只执行一次；期间任何 set/delete 会
//   bump 代次，晚到的响应不回写覆盖），settle 的 set 事件经 bindRefresh
//   自动回写当前视图；失败/被取消则静默保旧；
// - maxAge 硬过期（声明了 maxAge 且 now - cachedAt > maxAge）：按 miss
//   同路——走 load / pendingComponent，不再旧值先行（见 opts.maxAge 注释）；
// - miss：返回 load 的 promise，pendingComponent 骨架照旧，失败原样
//   上抛给路由 errorComponent。
// keyOf：从 loader ctx 提取该实体的 key 元组——key 的定义只此一处，
// mutation 侧经 cache.mutation 寻址同一实体，视图不再手工拼 key。
export function withCache<
  T,
  K extends unknown[],
  C extends LoaderCtx = LoaderCtx,
  F extends (ctx: C) => Promise<any> = never
>(
  cache: CacheProvider<T, K>,
  // 路由 loader ctx 按路由异构（search/params/signal/router 各异），
  // keyOf 按本路由的实际形状声明（C 从注解推断，须兼容 LoaderCtx 的
  // 宽松成员）。返回收 unknown[] 而非 K：K 的元组形状以 cache 为唯一
  // 契约源，key 的运行时形状经 load 的 hash 归一，错形状不产生错误条目
  keyOf: (ctx: C) => unknown[],
  fn: F,
  opts?: {staleTime?: number; maxAge?: number}
): F {
  const staleTime = opts?.staleTime ?? DEFAULT_STALE_TIME;
  // maxAge 硬过期（默认不启用）：条目 cachedAt 距今超过 maxAge 时按
  // miss 处理——走 load / pendingComponent，不再「旧值先行」。SWR 的
  // 旧值先行以「后台重验证最终会成功」为前提：重验证持续失败（数据
  // 形态已变、权限已收、端点已废）时旧值会被无限端出来且无感知；
  // maxAge 给 loader 通道一个可声明的年龄上限，超龄宁可闪一次骨架
  const maxAge = opts?.maxAge;
  // load/peek 在 CacheProvider 契约里是可选成员，但 createQueryCache 恒由
  // createMemoryCacheProvider 创建——bind 一次收窄为必有（this 绑定同源，
  // 不经解构丢宿主），缺失即早抛：错配的 provider 在挂载点就指向配置
  // 错误，而非首个请求处一句 TypeError
  const peek = cache.peek?.bind(cache);
  const load = cache.load?.bind(cache);
  if (!peek || !load) {
    throw new Error(
      '[withCache] cache 缺少 peek/load 成员——须经 createQueryCache（createMemoryCacheProvider）创建'
    );
  }
  return (async (ctx: C) => {
    if (ctx.router !== undefined) {
    // 泛型 CacheProvider<T, K> 对统一订阅表是逆变的（set 参数），经
    // unknown 收拢——运行时只是注册订阅，无任何成员调用
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
        // 硬过期按 miss 同路：load / pendingComponent 骨架，失败原样
        // 上抛（旧值不再先行展示）
        return load(args, () => fn(ctx)) as Promise<LoaderValue<F>>;
      }
      void load(args, () => fn(ctx)).catch(noop);
      return entry.value as LoaderValue<F>;
    }
    return load(args, () => fn(ctx)) as Promise<LoaderValue<F>>;
  }) as F;
}
