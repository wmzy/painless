// 项目级数据获取层：机制 + 场景组装（createQueryHook）；不抽包常驻模板（#2/#13），bindQueryFn 语义见 #9。
import type {Article, ArticlePage, Author, Comment, ProfileFeedQuery} from '@/types';
import type {HomeSearch} from '@/types/search';

import {
  createMemoryCacheProvider,
  hashArgs,
  useArgsStatus,
  useCache,
  useFocusRevalidate,
  useInjectable,
  useLoading,
  useReconnectRevalidate,
  useRefresh,
  useResultSelect,
  useRun,
  type BoundMutation,
  type CacheProvider,
  type MutationSpec,
  type PersistOptions
} from 'react-toolroom/async';

import {useMock} from '@/util/mock';
import {getMockConfigs} from '@/util/mock-config';

import {DEFAULT_STALE_TIME, resetRefreshSeen} from './loaderCache';


// 对齐 TanStack Query 的 gcTime 默认。
const DEFAULT_CACHE_TIME = 5 * 60_000;

// tags cacheTime = staleTime 同长 1h（decisions.md #29）；导出供 useTagsQuery 复用。
export const TAGS_CACHE_TIME = 60 * 60 * 1000;

// useResultSelect 结果存在必调 select（传 undefined 抛）；模块级常量保证身份稳定（decisions.md #9）。
const identity = <T,>(r: T) => r;

// 方法简写（双变）：具体 cache 可赋宽泛槽位，品牌值保精确类型（decisions.md #9）。
export type EntityCache<T, K extends unknown[]> = CacheProvider<T, K> & {
  mutation<Args extends any[], Resp>(
    spec: (...args: Args) => MutationSpec<T, K, Args, Resp>
  ): BoundMutation<Args, Resp>;
};

// 注册表是 clearAllCaches/DevTool 遍历的唯一事实来源。
type CacheRegistryEntry = {
  name: string;
  cache: EntityCache<any, any[]>;
};

// 导出的即该引用（测试临时 cache 同样可见）。
export const allCaches: CacheRegistryEntry[] = [];

// mock always 期间挂起镜像写（decisions.md #12）；DEV 三元折叠生产、mock-config 摇出（#27）。
export const persistEnabled = import.meta.env.DEV
  ? () => !Object.values(getMockConfigs()).some((c) => c.when === 'always')
  : () => true;

export function createQueryCache<T, K extends unknown[]>(
  name: string,
  cacheTime = DEFAULT_CACHE_TIME,
  opts: {persist?: PersistOptions} = {}
): EntityCache<T, K> {
  // opts.persist 透传库选项（decisions.md #4 补记）；enabled=false 只拦磁盘读写。
  const provider = createMemoryCacheProvider<T, K>({
    cacheTime,
    hash: hashArgs,
    persist: opts.persist
  });
  // clear 包装：整实体 clear 显式归零 seen（decisions.md #13 补记，e2e 实测）。
  const rawClear = provider.clear.bind(provider);
  provider.clear = () => {
    rawClear();
    resetRefreshSeen(provider);
  };
  const cache = provider as EntityCache<T, K>;

  allCaches.push({name, cache});
  return cache;
}

/** key = [slug] */
export const articleCache = createQueryCache<Article, [string]>('article');
/** key = [homeSearch]（hash 归一剥 undefined tag） */
export const homeCache = createQueryCache<ArticlePage, [HomeSearch]>('home');
/** key = [username] */
export const profileCache = createQueryCache<Author, [string]>('profile');
/** key = [query]（scope×username×分页全组合） */
export const profileFeedCache = createQueryCache<ArticlePage, [ProfileFeedQuery]>(
  'profileFeed'
);
/** key = [slug] */
export const commentsCache = createQueryCache<Comment[], [string]>('comments');
/** key = []（单例条目）；唯一持久化实体 */
export const tagsCache = createQueryCache<string[], []>(
  'tags',
  TAGS_CACHE_TIME,
  {persist: {key: 'painless.cache.tags', enabled: persistEnabled}}
);

// 擦盘内建在库版 clear；必须完整（下个账号冷启动不得 hydrate 回上个账号数据）。
export const clearAllCaches = () => {
  for (const {cache} of allCaches) cache.clear();
};

const BASELINE_CACHES = allCaches.slice();

// 边界：测试文件模块级建的 cache 首轮 reset 会被出册（dataLoader.test 的 triple cache 刻意保留 clearAllCaches）。
export const resetAllCaches = () => {
  clearAllCaches();
  allCaches.length = 0;
  for (const entry of BASELINE_CACHES) allCaches.push(entry);
};

export type MockConfig = {
  schema: unknown;
  key: string;
};

// [bound] 私有 phantom 品牌（零运行时）：普通 service 函数编译期进不了 createQueryHook（decisions.md #9）。
declare const bound: unique symbol;

export type QueryFn<T, K extends unknown[]> = ((
  ...args: [...K, signal?: AbortSignal]
) => Promise<T>
) & {
  [bound]: EntityCache<T, K>;
};

const boundCaches = new WeakMap<
  (...args: any[]) => Promise<any>,
  EntityCache<any, any[]>
>();

// 一个 fetch 只绑一个 cache；DEV 下换绑早抛（decisions.md #9/#21），生产后写覆盖。
export function bindQueryFn<T, K extends unknown[]>(
  fetch: (...args: [...K, signal?: AbortSignal]) => Promise<T>,
  cache: EntityCache<T, K>
): QueryFn<T, K> {
  if (import.meta.env.DEV) {
    const existing = boundCaches.get(fetch);
    if (existing && existing !== cache) {
      throw new Error(
        '[bindQueryFn] service 函数重复绑定不同 cache——一个 fetch 只允许配对一个 cache（重绑同一 cache 幂等无害），请检查 dataloaders 声明点'
      );
    }
  }
  boundCaches.set(fetch, cache);
  return fetch as QueryFn<T, K>;
}

// 未绑定早抛，比深处报错更可定位（decisions.md #9）。
export function getCache(
  queryFn: QueryFn<any, any[]>
): EntityCache<any, any[]> {
  const cache = boundCaches.get(queryFn);
  if (!cache) {
    throw new Error(
      '[getCache] queryFn 未绑定 cache——service 函数必须先经 bindQueryFn(fetch, cache) 配对'
    );
  }
  return cache;
}

type QueryResult<T> = {
  /** initData 兜底；声明 initData 的场景收窄为非空 */
  data: T;
  /** 初载中：当前 args in-flight 且无本 args 结果；后台重拉不置 true */
  loading: boolean;
  fetching: boolean;
  error: Error | undefined;
  /** 本参数自上次成功以来的失败次数，同参数成功即归零 */
  failureCount: number;
  stale: boolean;
  /** 本 args 最近一次成功 settle 时间戳（provenance：结果确由当前 args 取得） */
  dataUpdatedAt: number | undefined;
  /** 删除当前 args 缓存条目后重请求（引用稳定，失败 resolve undefined） */
  refetch: () => void | Promise<unknown>;
};

// 创建时闭合不可变；cache 已由 queryFn 绑定携带（T 从 queryFn 推断）。
export type QueryHookConfig<T = unknown> = {
  queryFn: QueryFn<T, any[]>;
  staleTime?: number;
  /** 声明后 data 类型收窄为非空 */
  initData?: T;
  /** 必须注册在 useCache 内层，Refresh/always/empty 才生效（decisions.md #12） */
  mock?: MockConfig;
};

type SceneArgs<C extends QueryHookConfig<any>> =
  C['queryFn'] extends (...args: [...infer K, signal?: AbortSignal]) => Promise<any>
    ? K
    : never;
type SceneData<C extends QueryHookConfig<any>> =
  | Awaited<ReturnType<C['queryFn']>>
  | (C extends {initData: unknown} ? never : undefined);

// 双参重载：T 从 queryFn 推断，交集成员让 initData 错形状在此报错。
export function createQueryHook<T, C extends QueryHookConfig<T>>(
  config: C & {queryFn: QueryFn<T, any[]>}
): (args: SceneArgs<C>) => QueryResult<SceneData<C>>;
export function createQueryHook(
  config: QueryHookConfig
): (args: unknown[]) => QueryResult<unknown> {
  const {queryFn, staleTime = DEFAULT_STALE_TIME, initData, mock} = config;
  const cache = getCache(queryFn);

  return (args: unknown[]): QueryResult<unknown> => {
    // 具名注册（react-toolroom ≥0.16）：DevTool 面板可见。
    const injectable = useInjectable(queryFn, {name: queryFn.name || 'query'});

    // mock 最内垫在缓存内层（decisions.md #12）；useMock 内部无 React hook，条件调用安全。
    if (mock) {
      useMock(injectable, mock.schema, mock.key, cache);
    }

    const stale = useCache(injectable, cache, staleTime);

    // 新鲜判定上移到事件 hook，新鲜期整段跳过（decisions.md #29）。
    const revalidate = {args, cacheProvider: cache, staleTime};
    useFocusRevalidate(injectable, revalidate);
    useReconnectRevalidate(injectable, revalidate);

    // initData 注入 init 槽但不落 store，初载 loading 仍 true；unknown 收口防 any 扩散。
    const data: unknown = useResultSelect(injectable, identity, initData);
    const fetching = useLoading(injectable);

    // loading 重建 SWR 初载语义（decisions.md #9）；错误统一从返回值读，无悬空 rejection。
    const argsStatus = useArgsStatus(injectable, args);
    const loading = argsStatus.loading && argsStatus.data === undefined;
    // toolroom 0.19 起 error 按 E 泛型收紧（decisions.md #16）。
    const error = argsStatus.error;
    const failureCount = argsStatus.failureCount;
    const dataUpdatedAt = argsStatus.dataUpdatedAt;

    // hash 让结构变化取代引用相等作重跑依据。
    useRun(injectable, args, {signal: true, hash: hashArgs});

    const refetch = useRefresh(injectable, args, cache);

    return {data, loading, fetching, error, failureCount, stale, refetch, dataUpdatedAt};
  };
}
