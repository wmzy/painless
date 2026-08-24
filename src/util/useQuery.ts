// 项目级数据获取 preset（模板示范：每个项目可按自身理念定制这一层）。
// 把 react-toolroom/async 的 useInjectable / useCache / useRun / useResult /
// useLoading / useInitialLoading / useError / useRetry / useFocusRevalidate
// 组合为单一 hook useQuery(fn, args, opts)，统一：
// - 模块级共享内存缓存（cacheTime 默认 10000ms）；
// - 陈旧标记（staleTime 默认 2000ms）——均对齐迁移前 Tags / CommentList
//   手写组合的取值；
// - 并发去重：0.8 起 useCache 的 miss/stale 重验证内部走 provider.load
//   （原子 get-or-insert in-flight 槽位），同参数的并发调用共享同一
//   promise，底层 fn 只执行一次——且是跨组件、跨通道（路由 loader 的
//   withCache 用同一 queryCache）共享在飞请求，useDedup 已无必要；
// - focus 重验证（useFocusRevalidate）：窗口重新聚焦/可见时对 miss/
//   stale 条目后台重拉（新鲜期内经 useCache 直接命中，不发请求）；
// - 取消（useRun 的 signal）：args 变化或卸载时 abort 上一次请求，经
//   服务层尾参 signal 透传到 fetch；
// - 可选重试（QueryOptions.retry，默认禁用：retries 0）；
// - refetch：清掉当前参数的缓存条目后重发（绕过缓存），引用稳定；
// - loading 仅指初载（useInitialLoading，SWR 语义）：已有结果后的后台
//   重拉不再置 true，已渲染内容不闪整屏 Spinner；任意 in-flight（含
//   后台刷新）见 fetching（useLoading）。
import {useCallback, type DependencyList} from 'react';
import {
  createMemoryCacheProvider,
  isAbortSignal,
  stableHash,
  useCache,
  useError,
  useFocusRevalidate,
  useInject,
  useInjectable,
  useInitialLoading,
  useLoading,
  useResult,
  useRetry,
  useRun
} from 'react-toolroom/async';

import {useMock} from '@/util/mock';

type AsyncFunc = (...args: any[]) => Promise<any>;
// 与 react-toolroom 内部的 Awaited/R 保持同构，避免泛型延迟求值时类型对不上
type R<F extends AsyncFunc> = ReturnType<F> extends Promise<infer A> ? A : ReturnType<F>;

const DEFAULT_CACHE_TIME = 10000;
const DEFAULT_STALE_TIME = 2000;

// 统一 hash：结构化 stableHash（对象键序无关），并把参数中混入的
// AbortSignal 剥掉。useRun({signal: true}) 每次 run 都在尾部附加一个
// 新 signal，若让它进 key，同一参数的缓存/去重条目会被拆散——['x', sig]
// 与 ['x']（如 refetch 的 cache.delete(args) 对 useRun 存下的带 signal
// 条目）必须归一为同一 key。
const hashArgs = (args: unknown[]) =>
  stableHash(args.filter((a) => !isAbortSignal(a)));

// 显式以 any 实例化值类型，保证与任意 F 的 R<F> 双向兼容
export type QueryCache = ReturnType<typeof createMemoryCacheProvider<any, any[]>>;

export function createQueryCache(cacheTime = DEFAULT_CACHE_TIME): QueryCache {
  return createMemoryCacheProvider<any, any[]>({
    cacheTime,
    hash: hashArgs
  });
}

// 模块级共享缓存：同参数的请求在 cacheTime 内复用。0.7 起失效按 cache
// 寻址（invalidate([[cache, ...prefix]]) 直达 provider），各消费者各自
// useInjectable 即可，不再需要跨组件稳定 injectable 的 WeakMap hack。
export const queryCache: QueryCache = createQueryCache();

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
  /**
   * 失败重试（useRetry 预设）。默认禁用（retries: 0）：瞬态故障的传输层
   * 重试已由 http 层 withRetry 承担，这里留给调用方按查询粒度叠加。
   * retries 为初始失败后的重试次数上限；backoff 为退避策略，默认
   * 'exponential'（1s/2s/4s…，也可传函数自定义）。
   */
  retry?: {
    retries?: number;
    backoff?: 'exponential' | 'linear' | ((n: number) => number);
  };
};

export type QueryResult<T> = {
  data: T;
  /**
   * 初载中（useInitialLoading，对齐 TanStack Query 的 isLoading / SWR 的
   * 初载语义）：有请求 in-flight 且尚无任何结果。已有结果后的重拉
   * （缓存过期后台刷新、invalidate / refetch 触发）不会置 true——
   * 已渲染内容保持原样，不闪整屏 Spinner。
   */
  loading: boolean;
  /** 任意 in-flight（useLoading），含已有结果后的后台重拉；需要细化加载指示时用 */
  fetching: boolean;
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
    mock,
    retry
  }: QueryOptions<R<F>> = {}
): QueryResult<R<F> | undefined> {
  const injectable = useInjectable(fn);

  if (mock) {
    useMock(
      injectable as (...params: unknown[]) => Promise<unknown>,
      mock.schema,
      mock.key,
      cache
    );
  }

  // 注册顺序即洋葱层次（先注册在内层）：mock 最内直接包住原始 fn，往上
  // 依次 retry → cache。retry 在 cache 内层，整个重试循环是单次 in-flight，
  // 并发消费者共享同一循环；缓存/错误/加载状态只感知最终结果（重试期间
  // 不闪 error/loading）。无条件调用以满足 hooks 规则——默认
  // {retries: 0} 即直通，失败原样上抛。
  useRetry(injectable, retry ?? {retries: 0});

  // （0.7 的 useDedup 已删）并发去重由 provider.load 内建：useCache 的
  // miss/stale 重验证走 queryCache.load（原子 get-or-insert in-flight），
  // 同参数并发调用共享同一 promise——跨组件、跨通道（路由 loader 的
  // withCache 共用同一 queryCache）都只发一次请求。

  // useCache 对 provider 的期望形状随 AF 泛型延迟求值（R<AF>/Parameters<AF>），
  // 显式以 AsyncFunc 实例化后恰为 CacheProvider<any, any[]>——与模块级
  // QueryCache 完全一致，无需断言；cache 本就存任意值/任意参数（hashArgs
  // 归一），运行时安全。
  const stale = useCache(injectable as AsyncFunc, cache, staleTime);

  // focus/可见性恢复时的后台重验证（react-query 的 refetchOnWindowFocus）：
  // bfcache 恢复、路由 viewStack 快照回放后数据可能过时，回到页面即对
  // miss/stale 条目重拉（新鲜期内 useCache 直接命中缓存，不发请求）。
  // args 必须与 useRun 同 key：focus 重验证寻址 [..args] 而非 []，否则
  // 是另一条请求线而非命中既有条目。
  useFocusRevalidate(injectable as AsyncFunc, {args});

  const data = useResult(injectable, initData!);
  const fetching = useLoading(injectable);
  const loading = useInitialLoading(injectable);
  const error = useError(injectable);

  // 兜底：useError 的中间件在记录错误后会重抛。这里在最外层接住，
  // 让 useRun / refetch 的调用不产生悬空 rejection——错误统一从
  // 返回值 error 里读。
  useInject(injectable, (f) =>
    ((...args: Parameters<F>) => f(...args).catch(() => undefined)) as F
  );

  // signal: true：每次 run 在 args 尾部附加 AbortSignal，args 变化或卸载
  // 时 abort 上一次（经服务层尾参透传到 fetch）；hash 让「结构变化」取代
  // 引用相等作为重跑依据——内联对象字面量做 args 不会每渲染重发。
  useRun(injectable, args, {signal: true, hash: hashArgs});

  const refetch = useCallback(() => {
    // useRun 存下的条目带 signal 尾参，hashArgs 剥离后与本处 args 归一
    // 为同一 key，delete 必然命中。
    cache.delete(args);
    void injectable(...args);
  }, args as DependencyList);

  return {data, loading, fetching, error, stale, refetch};
}
