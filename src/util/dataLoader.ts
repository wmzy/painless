// 路由 data 收敛工厂：RouteDataOf 不接、声明身份校验、不抽包（decisions.md #8/#13/#15）。
import {useData as useRouteData, useMatched} from '@native-router/react';

import {withCache, type LoaderCtx} from './loaderCache';
import {mockViewData} from './mock';
import {bindQueryFn, type EntityCache, type QueryFn} from './useQuery';

// 宽松 LoaderCtx：createRoutes 的 Route 成员不接受窄 ctx（1.13 实测，decisions.md #13 补记）。
type DataLoader<T> = (ctx: LoaderCtx) => Promise<T>;

type UseData<T> = {
  (opts?: {optional?: false}): T;
  (opts: {optional: true}): T | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function createDataLoader<T, K extends unknown[], Ctx extends LoaderCtx = LoaderCtx>(
  spec: {
    fetch: (...args: [...K, signal?: AbortSignal]) => Promise<T>;
    cache: EntityCache<T, K>;
    // key 定义只此一处（keyOf 返回对 K / fetch 参数元组编译期检查）。
    keyOf: (ctx: Ctx) => K;
    staleTime?: number;
    mock?: {schema: unknown; key: string};
  }
): [DataLoader<T>, UseData<T>, QueryFn<T, K>] {
  const {fetch, cache, keyOf, staleTime, mock} = spec;

  // mock 最外层：faker 造数不进缓存（decisions.md #12）。
  const cached = withCache(
    cache,
    keyOf,
    (ctx: Ctx) => fetch(...keyOf(ctx), ctx.signal),
    staleTime !== undefined ? {staleTime} : undefined
  );
  const loader: DataLoader<T> = (mock
    ? mockViewData(cached, mock.schema, mock.key)
    : cached) as DataLoader<T>;

  // DEV 身份校验 route.data === loader（decisions.md #8）；useMatched 无条件调用（hooks 规则）。
  const useDataHook = (opts?: {optional?: boolean}): T | undefined => {
    const value = useRouteData<T>();
    const matched = useMatched();
    if (import.meta.env.DEV) {
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

  const queryFn = bindQueryFn(fetch, cache);

  return [loader, useDataHook as UseData<T>, queryFn];
}
