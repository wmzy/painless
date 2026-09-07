// 路由 data 收敛工厂：withCache → mock → 路由 data 三层 + 视图取数 + 组件通道入口一次声明
//（三元组 [loader, useData, queryFn]）。RouteDataOf 不接、声明身份校验、不抽包 → decisions.md #8/#13/#15。
import {useData as useRouteData, useMatched} from '@native-router/react';

import {withCache, type LoaderCtx} from './loaderCache';
import {mockViewData} from './mock';
import {bindQueryFn, type EntityCache, type QueryFn} from './useQuery';

// 公开 loader 类型保持宽松 LoaderCtx：createRoutes 的宽松 Route 成员不接受窄 ctx
//（实测 1.13），精确形状只在工厂内部 Ctx 泛型里（decisions.md #13 补记）。
export type DataLoader<T> = (ctx: LoaderCtx) => Promise<T>;

// 无参 → T（路由声明了 loader，进组件前必已 resolve）；{optional: true} → T | undefined
//（共用组件可能不挂 data，如 /editor 新建态）。
export type UseData<T> = {
  (opts?: {optional?: false}): T;
  (opts: {optional: true}): T | undefined;
};

// Ctx 让 keyOf 的精确形状流进工厂内部接线（decisions.md #13 补记）。
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function createDataLoader<T, K extends unknown[], Ctx extends LoaderCtx = LoaderCtx>(
  spec: {
    // 与 queryFn 同形：尾参可选 signal（useRun 与路由 ctx.signal 都经此透传）
    fetch: (...args: [...K, signal?: AbortSignal]) => Promise<T>;
    // K 的契约源是 cache 的 key 元组形状
    cache: EntityCache<T, K>;
    // key 定义只此一处；ctx 按本路由实际形状注解（路由段保证必有值），Ctx 让精确形状
    // 流进工厂接线（keyOf 返回对 K / fetch 参数元组编译期检查）
    keyOf: (ctx: Ctx) => K;
    staleTime?: number;
    mock?: {schema: unknown; key: string};
  }
): [DataLoader<T>, UseData<T>, QueryFn<T, K>] {
  const {fetch, cache, keyOf, staleTime, mock} = spec;

  // 内→外：withCache → mockViewData（mock 最外层：faker 造数不进缓存，decisions.md #12）
  const cached = withCache(
    cache,
    keyOf,
    (ctx: Ctx) => fetch(...keyOf(ctx), ctx.signal),
    staleTime !== undefined ? {staleTime} : undefined
  );
  // cached 的精确 Ctx 在返回处一次断言收拢为宽松 DataLoader<T>（运行时形状由路由保证）
  const loader: DataLoader<T> = (mock
    ? mockViewData(cached, mock.schema, mock.key)
    : cached) as DataLoader<T>;

  // DEV 声明身份校验（route.data === loader，论证见 decisions.md #8）：useMatched
  // 无条件调用（hooks 规则），校验块包 import.meta.env.DEV 折叠摇树。
  const useDataHook = (opts?: {optional?: boolean}): T | undefined => {
    const value = useRouteData<T>();
    const matched = useMatched();
    if (import.meta.env.DEV) {
      // 路由外渲染（无 Provider）时 matched 运行时 undefined——收宽后 optional chain 兜住
      const declared: unknown = (matched as ReturnType<typeof useMatched> | undefined)
        ?.matched[matched.index]?.route.data;
      const ok =
        declared === loader ||
        (opts?.optional === true && declared === undefined);
      if (!ok) {
        throw new Error(
          '[createDataLoader] useXxxData 与路由 data 声明不匹配（route.data !== 创建它的 loader）。' +
            '两种常见原因：' +
            '① 复制视图后忘换 loader——本组件沿用了别的路由的取数 hook，或路由表 data 挂的还是别的 loader；' +
            '② 把 loader 再包了一层箭头——data: (ctx) => xxxLoader(ctx) 会创建新函数、身份失配，直接写 data: xxxLoader。' +
            '若本路由确实可能不挂 data（共用组件的新建态），用 {optional: true} 调用。'
        );
      }
    }
    return value;
  };

  // 组件通道入口：fetch × cache 绑定；场景 hook 组装在 dataloaders.ts（decisions.md #2）
  const queryFn = bindQueryFn(fetch, cache);

  // T | undefined → UseData<T>（optional 重载语义收窄）需断言收拢
  return [loader, useDataHook as UseData<T>, queryFn];
}
