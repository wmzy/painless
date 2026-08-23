// 项目级数据获取 preset（模板示范：每个项目可按自身理念定制这一层）。
// 把 react-toolroom/async 的 useInjectable / useCache / useRun / useResult /
// useLoading / useError 组合为单一 hook useQuery(fn, args, opts)，统一：
// - 模块级共享内存缓存（cacheTime 默认 10000ms）；
// - 陈旧标记（staleTime 默认 2000ms）——均对齐迁移前 Tags / CommentList
//   手写组合的取值；
// - refetch：清掉当前参数的缓存条目后重发（绕过缓存），引用稳定。
import {useCallback, type DependencyList} from 'react';
import {
  createMemoryCacheProvider,
  useCache,
  useError,
  useInject,
  useInjectable,
  useLoading,
  useResult,
  useRun
} from 'react-toolroom/async';

import {useMock} from '@/components/DevTool';

type AsyncFunc = (...args: any[]) => Promise<any>;
// 与 react-toolroom 内部的 Awaited/R 保持同构，避免泛型延迟求值时类型对不上
type R<F extends AsyncFunc> = ReturnType<F> extends Promise<infer A> ? A : ReturnType<F>;

const DEFAULT_CACHE_TIME = 10000;
const DEFAULT_STALE_TIME = 2000;

// 显式以 any 实例化值类型，保证与任意 F 的 R<F> 双向兼容
export type QueryCache = ReturnType<typeof createMemoryCacheProvider<any, any[]>>;

export function createQueryCache(cacheTime = DEFAULT_CACHE_TIME): QueryCache {
  return createMemoryCacheProvider<any, any[]>({
    cacheTime,
    hash: (k) => JSON.stringify(k)
  });
}

// 模块级共享缓存：同参数的请求在 cacheTime 内复用。
export const queryCache: QueryCache = createQueryCache();

// 跨组件共享的 injectable（react-toolroom 的跨组件模型：失效按 injectable
// 身份寻址）。useQuery 的每个消费者仍各自调用 useInjectable（hook 必须无条件
// 调用），但只有首个实例的 injectable 进缓存并被所有消费者复用——这样
// invalidate(queryOf(fn)) 才能命中它们注册的缓存与订阅者。
const sharedInjectables = new WeakMap<AsyncFunc, AsyncFunc>();

function useSharedInjectable<F extends AsyncFunc>(fn: F): F {
  const mine = useInjectable(fn);
  const cached = sharedInjectables.get(fn);
  if (cached) return cached as F;
  sharedInjectables.set(fn, mine);
  return mine;
}

/**
 * 预热并取 useQuery 为 fn 使用的共享 injectable，作为
 * `invalidate([...])` / `useMutation(..., {invalidates: [...]})` 的失效
 * 目标。
 *
 * 是 hook：在消费 mutation 的组件里调用（无条件、顶层）。内部建一个
 * injectable 并注册进共享表，保证即使目标查询组件尚未挂载，拿到的
 * 也是合法 injectable（useMutation 的 invalidates 运行时校验要求如此）；
 * 之后目标查询组件挂载时复用同一实例，失效即命中其缓存与订阅者。
 */
export function useQueryOf<F extends AsyncFunc>(fn: F): F {
  const mine = useInjectable(fn);
  const cached = sharedInjectables.get(fn);
  if (cached) return cached as F;
  sharedInjectables.set(fn, mine);
  return mine;
}

export type MockConfig = {
  schema: unknown;
  key: string;
};

export type QueryOptions<T> = {
  /** 结果缓存提供者，默认模块级共享 queryCache */
  cache?: QueryCache;
  /** 缓存多久后标记为 stale（ms），默认 2000 */
  staleTime?: number;
  /** 初始数据，避免首屏取到 undefined */
  initData?: T;
  /**
   * 接入 DevTool mock 面板（useMock）。
   *
   * 为什么做成配置项而不是把 injectable 暴露给调用方自行 useMock：
   * useMock 的中间件必须注册在 useCache 内层（直接包住原始请求函数），
   * 面板的 Refresh / always / empty 模式才有效；调用方在 useQuery 之后再
   * useMock(injectable) 会把 mock 垫到缓存外层，缓存命中时 mock 失效、
   * mock 命中时结果又进不了缓存。另注：useMock 内部仅通过 useInject
   * 注册中间件（不含任何 React hook），因此按配置有无调用不影响
   * hooks 调用顺序；mock 配置需在调用点保持恒定。
   */
  mock?: MockConfig;
};

export type QueryResult<T> = {
  data: T;
  loading: boolean;
  error: Error | undefined;
  stale: boolean;
  /** 删除当前 args 的缓存条目后重新请求 */
  refetch: () => void;
};

export function useQuery<F extends AsyncFunc>(
  fn: F,
  args?: Parameters<F>,
  opts?: QueryOptions<R<F>> & {initData: R<F>}
): QueryResult<R<F>>;
export function useQuery<F extends AsyncFunc>(
  fn: F,
  args?: Parameters<F>,
  opts?: QueryOptions<R<F>>
): QueryResult<R<F> | undefined>;
export function useQuery<F extends AsyncFunc>(
  fn: F,
  args: Parameters<F> = [] as unknown as Parameters<F>,
  {
    cache = queryCache,
    staleTime = DEFAULT_STALE_TIME,
    initData,
    mock
  }: QueryOptions<R<F>> = {}
): QueryResult<R<F> | undefined> {
  const injectable = useSharedInjectable(fn);

  if (mock) {
    useMock(
      injectable as (...params: unknown[]) => Promise<unknown>,
      mock.schema,
      mock.key,
      cache
    );
  }

  const stale = useCache(injectable, cache, staleTime);
  const data = useResult(injectable, initData!);
  const loading = useLoading(injectable);
  const error = useError(injectable);

  // 兜底：useError 的中间件在记录错误后会重抛。这里在最外层接住，
  // 让 useRun / refetch 的调用不产生悬空 rejection——错误统一从
  // 返回值 error 里读。
  useInject(injectable, (f) =>
    ((...args: Parameters<F>) => f(...args).catch(() => undefined)) as F
  );

  useRun(injectable, args);

  const refetch = useCallback(() => {
    cache.delete(args);
    void injectable(...args);
  }, args as DependencyList);

  return {data, loading, error, stale, refetch};
}
