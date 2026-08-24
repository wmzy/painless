// 双通道共享缓存：路由 loader 与 useQuery 共用同一模块级 queryCache。
// 两个通道的触发时机与阻塞语义不同——loader 在导航 resolve 期运行（可
// 阻塞视图切换，pendingComponent 兜底），useQuery 在组件挂载后运行
// （非阻塞，loading/error 状态化）——但缓存与失效是同一份：loader 侧
// withCache 按 [...prefix, search ?? params ?? {}] 寻址，视图侧用
// homeCacheArgs / articleCacheArgs 生成同形 key（保证 stableHash 一致），
// 于是「loader 拉过的数据 useQuery 直接命中、mutation 写穿的值 loader
// 新鲜命中」。
// 分层职责：viewStack 管「要不要跑 loader」（POP 命中快照零请求、
// invalidate 后重解析），cache 管「跑了 loader 发不发请求」（新鲜命中
// 零请求 / stale 旧值先行后台重验证 / miss 骨架）。
import {refresh} from '@native-router/core';

import {queryCache} from './useQuery';

const DEFAULT_STALE_TIME = 2000;
// 显式带返回值，规避 no-empty-function；语义即吞掉后台重验证的拒绝
const noop = () => undefined;

// loader 返回值的静态类型（缓存里存的就是它）
type LoaderValue<F extends (ctx: any) => Promise<any>> = Awaited<ReturnType<F>>;

// 把路由 loader 接入共享 queryCache（SWR 语义）：
// - 新鲜命中（now - cachedAt < staleTime）：直接返回缓存值，不发请求；
// - stale 命中：立即返回旧值（视图不等待、不闪骨架），后台经 load 重
//   验证（原子 get-or-insert：与并发 useQuery / PrefetchLink 预取共享
//   同一 in-flight promise，factory 只执行一次；期间任何 set/delete 会
//   bump 代次，晚到的响应不回写覆盖），成功后 refresh(router) 把新值
//   回写进当前视图；失败/被取消则静默保旧——refresh 挂在成功之后，
//   视图不闪错误态；
// - miss：返回 load 的 promise，pendingComponent 骨架照旧，失败原样
//   上抛给路由 errorComponent。
export function withCache<F extends (ctx: any) => Promise<any>>(
  fn: F,
  prefix: unknown[],
  opts?: {staleTime?: number}
): F {
  const staleTime = opts?.staleTime ?? DEFAULT_STALE_TIME;
  return (async (ctx: any) => {
    // 只取这三个成员并立即收窄为 unknown：ctx 整体是 any（native-router
    // 的 loader ctx 类型按路由异构），成员访问走显式断言路径
    const {search, params, router} = ctx as {
      search?: unknown;
      params?: unknown;
      router?: unknown;
    };
    const args = [...prefix, search ?? params ?? {}];
    // load/peek 在 CacheProvider 契约里是可选成员，但模块级 queryCache
    // 恒由 createMemoryCacheProvider 创建，二者必然存在
    const entry = queryCache.peek!(args);
    if (entry) {
      if (Date.now() - entry.cachedAt < staleTime) {
        return entry.value as LoaderValue<F>;
      }
      void queryCache
        .load!(args, () => fn(ctx))
        .then(() => refresh(router as Parameters<typeof refresh>[0]))
        .catch(noop);
      return entry.value as LoaderValue<F>;
    }
    return queryCache.load!(args, () => fn(ctx)) as Promise<LoaderValue<F>>;
  }) as F;
}

// ---- 视图侧 key 构造（与上方 loader 寻址同形）----------------------------

// Home 页缓存的载荷必须与 homeSearchSchema 的输出形状完全一致：tag 缺省
// 时键不存在——stableHash 会把 {tag: undefined} 与 {} 视为不同 key，
// loader（schema 输出无 tag 键）与视图补丁就会擦肩而过。
export function homeCacheArgs(search: {
  tag?: string;
  offset: number;
  limit: number;
}) {
  const {tag, ...rest} = search;
  return ['home', tag != null && tag !== '' ? {tag, ...rest} : rest];
}

export function articleCacheArgs(title: string) {
  return ['article', {title}];
}
