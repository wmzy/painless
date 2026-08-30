// 项目级数据获取层（模板示范：每个项目可按自身理念定制这一层）：机制 +
// 场景组装两部分，选项在场景声明点闭合、运行时调用点零 option（胶水层
// 决策与上移计划见 docs/decisions.md 第 2 条）。
// - 机制：每实体缓存 createQueryCache（创建即登记 allCaches 注册表，登出
//   清场 clearAllCaches 与 DevTool 遍历以注册表为唯一事实来源）+ 可选
//   localStorage 持久化挂载（决策见 docs/decisions.md 第 4 条）。
// - 组装：createQueryHook(config) 把 react-toolroom/async 的 useInjectable /
//   useCache / useRun / useResultSelect / useLoading / useArgsStatus /
//   useFocusRevalidate / useReconnectRevalidate 收敛为场景 hook——机制层
//   不预测用户场景，config（queryFn/staleTime/initData/mock）在创建时
//   全量闭合，未被调用点使用的 option（select/retry）按 YAGNI 不实现
//   （重试的传输层职责由 http 的 withRetry 承担）。
// 只留 why 的两点（行为细节归 react-toolroom README）：
// - loading 仅指初载（per-args 观测 + SWR 语义重建）：后台重拉不置 true，
//   已渲染内容不闪整屏 Spinner；任意 in-flight 见 fetching。
// - 结构共享（structural sharing）刻意不做：重验证低频（staleTime 门槛
//   拦截，新鲜期内连请求都不发）、页级重渲染廉价（reconcile 后通常无
//   DOM 变更），而 deep-equal 要在每次成功 fetch 付 O(payload)；热点组件
//   用标量 props + React.memo 局部解决（settle 后对象 prop 恒为新引用，
//   memo 边界上比较标量才有效，比较对象等于手写 deep-equal）。
import type {Article, ArticlePage, Comment} from '@/types';
import type {HomeSearch} from '@/types/search';

import {useCallback} from 'react';
import {
  createMemoryCacheProvider,
  isAbortSignal,
  stableHash,
  useArgsStatus,
  useCache,
  useFocusRevalidate,
  useInject,
  useInjectable,
  useLoading,
  useReconnectRevalidate,
  useResultSelect,
  useRun,
  type BoundMutation,
  type CacheProvider,
  type MutationSpec
} from 'react-toolroom/async';

import {useMock} from '@/util/mock';

// 默认 5min（对齐 TanStack Query gcTime）：per-entry 逐条回收（条目以
// lastUsedAt 计龄，get/peek/set/load/patchWhere/hydrate 触碰即刷新），
// 非旧版整表清空；低频全局实体可单独放长（见 tagsCache）。
const DEFAULT_CACHE_TIME = 5 * 60_000;
const DEFAULT_STALE_TIME = 2000;

// select 已按调用点裁剪，恒等投影是唯一投影：useResultSelect 只要结果
// 存在就会调 select，传 undefined 会在首个结果到达时抛「select is not a
// function」。模块级常量保证身份稳定——「结果 + select」双重身份的 memo
// 桶不随渲染击穿，恒等投影下输出即输入。
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
// 消失——身份就是 cache 绑定本身。
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

// 持久化载荷版本：{v: PERSIST_VERSION, data: <表>} 形态落盘。v 只在载荷
// 结构本身演进时才 +1；hydrate 按它门禁——版本不符与 v 引入前的旧格式
// （裸表）一律整体丢弃静默重来，刻意不做跨版本迁移：盘上是可重建的缓存
// 镜像而非事实数据源，丢弃的代价只是一次冷启动重拉，低于长期维护迁移
// 路径的成本。
const PERSIST_VERSION = 1;

// 载荷 data 表的形状粗验：Record<string, [unknown, number]>。条目值本身
// 不深检——类型由写侧的 T 保证，这里拦的是结构性坏数据（手改/截断/旧
// schema），不合格整体丢弃而非逐条抢救。
const isPersistTable = (v: unknown): v is Record<string, [unknown, number]> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).every(
    (e) => Array.isArray(e) && e.length === 2 && typeof e[1] === 'number'
  );

// 冷启动持久化挂载：localStorage 单键镜像（整表快照，一次序列化）。
// 启动同步 hydrate（版本门禁 + 形状粗验，坏 JSON / 隐私模式异常静默丢弃
// ——模块加载路径上不允许存储层炸掉）；hydrate 保留条目原 cachedAt——
// 重启后条目的「年龄」是真实年龄，天然越过 staleTime，首次消费旧值先行
// + 后台重验证（SWR），不会把陈旧数据当新鲜用。跨 tab：storage 事件清
// 本 tab 内存、消费者重拉服务端真相（不 hydrate 别 tab 的盘上字节）。
// 决策背景见 docs/decisions.md 第 4 条。
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
      const parsed: unknown = JSON.parse(raw);
      // 版本门禁：只认当前版本的 {v, data} 包。旧格式（v 引入前的裸
      // dehydrate 表）与版本不符的载荷都走「静默丢弃 + 空开始」。
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as {v?: unknown}).v === PERSIST_VERSION &&
        isPersistTable((parsed as {data?: unknown}).data)
      ) {
        cache.hydrate?.((parsed as {data: Record<string, [any, number]>}).data);
      }
    }
  } catch {
    // 坏 JSON：宁可空开始也不抛。
  }

  cache.subscribe?.(() => {
    try {
      // 写前 diff 盘上现值（实时 getItem，非缓存的上次写值）：收到其它
      // tab 的 storage 事件后 clear 的 delete 事件会把空表写回，若不 diff
      // 直接 setItem，其它 tab 又收到事件再 clear，形成乒乓——同值跳过
      // 让链路一轮收敛（浏览器对「同值 setItem 不再广播」并无一致保证，
      // 以显式 diff 收敛，不依赖该实现细节）。
      const next = JSON.stringify({
        v: PERSIST_VERSION,
        data: cache.dehydrate?.() ?? {}
      });
      if (next !== storage.getItem(key)) storage.setItem(key, next);
    } catch {
      // 静默降级：配额超限或非 JSON 安全值；内存 cache 保持正确。
    }
  });

  // 跨 tab 同步：storage 事件只在「其它文档」改动本键时派发到本 tab。
  // newValue 有值（别 tab 的新镜像）与 null（removeItem，登出擦盘）两种
  // 情形的正确动作相同：清本 tab 内存，消费者 miss/stale 重拉、由服务端
  // 重建真相。监听与 cache 同生命周期，不随登出摘除（clearAllCaches 只
  // 擦盘；登出后公共实体照常跨 tab 同步）。
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

// ---- queryFn：绑定 cache 的取数入口 ----------------------------------------

// queryFn = service 函数原样携带其实体 cache（bindQueryFn 用 Object.assign
// 挂属性——函数身份与 fn.name 都不变，DevTool 具名注册的 Function 列依赖
// fn.name）。「fetch × cache 配对」只闭合一次：路由 loader（withCache）、
// 场景 hook（createQueryHook）与 mutation 写穿从同一绑定取同一 cache 寻址。
// 不变量：一个 service 函数只绑一个 cache（重复绑定后者覆盖）——本仓库
// 每实体一 cache，不存在同函数多 cache 的场景。
export type QueryFn<T, K extends unknown[]> = ((
  ...args: [...K, signal?: AbortSignal]
) => Promise<T>) & {
  cache: EntityCache<T, K>;
};

export function bindQueryFn<T, K extends unknown[]>(
  fetch: (...args: [...K, signal?: AbortSignal]) => Promise<T>,
  cache: EntityCache<T, K>
): QueryFn<T, K> {
  return Object.assign(fetch, {cache});
}

// ---- 场景 hook 工厂 ---------------------------------------------------------

export type QueryResult<T> = {
  /**
   * 查询结果（initData 兜底，首个结果到达前为 undefined——声明了
   * initData 的场景经条件类型收窄为非空）。
   */
  data: T;
  /**
   * 初载中（对齐 TanStack Query 的 isLoading）：当前 args 有请求
   * in-flight 且尚无本 args 的结果。已有结果后的重拉（缓存过期后台
   * 刷新、invalidate / refetch 触发）不会置 true——已渲染内容保持
   * 原样，不闪整屏 Spinner。
   */
  loading: boolean;
  /** 任意 in-flight（含已有结果后的后台重拉）；需要细化加载指示时用 */
  fetching: boolean;
  error: Error | undefined;
  /**
   * 本参数自上次成功以来的失败次数（per-args 观测）：每次失败 +1，
   * 同参数成功即归零。用于重试提示（「第 N 次失败」）与失败降级 UI
   * 的阈值判断。
   */
  failureCount: number;
  stale: boolean;
  /** 删除当前 args 的缓存条目后重新请求（引用稳定） */
  refetch: () => void;
};

// 场景声明点的全部选项：创建时闭合，之后不可变。cache 不在其中——它
// 已由 queryFn 携带（见 QueryFn），组装点不重复配对。queryFn 在此收宽
//（cache 属性为 unknown）：EntityCache 的成员在 K 上逆变，any 实参化
// 反而不可赋值；具体 T/K 经 config 字面量的 C 推导保留（SceneArgs/
// SceneData 从 C 上取），initData 的形状核对随之由运行时首帧兜底。
export type QueryHookConfig = {
  queryFn: ((...args: any[]) => Promise<any>) & {cache: unknown};
  /** 缓存多久后标记为 stale（ms），默认 2000 */
  staleTime?: number;
  /** 初始数据，避免首屏取到 undefined；声明后 data 类型收窄为非空 */
  initData?: unknown;
  /**
   * 接入 DevTool mock 面板（useMock）。做成配置项而非暴露 injectable
   * 给调用方自行 useMock 的原因：mock 中间件必须注册在 useCache 内层
   * （直接包住原始请求函数），面板的 Refresh / always / empty 模式才有
   * 效——调用方在缓存外层垫 mock 会出现「缓存命中时 mock 失效、mock
   * 命中时结果又进不了缓存」。
   */
  mock?: MockConfig;
};

// 类型推导（调用点零重载的代价在工厂签名上付）：args 元组从 queryFn 参数
// 剥尾参可选 signal（与 hashArgs 的运行时归一同构——类型层只识别「元组
// 尾部的可选 signal」，非尾部混入退化为运行时 hash 归一）；data 是否非空
// 由「声明了 initData」的条件类型决定——initData / 无 initData 的重载对
// 就此消失，调用点只剩 (args) => QueryResult。
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
  // cache 由 queryFn 携带（收宽见 QueryHookConfig 注释，实现体按实体
  // cache 的全形状使用）
  const cache = queryFn.cache as EntityCache<any, any[]>;

  return (args: unknown[]): QueryResult<unknown> => {
    // 具名注册（react-toolroom ≥0.16）：useInjectable(queryFn, {name}) 把
    // 实例发布进模块级具名注册表（组件卸载自动注销，重名实例共存）——
    // <InjectDevTools /> 不传 injectables 时观察全部具名实例，DevTool 面板
    // 借此看到场景 hook 发起的真实调用。名字取 queryFn.name（本仓库
    // queryFn 全是具名 service 函数）；匿名函数兜底 'query'。
    const injectable = useInjectable(queryFn, {name: queryFn.name || 'query'});

    // 洋葱注册顺序（先注册在内层）：mock 最内直接包住原始 fn，往上
    // cache——mock 垫在缓存内层是 DevTool 面板 Refresh / always / empty
    // 模式生效的前提（见 QueryHookConfig.mock 的论证）。mock 是创建时
    // 闭合的常量，按有无条件调用不违反 hooks 规则（useMock 内部只有
    // useInject，无 React hook）。
    if (mock) {
      useMock(
        injectable as unknown as (...params: unknown[]) => Promise<unknown>,
        mock.schema,
        mock.key,
        cache
      );
    }

    // （useDedup 已删）并发去重由 provider.load 内建：useCache 的 miss/
    // stale 重验证走实体 cache.load（原子 get-or-insert in-flight），同参
    // 数并发调用共享同一 promise——跨组件、跨通道（路由 loader 的
    // withCache 共用同一实体 cache）都只发一次请求。
    const stale = useCache(injectable, cache, staleTime);

    // focus / 断网恢复重验证（react-query 的 refetchOnWindowFocus /
    // refetchOnReconnect）：bfcache 恢复、回到页面、离线转在线时对
    // miss/stale 条目后台重拉。args 必须与 useRun 同 key——否则是另一条
    // 请求线而非命中既有条目；新鲜期内 useCache 直接命中，两处零请求。
    useFocusRevalidate(injectable, {args});
    useReconnectRevalidate(injectable, {args});

    // initData 注入 useResultSelect 的 init 槽：首帧即有兜底值（不落
    // result store，初载语义的 loading 仍如实为 true）。
    const data = useResultSelect(injectable, identity, initData);
    const fetching = useLoading(injectable);

    // per-args 观测（loading/error/failureCount 按 args key 独立）：同一
    // queryFn 并发服务多组参数时互不串扰；loading 在其上重建 SWR 初载
    // 语义——keyedLoading 只说「本参数有调用在飞」，叠加「本参数尚无结
    // 果」（status.data 仅在共享结果的 provenance 匹配当前 args 时非空）
    // 才是初载。error 同理按 args 独立：其它参数的失败不串到本参数的
    // 屏上，同参数成功即清除。（ArgsStatus 的字段类型是 any——经成员
    // 访问 + 断言收拢，不解构。）
    const argsStatus = useArgsStatus(injectable, args);
    const loading = argsStatus.loading && argsStatus.data === undefined;
    const error = argsStatus.error as Error | undefined;
    const failureCount = argsStatus.failureCount;

    // 兜底：useError 的中间件在记录错误后会重抛。这里在最外层接住，
    // 让 useRun / refetch 的调用不产生悬空 rejection——错误统一从
    // 返回值 error 里读。
    useInject(injectable, (f) =>
      ((...callArgs: Parameters<typeof queryFn>) =>
        f(...callArgs).catch(() => undefined)) as typeof queryFn
    );

    // signal: true：每次 run 在 args 尾部附加 AbortSignal，args 变化或卸载
    // 时 abort 上一次（经服务层尾参透传到 fetch）；hash 让「结构变化」取代
    // 引用相等作为重跑依据——内联对象字面量做 args 不会每渲染重发。
    useRun(injectable, args, {signal: true, hash: hashArgs});

    const refetch = useCallback(() => {
      // useRun 存下的条目带 signal 尾参，hashArgs 剥离后与本处 args
      // 归一为同一 key，delete 必然命中。
      cache.delete(args);
      void injectable(...args);
    }, args);

    return {data, loading, fetching, error, failureCount, stale, refetch};
  };
}
