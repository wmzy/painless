// 项目级数据获取层：机制（每实体缓存 createQueryCache + allCaches 注册表 +
// 可选 localStorage 持久化）与场景组装（createQueryHook，选项在场景声明点
// 闭合、运行时调用点零 option）。分层与上移计划见 docs/decisions.md 第 2
// 条；loading / select / 结构共享的语义取舍与 bindQueryFn 绑定机制见第 9
// 条；持久化决策见第 4 条。
import type {Article, ArticlePage, Comment} from '@/types';
import type {HomeSearch} from '@/types/search';

import {
  createMemoryCacheProvider,
  isAbortSignal,
  stableHash,
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
  type MutationSpec
} from 'react-toolroom/async';

import {useMock} from '@/util/mock';

// 对齐 TanStack Query 的 gcTime 默认值；低频全局实体可单独放长（见 tagsCache）
const DEFAULT_CACHE_TIME = 5 * 60_000;
const DEFAULT_STALE_TIME = 2000;

// select 已按调用点裁剪，恒等投影是唯一投影：useResultSelect 只要结果存在
// 就会调 select，传 undefined 会在首个结果到达时抛「select is not a
// function」；模块级常量保证 select 身份稳定（「结果 + select」双重身份的
// memo 桶不随渲染击穿）。
const identity = <T,>(r: T) => r;

// 统一 hash 的两层归一，缺一则同一参数会被拆成不同 key：
// 1. 剥掉参数中混入的 AbortSignal（useRun({signal: true}) 每次 run 附加）
//   ——否则 refetch 的 cache.delete(args) 与 useRun 存下的带 signal 条目
//   不同 key；
// 2. 递归剥掉对象里值为 undefined 的键——loader 侧拿 schema 输出（缺省
//   字段无键），视图侧拿组件状态（缺省字段是 undefined 属性），归一后
//   两侧永远同 key。
const stripUndefined = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stripUndefined);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) out[k] = stripUndefined(val);
    }
    return out;
  }
  return v;
};
const hashArgs = (args: unknown[]) =>
  stableHash(stripUndefined(args.filter((a) => !isAbortSignal(a))));

// mutation 从可选收成必有：createQueryCache 恒由 createMemoryCacheProvider
// 创建（运行时必然携带），调用方零断言。值类型与 key 元组类型都在 cache 上
// 收紧——peek 不需要 as，key 写错形状编译期暴露。
export type EntityCache<T, K extends unknown[]> = CacheProvider<T, K> & {
  mutation: <Args extends any[], Resp>(
    spec: (...args: Args) => MutationSpec<T, K, Args, Resp>
  ) => BoundMutation<Args, Resp>;
};

// ---- 每实体缓存注册表 ------------------------------------------------------

// 新建实体 cache 即在 createQueryCache 内自动登记：登出清场（clearAllCaches
// 遍历）与 DevTool 面板遍历都以注册表为唯一事实来源，新实体自动带上名字。
export type CacheRegistryEntry = {
  name: string;
  // K 收 any（any 而非 any[]：EntityCache 成员在 K 上逆变，any[] 实参化
  // 反而收不了具体元组的 cache）；注册表只服务遍历，值/key 类型无意义
  cache: EntityCache<any, any>;
};

// 模块加载即填充：下方实体 cache 的创建语句逐个 push 进同一个数组，导出的
// 就是该引用（测试等处后建的临时 cache 同样可见）。
export const allCaches: CacheRegistryEntry[] = [];

// 持久化 cache 的登出擦盘回调：clearAllCaches 清完内存后逐个执行。
const persistWipes = new Map<string, () => void>();

// 持久化载荷版本：{v: PERSIST_VERSION, data: <表>}。hydrate 按 v 门禁——
// 版本不符（含 v 引入前的裸表旧格式）整体丢弃静默重来，刻意不做跨版本
// 迁移：盘上是可重建的缓存镜像而非事实数据源，丢弃的代价只是一次冷启动
// 重拉，低于长期维护迁移路径的成本。
const PERSIST_VERSION = 1;

// 载荷 data 表的形状粗验：不深检条目值（类型由写侧的 T 保证），拦的是手
// 改/截断/旧 schema 的结构性坏数据，不合格整体丢弃而非逐条抢救。
const isPersistTable = (v: unknown): v is Record<string, [unknown, number]> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).every(
    (e) => Array.isArray(e) && e.length === 2 && typeof e[1] === 'number'
  );

// localStorage 单键镜像挂载（决策见 docs/decisions.md 第 4 条）。启动同步
// hydrate，一切存储异常静默（模块加载路径上不允许存储层炸掉）；hydrate
// 保留条目原 cachedAt——重启后按真实年龄越过 staleTime，旧值先行 + 后台
// 重验证（SWR），不会把陈旧数据当新鲜用。
const attachPersistence = (cache: EntityCache<any, any>, key: string) => {
  const storage = (() => {
    try {
      // SSR 无 window、隐私模式 setItem 直接抛：探测失败退化为纯内存 cache
      if (typeof window === 'undefined') return undefined;
      window.localStorage.setItem(`${key}:probe`, '1');
      window.localStorage.removeItem(`${key}:probe`);
      return window.localStorage;
    } catch {
      return undefined;
    }
  })();
  if (!storage) return;

  try {
    const raw = storage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'v' in parsed &&
        parsed.v === PERSIST_VERSION &&
        'data' in parsed &&
        isPersistTable(parsed.data)
      ) {
        cache.hydrate?.(parsed.data);
      }
    }
  } catch {
    // 坏 JSON：宁可空开始也不抛
  }

  cache.subscribe?.(() => {
    try {
      // 写前 diff 盘上现值（实时 getItem，非缓存的上次写值）：收到其它 tab
      // 的 storage 事件后 clear 的 delete 事件会把空表写回，若不 diff 直接
      // setItem，其它 tab 又收到事件再 clear，形成乒乓——同值跳过让链路一
      // 轮收敛（浏览器对「同值 setItem 不再广播」并无一致保证，以显式
      // diff 收敛，不依赖该实现细节）。
      const next = JSON.stringify({
        v: PERSIST_VERSION,
        data: cache.dehydrate?.() ?? {}
      });
      if (next !== storage.getItem(key)) storage.setItem(key, next);
    } catch {
      // 配额超限或非 JSON 安全值：静默降级，内存 cache 保持正确
    }
  });

  // 跨 tab：storage 事件只在「其它文档」改动本键时派发到本 tab。newValue
  // 有值（别 tab 的新镜像）与 null（removeItem，登出擦盘）的正确动作相同：
  // 清本 tab 内存，消费者 miss/stale 重拉服务端真相（不 hydrate 别 tab 的
  // 盘上字节）。监听与 cache 同生命周期，不随登出摘除（登出后公共实体照常
  // 跨 tab 同步）。
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === key) cache.clear();
  };
  window.addEventListener('storage', onStorage);

  persistWipes.set(key, () => storage.removeItem(key));
};

export function createQueryCache<T, K extends unknown[]>(
  name: string,
  cacheTime = DEFAULT_CACHE_TIME,
  opts: {persist?: string} = {}
): EntityCache<T, K> {
  // memory provider 运行时恒携带 mutation/patchWhere，类型上经 as 收成必有
  const cache = createMemoryCacheProvider<T, K>({
    cacheTime,
    hash: hashArgs
  }) as EntityCache<T, K>;

  if (opts.persist) attachPersistence(cache, opts.persist);
  allCaches.push({name, cache});
  return cache;
}

/** 文章实体：key = [slug]，Article 视图与编辑写穿共用 */
export const articleCache = createQueryCache<Article, [string]>('article');
/** 首页信息流投影：key = [homeSearch]（hash 归一剥 undefined tag） */
export const homeCache = createQueryCache<ArticlePage, [HomeSearch]>('home');
/** 文章评论：key = [slug]，发评论后按 slug 失效重拉 */
export const commentsCache = createQueryCache<Comment[], [string]>('comments');
/** 全局标签：key = []（单例条目）；唯一持久化实体，cacheTime 放长（1h）对齐盘侧生命周期 */
export const tagsCache = createQueryCache<string[], []>(
  'tags',
  60 * 60 * 1000,
  {persist: 'painless.cache.tags'}
);

// 顺序约束：先清内存后擦盘——cache.clear() 的 delete 事件先让镜像把空表
// 写回，随后 removeItem 兜底删除（镜像写入被配额等异常吞掉也不残留）。
// 擦盘必须完整：下个账号冷启动不得 hydrate 回上个账号的数据。
export const clearAllCaches = () => {
  for (const {cache} of allCaches) cache.clear();
  for (const wipe of persistWipes.values()) wipe();
};

export type MockConfig = {
  schema: unknown;
  key: string;
};

// ---- queryFn：绑定 cache 的取数入口 ----------------------------------------

// fetch × cache 配对只在此闭合一次，路由 loader / 场景 hook / mutation 写
// 穿从同一绑定取同一 cache（机制见 docs/decisions.md 第 9 条）。[bound] 是
// 模块私有 unique symbol 的 phantom 品牌（零运行时）：普通 service 函数缺
// 品牌，编译期就进不了 createQueryHook。品牌值收 unknown 而非
// EntityCache<T, K>——后者因 EntityCache 在 K 上逆变，具体 QueryFn 会对
// QueryFn<any, any[]>（QueryHookConfig.queryFn 的类型）不可赋值。
declare const bound: unique symbol;

export type QueryFn<T, K extends unknown[]> = ((
  ...args: [...K, signal?: AbortSignal]
) => Promise<T>) & {
  [bound]: unknown;
};

const boundCaches = new WeakMap<
  (...args: any[]) => Promise<any>,
  EntityCache<any, any>
>();

// 不变量：一个 service 函数只绑一个 cache（重复绑定后者覆盖）
export function bindQueryFn<T, K extends unknown[]>(
  fetch: (...args: [...K, signal?: AbortSignal]) => Promise<T>,
  cache: EntityCache<T, K>
): QueryFn<T, K> {
  boundCaches.set(fetch, cache);
  return fetch as QueryFn<T, K>;
}

// 未绑定抛错而非返回 undefined：品牌约束被 any 断链绕过时（JS 调用方、测试
// 替身），早抛比深处「cache.get is not a function」更快指向「service 函数
// 忘经 bindQueryFn 配对」。
export function getCache(queryFn: QueryFn<any, any[]>): EntityCache<any, any> {
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
  /** 删除当前 args 的缓存条目后重新请求（绕过缓存；引用稳定，失败 resolve undefined 不 reject） */
  refetch: () => void | Promise<unknown>;
};

// 场景声明点的全部选项：创建时闭合，之后不可变；cache 不在其中——已由
// queryFn 绑定携带，组装点不重复配对。
export type QueryHookConfig = {
  queryFn: QueryFn<any, any[]>;
  /** 缓存多久后标记为 stale（ms），默认 2000 */
  staleTime?: number;
  /** 初始数据，避免首屏取到 undefined；声明后 data 类型收窄为非空 */
  initData?: unknown;
  /**
   * 接入 DevTool mock 面板。做成配置项而非暴露 injectable 给调用方自行
   * useMock：mock 中间件必须注册在 useCache 内层（直接包住原始请求函
   * 数），面板的 Refresh / always / empty 模式才生效——垫在缓存外层会出
   * 现「缓存命中时 mock 失效、mock 命中时结果又进不了缓存」。
   */
  mock?: MockConfig;
};

// args 元组从 queryFn 参数剥尾参可选 signal（与 hashArgs 的运行时归一同
// 构）；data 是否非空由「声明了 initData」的条件类型决定——initData / 无
// initData 的重载对就此消失，调用点只剩 (args) => QueryResult。
type SceneArgs<C extends QueryHookConfig> =
  C['queryFn'] extends (...args: [...infer K, signal?: AbortSignal]) => Promise<any>
    ? K
    : never;
type SceneData<C extends QueryHookConfig> =
  | Awaited<ReturnType<C['queryFn']>>
  | (C extends {initData: unknown} ? never : undefined);

export function createQueryHook<C extends QueryHookConfig>(
  config: C
): (args: SceneArgs<C>) => QueryResult<SceneData<C>>;
export function createQueryHook(
  config: QueryHookConfig
): (args: unknown[]) => QueryResult<unknown> {
  const {queryFn, staleTime = DEFAULT_STALE_TIME, initData, mock} = config;
  const cache = getCache(queryFn);

  return (args: unknown[]): QueryResult<unknown> => {
    // 具名注册（react-toolroom ≥0.16）：useInjectable(queryFn, {name}) 把
    // 实例发布进模块级具名注册表，<InjectDevTools /> 不传 injectables 时
    // 观察全部具名实例——DevTool 面板借此看到场景 hook 发起的真实调用。
    // 名字取 queryFn.name，匿名函数兜底 'query'。
    const injectable = useInjectable(queryFn, {name: queryFn.name || 'query'});

    // 洋葱注册顺序（先注册在内层）：mock 最内直接包住原始 fn，往上
    // cache——mock 垫在缓存内层是 DevTool 面板 Refresh / always / empty
    // 模式生效的前提（论证见 QueryHookConfig.mock）。mock 是创建时闭合的
    // 常量，按有无条件调用不违反 hooks 规则（useMock 内部只有 useInject，
    // 无 React hook）。
    if (mock) {
      useMock(injectable, mock.schema, mock.key, cache);
    }

    const stale = useCache(injectable, cache, staleTime);

    // focus / 断网恢复重验证：args 必须与 useRun 同 key——否则是另一条
    // 请求线而非命中既有条目；新鲜期内 useCache 直接命中，两处零请求。
    useFocusRevalidate(injectable, {args});
    useReconnectRevalidate(injectable, {args});

    // initData 注入 init 槽：首帧即有兜底值，但不落 result store——初载
    // 语义的 loading 仍如实为 true。
    const data = useResultSelect(injectable, identity, initData);
    const fetching = useLoading(injectable);

    // per-args 观测：loading/error/failureCount 按 args key 独立——同一
    // queryFn 并发服务多组参数时互不串扰；loading 在其上重建 SWR 初载语
    // 义（「本参数有调用在飞」叠加「本参数尚无结果」——status.data 仅在
    // 共享结果的 provenance 匹配当前 args 时非空）。挂载即认领实例错误
    //（读即认领，0.18.1）：调用失败在边界 resolve undefined，错误统一
    // 从返回值 error 读，useRun / refetch 不产生悬空 rejection。
    const argsStatus = useArgsStatus(injectable, args);
    const loading = argsStatus.loading && argsStatus.data === undefined;
    const error: Error | undefined = argsStatus.error;
    const failureCount = argsStatus.failureCount;

    // signal: true：每次 run 在 args 尾部附加 AbortSignal，args 变化或卸载
    // 时 abort 上一次（经服务层尾参透传到 fetch）；hash 让「结构变化」取代
    // 引用相等作为重跑依据——内联对象字面量做 args 不会每渲染重发。
    useRun(injectable, args, {signal: true, hash: hashArgs});

    const refetch = useRefresh(injectable, args, cache);

    return {data, loading, fetching, error, failureCount, stale, refetch};
  };
}
