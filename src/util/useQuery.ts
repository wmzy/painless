// 项目级数据获取层：机制（每实体缓存 + 注册表 + opts.persist 透传，#4 补记）
// + 场景组装（createQueryHook，选项声明点闭合）。归宿：不抽包常驻模板（#2/#13）；
// loading/select/结构共享与 bindQueryFn 语义见 #9。
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


// 对齐 TanStack Query 的 gcTime 默认；低频全局实体单独放长（tagsCache）。
const DEFAULT_CACHE_TIME = 5 * 60_000;

// tags 时间窗口：cacheTime = staleTime 同长 1h（decisions.md #29）；导出供 useTagsQuery 复用，两处不漂移。
export const TAGS_CACHE_TIME = 60 * 60 * 1000;

// 恒等投影是唯一投影（useResultSelect 只要结果存在就调 select，传 undefined 会抛）；
// 模块级常量保证 select 身份稳定（decisions.md #9）。
const identity = <T,>(r: T) => r;

// mutation 从可选收成必有：createQueryCache 恒由 createMemoryCacheProvider
// 创建；方法简写（双变）让具体 cache 可赋宽泛槽位，品牌值保精确类型（decisions.md #9）。
export type EntityCache<T, K extends unknown[]> = CacheProvider<T, K> & {
  mutation<Args extends any[], Resp>(
    spec: (...args: Args) => MutationSpec<T, K, Args, Resp>
  ): BoundMutation<Args, Resp>;
};

// ---- 每实体缓存注册表 ------------------------------------------------------

// 新建实体自动登记：clearAllCaches 与 DevTool 面板遍历都以注册表为唯一事实来源。
export type CacheRegistryEntry = {
  name: string;
  // 注册表只服务遍历，值类型无意义（K 收 any[]）。
  cache: EntityCache<any, any[]>;
};

// 模块加载即填充；导出的即该引用（测试临时 cache 同样可见）。
export const allCaches: CacheRegistryEntry[] = [];

// persist 的 enabled 回调：mock always 激活期间挂起镜像写（decisions.md #12）。
// DEV 三元让生产折叠为 () => true——getMockConfigs 引用消失、mock-config 摇出（#27 生产泄漏收口）。
export const persistEnabled = import.meta.env.DEV
  ? () => !Object.values(getMockConfigs()).some((c) => c.when === 'always')
  : () => true;

export function createQueryCache<T, K extends unknown[]>(
  name: string,
  cacheTime = DEFAULT_CACHE_TIME,
  opts: {persist?: PersistOptions} = {}
): EntityCache<T, K> {
  // opts.persist 透传库选项（decisions.md #4 补记）：hydrate/写盘/跨 tab/擦盘语义上移；
  // enabled=false 只拦磁盘读写。
  const provider = createMemoryCacheProvider<T, K>({
    cacheTime,
    hash: hashArgs,
    persist: opts.persist
  });
  // clear 代际包装：整实体 clear 显式归零 seen（decisions.md #13 补记，e2e 劫杀实测）；
  // 闭包包装不动 provider 其余成员。
  const rawClear = provider.clear.bind(provider);
  provider.clear = () => {
    rawClear();
    resetRefreshSeen(provider);
  };
  // memory provider 运行时恒携带 mutation/patchWhere，类型上经 as 收成必有
  const cache = provider as EntityCache<T, K>;

  allCaches.push({name, cache});
  return cache;
}

/** 文章实体：key = [slug]，Article 视图与编辑写穿共用 */
export const articleCache = createQueryCache<Article, [string]>('article');
/** 首页信息流投影：key = [homeSearch]（hash 归一剥 undefined tag） */
export const homeCache = createQueryCache<ArticlePage, [HomeSearch]>('home');
/** 公开档案实体：key = [username]，Profile 视图 follow 写穿共用 */
export const profileCache = createQueryCache<Author, [string]>('profile');
/** Profile 页文章列表投影：key = [query]（scope×username×分页全组合） */
export const profileFeedCache = createQueryCache<ArticlePage, [ProfileFeedQuery]>(
  'profileFeed'
);
/** 文章评论：key = [slug]，发评论后按 slug 失效重拉 */
export const commentsCache = createQueryCache<Comment[], [string]>('comments');
/** 全局标签：key = []（单例条目）；唯一持久化实体，cacheTime = staleTime（TAGS_CACHE_TIME，1h） */
export const tagsCache = createQueryCache<string[], []>(
  'tags',
  TAGS_CACHE_TIME,
  {persist: {key: 'painless.cache.tags', enabled: persistEnabled}}
);

// 擦盘内建在库版 clear（先写空表镜像再 removeItem 兜底）；clearAllCaches 只清内存。
// 擦盘必须完整：下个账号冷启动不得 hydrate 回上个账号数据。
export const clearAllCaches = () => {
  for (const {cache} of allCaches) cache.clear();
};

// 模块加载后的注册表快照（resetAllCaches 还原基线）：临时 cache 只增不减，
// 重置回「只有模块实体」的干净基线。
const BASELINE_CACHES = allCaches.slice();

// 测试工具：清场后还原注册表到模块基线，临时 cache 不跨用例累积。
// 边界：cache 建在测试文件模块级（import 期创建、复用同实例）不适合本工具
//——首轮 reset 会把它出册（dataLoader.test 的 triple cache 刻意保留 clearAllCaches）。
export const resetAllCaches = () => {
  clearAllCaches();
  allCaches.length = 0;
  for (const entry of BASELINE_CACHES) allCaches.push(entry);
};

export type MockConfig = {
  schema: unknown;
  key: string;
};

// ---- queryFn：绑定 cache 的取数入口 ----------------------------------------

// fetch × cache 配对只在此闭合一次（decisions.md #9）。[bound] 是模块私有
// unique symbol 的 phantom 品牌（零运行时）：普通 service 函数编译期进不了 createQueryHook。
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

// 不变量：一个 fetch 只绑一个 cache。DEV 下换绑不同 cache 早抛（decisions.md #9/#21）；
// 重绑同一实例幂等；生产维持后写覆盖，不为误写付检查成本。
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

// 未绑定早抛（品牌被 any 断链绕过时），比深处「cache.get is not a function」更可定位（decisions.md #9）。
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

// ---- 场景 hook 工厂 ---------------------------------------------------------

export type QueryResult<T> = {
  /** 结果（initData 兜底，首个结果到达前为 undefined；声明了 initData 的场景收窄为非空） */
  data: T;
  /** 初载中：当前 args 有请求 in-flight 且尚无本 args 结果；后台重拉不置 true */
  loading: boolean;
  /** 任意 in-flight（含已有结果后的后台重拉）；需要细化加载指示时用 */
  fetching: boolean;
  error: Error | undefined;
  /** 本参数自上次成功以来的失败次数，同参数成功即归零（per-args 观测） */
  failureCount: number;
  stale: boolean;
  /** 本 args 最近一次成功 settle 时间戳（provenance 契约：结果确由当前 args 取得）；失败不触碰。 */
  dataUpdatedAt: number | undefined;
  /** 删除当前 args 的缓存条目后重新请求（绕过缓存；引用稳定，失败 resolve undefined 不 reject） */
  refetch: () => void | Promise<unknown>;
};

// 场景声明点全部选项，创建时闭合不可变；cache 已由 queryFn 绑定携带。
// T 从 queryFn 推断，initData 收紧到 T——错形状声明点即编译错。
export type QueryHookConfig<T = unknown> = {
  queryFn: QueryFn<T, any[]>;
  /** 缓存多久后标记为 stale（ms），默认 2000 */
  staleTime?: number;
  /** 初始数据，避免首屏取到 undefined；声明后 data 类型收窄为非空 */
  initData?: T;
  /** 接入 DevTool mock：必须注册在 useCache 内层，Refresh/always/empty 才生效（decisions.md #12）。 */
  mock?: MockConfig;
};

// args 剥尾参可选 signal；data 非空由「声明 initData」的条件类型决定。
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
    // 具名注册（react-toolroom ≥0.16）：DevTool 面板借此看到场景 hook 的真实调用。
    // 名字取 queryFn.name，匿名兜底 'query'。
    const injectable = useInjectable(queryFn, {name: queryFn.name || 'query'});

    // 洋葱顺序：mock 最内直接包住 fn（垫在缓存内层，decisions.md #12）；
    // mock 是创建时闭合常量，条件调用不违反 hooks 规则（useMock 内部无 React hook）。
    if (mock) {
      useMock(injectable, mock.schema, mock.key, cache);
    }

    const stale = useCache(injectable, cache, staleTime);

    // focus/断网重验证：args 与 useRun 同 key；cacheProvider+staleTime 把新鲜判定上移到事件 hook
    //（新鲜期整段跳过，decisions.md #29）。
    const revalidate = {args, cacheProvider: cache, staleTime};
    useFocusRevalidate(injectable, revalidate);
    useReconnectRevalidate(injectable, revalidate);

    // initData 注入 init 槽：首帧有兜底值但不落 result store，初载 loading 仍为 true。
    // unknown 收口：实现重载 queryFn 是 QueryFn<any,any[]>，防 any 沿返回对象扩散。
    const data: unknown = useResultSelect(injectable, identity, initData);
    const fetching = useLoading(injectable);

    // per-args 观测：loading/error/failureCount 按 args 独立；loading 重建 SWR 初载语义
    //（decisions.md #9）。错误统一从返回值 error 读，useRun/refetch 不产生悬空 rejection。
    const argsStatus = useArgsStatus(injectable, args);
    const loading = argsStatus.loading && argsStatus.data === undefined;
    // error 自 toolroom 0.19 按 E 泛型收紧（默认 Error | undefined），直接透传（decisions.md #16）。
    const error = argsStatus.error;
    const failureCount = argsStatus.failureCount;
    // 透传 per-args 成功时间戳（provenance 契约由 useArgsStatus 把关）。
    const dataUpdatedAt = argsStatus.dataUpdatedAt;

    // signal:true 每次 run 附 AbortSignal，args 变化/卸载 abort 上一次；hash 让结构变化取代引用相等作重跑依据。
    useRun(injectable, args, {signal: true, hash: hashArgs});

    const refetch = useRefresh(injectable, args, cache);

    return {data, loading, fetching, error, failureCount, stale, refetch, dataUpdatedAt};
  };
}
