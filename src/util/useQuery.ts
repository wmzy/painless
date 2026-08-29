// 项目级数据获取 preset（模板示范：每个项目可按自身理念定制这一层）。
// 【上移计划】本胶水层（useQuery preset + 每实体缓存注册表 + 持久化挂载）
// 计划在 API 形态稳定后上移为独立包（暂缓，决策记录见 docs/decisions.md）。
// 把 react-toolroom/async 的 useInjectable / useCache / useRun /
// useResultSelect / useLoading / useInitialLoading / useError / useRetry /
// useFocusRevalidate 组合为单一 hook useQuery(fn, args, opts)，统一：
// - 模块级共享内存缓存（cacheTime 默认 5min，对齐 TanStack Query 的
//   gcTime 缺省）：0.12 起 cacheTime 是 per-entry 逐条回收——条目以
//   lastUsedAt（get/peek/set/load/patchWhere/hydrate 触碰即刷新）计龄，
//   满窗口且无 in-flight 的条目经「useCount 归零 sweep + 写入防抖扫描」
//   双通道回收，loader 直写的零消费者条目同样按窗口回收，不再是旧版
//   「整表 10s 清空」的粗粒度语义；
// - 陈旧标记（staleTime 默认 2000ms）——均对齐迁移前 Tags / CommentList
//   手写组合的取值；
// - 并发去重：0.8 起 useCache 的 miss/stale 重验证内部走 provider.load
//   （原子 get-or-insert in-flight 槽位），同参数的并发调用共享同一
//   promise，底层 fn 只执行一次——且是跨组件、跨通道（路由 loader 的
//   withCache 用同一实体 cache）共享在飞请求，useDedup 已无必要；
// - focus 重验证（useFocusRevalidate）：窗口重新聚焦/可见时对 miss/
//   stale 条目后台重拉（新鲜期内经 useCache 直接命中，不发请求）；
// - 断网恢复重验证（useReconnectRevalidate）：window online 事件时对
//   miss/stale 条目后台重拉——与 focus 重验证同一门槛，新鲜期内零请求；
// - 取消（useRun 的 signal）：args 变化或卸载时 abort 上一次请求，经
//   服务层尾参 signal 透传到 fetch；
// - 可选重试（QueryOptions.retry，默认禁用：retries 0）；
// - refetch：清掉当前参数的缓存条目后重发（绕过缓存），引用稳定；
// - loading 仅指初载（useInitialLoading，SWR 语义）：已有结果后的后台
//   重拉不再置 true，已渲染内容不闪整屏 Spinner；任意 in-flight（含
//   后台刷新）见 fetching（useLoading）。
// - 结构共享（structural sharing）刻意不做：后台重验证 settle 的新引用
//   即使内容不变也会重渲染消费者——重验证低频（staleTime 门槛拦截，
//   新鲜期内连请求都不发）、页级重渲染廉价（reconcile 后通常无 DOM
//   变更），而 deep-equal 要在每次成功 fetch 付 O(payload)。热点组件
//   用标量 props + React.memo 局部解决（注意：settle 后对象 prop 恒为
//   新引用，memo 边界上比较标量才有效，比较对象等于手写 deep-equal）。
import type {Article, ArticlePage, Comment} from '@/types';
import type {HomeSearch} from '@/types/search';

import {useCallback, useRef, type DependencyList} from 'react';
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
  useReconnectRevalidate,
  useResultSelect,
  useRetry,
  useRun,
  type BoundMutation,
  type CacheProvider,
  type MutationSpec
} from 'react-toolroom/async';

import {useMock} from '@/util/mock';

type AsyncFunc = (...args: any[]) => Promise<any>;
// 与 react-toolroom 内部的 Awaited/R 保持同构，避免泛型延迟求值时类型对不上
type R<F extends AsyncFunc> = ReturnType<F> extends Promise<infer A> ? A : ReturnType<F>;

// K 的挂钩机制：从 fetcher 参数元组剥掉尾部的可选 AbortSignal（useRun 的
// {signal: true} 每次 run 尾附新 signal，由 hashArgs 归一剥离——类型层与
// hash 层同构），剩余元组即该查询的 cache key 形状。QueryOptions.cache 的
// K 由此推导，实体 cache（createQueryCache 显式标注 K）与 fetcher 形状
// 不一致时编译期报错。残余限制：只剥「元组尾部的可选 signal」——signal
// 必须是尾参且可选（本仓库服务层约定即如此）；若 fetcher 参数里有其它
// 每次调用都变、靠 hash 归一兜底的形态（如非尾部混入的 signal），类型层
// 无法识别，仍退化为运行时 hash 归一。另：useQuery 实现体内 F 未定，
// QueryKey<F> 无法静态证明与 Parameters<F> 同构，故实现体保留原 as 断言
// 收拢（tsc 认必要；eslint 的类型程序解析不同视其多余——按 tsc 为准）。
type QueryKey<F> = F extends (...args: infer A) => Promise<unknown>
  ? A extends [...infer K, signal?: AbortSignal]
    ? K
    : A
  : never;

// 默认 5min（对齐 TanStack Query gcTime）：per-entry 逐条回收（见文件
// 头），非旧版整表清空。
const DEFAULT_CACHE_TIME = 5 * 60_000;
const DEFAULT_STALE_TIME = 2000;

// select 缺省时的恒等投影：useResultSelect 只要结果存在就会调 select，
// 传 undefined 会在首个结果到达时抛「select is not a function」。模块级
// 常量保证身份稳定，恒等投影下输出即输入——与原 useResult 语义等价。
const identity = <T,>(r: T) => r;

// 统一 hash：结构化 stableHash（对象键序无关）+ 两层归一——
// 1. 把参数中混入的 AbortSignal 剥掉。useRun({signal: true}) 每次 run
//   都在尾部附加一个新 signal，若让它进 key，同一参数的缓存/去重条目
//   会被拆散——['x', sig] 与 ['x']（如 refetch 的 cache.delete(args) 对
//   useRun 存下的带 signal 条目）必须归一为同一 key。
// 2. 递归剥掉对象里值为 undefined 的键：{tag: undefined} 与 {} 同 hash。
//   这是「key 形状耦合」的结构性修复——loader 侧拿 schema 输出（缺省
//   字段无键），视图侧拿组件状态（缺省字段常是 undefined 属性），归一
//   后两侧永远同 key，不再依赖调用方手工保持「形状完全一致」。
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

// 每实体一 cache：值类型与 key 元组类型都在 cache 上收紧（peek 不再需要
// as 断言，key 写错形状编译期暴露），'article' 这类魔法字符串前缀随之
// 消失——身份就是 cache 绑定本身。cacheTime 缺省 5min（per-entry 逐条
// 回收），低频全局实体可单独放长（见 tagsCache）。
// EntityCache 把 mutation/patchWhere 从可选收成必有：createQueryCache
// 恒由 createMemoryCacheProvider 创建（运行时必然携带），调用方零断言。
export type EntityCache<T, K extends unknown[]> = CacheProvider<T, K> & {
  mutation: <Args extends any[], Resp>(
    spec: (...args: Args) => MutationSpec<T, K, Args, Resp>
  ) => BoundMutation<Args, Resp>;
};

// ---- 每实体缓存注册表 ------------------------------------------------------

// 新建实体 cache 即自动登记（createQueryCache 工厂内 push）：登出清场
// （clearAllCaches 遍历）与 DevTool 面板遍历都以注册表为唯一事实来源——
// 消灭「新 cache 忘记登记」的手工不变量，也消灭 DevTool 按数组下标给
// allCaches 配名的脆弱耦合（新增实体即自动带上名字）。
export type CacheRegistryEntry = {
  name: string;
  cache: EntityCache<any, any[]>;
};

// 模块加载即填充：下方实体 cache 的创建语句逐个 push 进这同一个数组，
// 导出的就是该引用——测试等处后建的临时 cache 同样可见。类型收窄为
// EntityCache<any, any[]>：注册表只服务遍历（clear/snapshot/subscribe），
// 不做逐条寻址，值/key 元组类型在此无意义。
export const allCaches: CacheRegistryEntry[] = [];

// 持久化 cache 的登出擦盘回调：storageKey → wipe。clearAllCaches 清完
// 内存后逐个执行——下个账号冷启动不得 hydrate 回上个账号的数据。
const persistWipes = new Map<string, () => void>();

// 冷启动持久化挂载：localStorage 单键镜像（整表快照，一次序列化）。
// - 启动时（cache 创建处）同步 hydrate：读盘 → JSON.parse → 形状粗验，
//   坏 JSON / 结构性坏数据 / 隐私模式异常一律静默丢弃，模块加载路径上
//   不允许存储层炸掉。hydrate 保留条目原 cachedAt——重启后条目的
//   「年龄」是真实年龄，天然越过 staleTime，首次消费旧值先行 + 后台
//   重验证（SWR 语义），不会把陈旧数据当新鲜用。
// - 落盘：订阅 cache 事件（set/delete/clear/deletePrefix/过期统一触
//   发），每次变更后把 dehydrate 快照（仅 settled 条目）写回；配额
//   超限/非 JSON 安全值吞掉，内存 cache 仍是权威。
// - 擦盘：回调登记进 persistWipes，由 clearAllCaches 统一执行（见其
//   注释：先清内存后擦盘的顺序约束）。
const attachPersistence = (cache: EntityCache<any, any[]>, key: string) => {
  const storage = (() => {
    try {
      // 可用性探测：SSR 无 window、隐私模式 setItem 直接抛。探测失败
      // 退化为纯内存 cache，匿名/受限环境照常运行。
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
      const data: unknown = JSON.parse(raw);
      // 形状粗验：Record<string, [unknown, number]>。条目值本身不深检
      // ——类型由写侧的 T 保证，这里拦的是结构性坏数据（手改/截断/
      // 旧 schema），不合格整体丢弃而非逐条抢救。
      if (
        data !== null &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Object.values(data).every(
          (e) => Array.isArray(e) && e.length === 2 && typeof e[1] === 'number'
        )
      ) {
        cache.hydrate?.(data as Record<string, [any, number]>);
      }
    }
  } catch {
    // 坏 JSON：宁可空开始也不抛。
  }

  cache.subscribe?.(() => {
    try {
      storage.setItem(key, JSON.stringify(cache.dehydrate?.() ?? {}));
    } catch {
      // 静默降级：配额超限或非 JSON 安全值；内存 cache 保持正确。
    }
  });
  persistWipes.set(key, () => storage.removeItem(key));
};

export function createQueryCache<T, K extends unknown[]>(
  name: string,
  cacheTime = DEFAULT_CACHE_TIME,
  opts: {persist?: string} = {}
): EntityCache<T, K> {
  // 运行时成员齐全（memory provider 挂载 mutation/patchWhere），类型上
  // 经 unknown 收拢可选成员——见 EntityCache 注释
  const cache = createMemoryCacheProvider<T, K>({
    cacheTime,
    hash: hashArgs
  }) as unknown as EntityCache<T, K>;

  if (opts.persist) {
    attachPersistence(cache as EntityCache<any, any[]>, opts.persist);
  }
  allCaches.push({name, cache: cache as EntityCache<any, any[]>});
  return cache;
}

// ---- 每实体缓存注册表 ------------------------------------------------------

// 每实体一 cache：值类型与 key 元组类型都在 cache 上收紧（peek 不再需要
// as 断言，key 写错形状编译期暴露），'article' 这类魔法字符串前缀随之
// 消失——身份就是 cache 绑定本身。第一个参数是注册名：createQueryCache
// 工厂内自动 push 进 allCaches，登出清场与 DevTool 遍历零遇忘，也消灭
// 了 DevTool 按数组下标给 allCaches 配名的脆弱耦合。
/** 文章实体：key = [slug]，Article 视图与编辑写穿共用 */
export const articleCache = createQueryCache<Article, [string]>('article');
/** 首页信息流投影：key = [homeSearch]（hash 归一剥 undefined tag） */
export const homeCache = createQueryCache<ArticlePage, [HomeSearch]>('home');
/** 文章评论：key = [slug]，发评论后按 slug 失效重拉 */
export const commentsCache = createQueryCache<Comment[], [string]>('comments');
/**
 * 全局标签：key = []（单例条目）。
 *
 * 唯一持久化实体（localStorage 键 'painless.cache.tags'）。tags 全局
 * 低频变化（发文章才可能长出新 tag），却挂在首页等高频入口——cacheTime
 * 给长（1h，per-entry：单例条目持续被消费即不会被回收），内存 GC 窗口
 * 与盘侧生命周期尽量对齐，避免「内存侧已清、盘侧仍在」的不一致反复
 * 暴露成冷启动重拉。重启后 hydrate 回的条目保留原 cachedAt：年龄按真
 * 实年龄计，重启即越 staleTime，首次消费旧值先行 + 后台重验证（SWR
 * 语义），陈旧数据不会被当成新鲜值用。
 */
export const tagsCache = createQueryCache<string[], []>(
  'tags',
  60 * 60 * 1000,
  {persist: 'painless.cache.tags'}
);

// 登出清场用（DevTool 面板遍历同源）：遍历注册表逐实体清空 + 擦掉持久
// 化实体对应的 storage。顺序约束：先清内存后擦盘——cache.clear() 的
// delete 事件先让持久化镜像把空表写回，随后 removeItem 兜底删除（镜像
// 写入即便被配额等异常吞掉也不残留）。擦盘语义必须完整：下个账号冷启
// 动不得 hydrate 回上个账号的数据。
export const clearAllCaches = () => {
  for (const {cache} of allCaches) cache.clear();
  for (const wipe of persistWipes.values()) wipe();
};

export type MockConfig = {
  schema: unknown;
  key: string;
};

export type QueryOptions<T, K extends unknown[]> = {
  /**
   * 结果缓存提供者：必传——按实体选择 cache（见 allCaches 注册表）。
   * K 与 fetcher 参数元组挂钩（见 QueryKey）：cache 的 key 形状必须与
   * fn 的参数形状一致，拼错（如 fetcher 收 [slug: string] 而传
   * K=[number] 的 cache）在编译期报错，不再只靠 hash 归一在运行时兜底。
   */
  cache: EntityCache<T, K>;
  /** 缓存多久后标记为 stale（ms），默认 2000 */
  staleTime?: number;
  /** 初始数据，避免首屏取到 undefined */
  initData?: T;
  /**
   * 结果投影（useResultSelect）：消费者只订阅 select 后的切片——原始
   * 结果变化但切片不变时（useResultSelect 按「结果 + select」双重身份
   * memo）订阅组件不重渲染。select 的输入是 select 之前的原始数据，
   * initData 同样以原始数据注入、经 select 投影后返回。引用不稳定也
   * 安全：内部经 ref 透传首个 select，投影输出对同一结果保持引用稳定。
   */
  select?: (data: T) => unknown;
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
  /**
   * 无 select：查询结果（initData 兜底前为 undefined）；有 select：
   * select 投影后的切片（T 已在重载处实例化为投影返回值）。
   */
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

// select 重载：泛型 S 由调用点的 select 返回值推导，data 收窄为投影切片
//（initData 语义仍是「select 之前的原始数据」，见实现注释）。cache 的
// K 一律由 QueryKey<F> 推导：调用点只需让 cache 与 fn 同源，形状错配
// 编译期暴露。
export function useQuery<F extends AsyncFunc, S = R<F>>(
  fn: F,
  args: Parameters<F>,
  opts: QueryOptions<R<F>, QueryKey<F>> & {select: (data: R<F>) => S; initData: R<F>}
): QueryResult<S>;
export function useQuery<F extends AsyncFunc, S = R<F>>(
  fn: F,
  args: Parameters<F>,
  opts: QueryOptions<R<F>, QueryKey<F>> & {select: (data: R<F>) => S}
): QueryResult<S | undefined>;
export function useQuery<F extends AsyncFunc>(
  fn: F,
  args: Parameters<F>,
  opts: QueryOptions<R<F>, QueryKey<F>> & {initData: R<F>}
): QueryResult<R<F>>;
export function useQuery<F extends AsyncFunc>(
  fn: F,
  args: Parameters<F>,
  opts: QueryOptions<R<F>, QueryKey<F>>
): QueryResult<R<F> | undefined>;
export function useQuery<F extends AsyncFunc>(
  fn: F,
  args: Parameters<F>,
  {
    cache,
    staleTime = DEFAULT_STALE_TIME,
    initData,
    select,
    mock,
    retry
  }: QueryOptions<R<F>, QueryKey<F>>
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
  // miss/stale 重验证走实体 cache.load（原子 get-or-insert in-flight），
  // 同参数并发调用共享同一 promise——跨组件、跨通道（路由 loader 的
  // withCache 共用同一实体 cache）都只发一次请求。

  // useCache 对 provider 的期望形状随 AF 泛型延迟求值（R<AF>/Parameters<AF>），
  // 显式以 AsyncFunc 实例化后恰为 CacheProvider<any, any[]>——与模块级
  // QueryCache 完全一致，无需断言；cache 本就存任意值/任意参数（hashArgs
  // 归一），运行时安全。
  // useCache 的 F 泛型随 cache 参数延迟求值（R<F>/Parameters<F> 实例化
  // 分歧，且 cache 收紧为 QueryKey<F> 后与 Parameters<F> 在泛型内不可静态
  // 证明同构）：tsc 需要此断言收拢；eslint 的类型程序对同表达式解析不同，
  // 认为多余——按 tsc 为准，故不加 disable 注释。
  const stale = useCache(
    injectable as AsyncFunc,
    cache as unknown as Parameters<typeof useCache>[1],
    staleTime
  );

  // focus/可见性恢复时的后台重验证（react-query 的 refetchOnWindowFocus）：
  // bfcache 恢复、路由 viewStack 快照回放后数据可能过时，回到页面即对
  // miss/stale 条目重拉（新鲜期内 useCache 直接命中缓存，不发请求）。
  // args 必须与 useRun 同 key：focus 重验证寻址 [..args] 而非 []，否则
  // 是另一条请求线而非命中既有条目。
  useFocusRevalidate(injectable as AsyncFunc, {args});

  // 断网恢复时的后台重验证（react-query 的 refetchOnReconnect）：离线
  // 期间的请求多半失败，连接一恢复（window online 事件）就对 miss/stale
  // 条目重拉——与上面 focus 重验证同一 miss/stale 门槛（新鲜期内
  // useCache 直接命中，不发请求）；args 同样必须与 useRun 同 key，
  // 否则 reconnect 寻址 [..args] 之外是另一条请求线而非命中既有条目。
  // 不传 interval：与 focus 侧保持一致的节流语义（staleTime 已是天然
  // 门槛，fresh 条目零请求，无需额外节流窗口）。
  useReconnectRevalidate(injectable as AsyncFunc, {args});

  // initData 是 select 之前的原始数据：注入 useResultSelect 的 init 槽，
  // 首帧同样经 select 投影——有 select 的消费者拿到的 data 始终是切片，
  // 形状不随首个结果到达而切换。
  // select 透传给 useResultSelect（订阅粒度：切片不变不重渲染）。它对
  // 「结果 + select」双重身份 memo——但调用点的 select 常是每渲染新建的
  // 内联箭头（本项目未强制 useCallback），身份每变一次投影就重算一次，
  // 产出新引用的同时击穿 memo 的引用稳定保证。这里固定取首个 select：
  // 语义上投影函数本就该纯且与渲染周期无关，锁定身份即锁定 memo 桶。
  const selectRef = useRef(select);
  // R<F> 是延迟求值泛型，QueryOptions.select 的 unknown 返回在这里收拢
  const project = (selectRef.current ?? identity) as (result: R<F>) => R<F>;
  const data = useResultSelect<AsyncFunc, R<F> | undefined>(
    injectable,
    project,
    initData
  );
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
    // 为同一 key，delete 必然命中。args 含尾部 signal 而 QueryKey<F> 已
    // 剥离——泛型内不可静态证明同构（运行时 hash 归一等价），经 K 断言。
    cache.delete(args as unknown as QueryKey<F>);
    void injectable(...args);
  }, args as DependencyList);

  return {data, loading, fetching, error, stale, refetch};
}
