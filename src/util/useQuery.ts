// 项目级数据获取层：机制（每实体缓存 createQueryCache + allCaches 注册表 +
// 可选 localStorage 持久化——react-toolroom ≥0.23 的 opts.persist 透传，
// 语义官方化见 docs/decisions.md 第 4 条补记）与场景组装（createQueryHook，
// 选项在场景声明点闭合、运行时调用点零 option）。归宿已定（2026-09-01）：
// 评估后不抽包、常驻模板，见 docs/decisions.md 第 2/13 条；loading /
// select / 结构共享的语义取舍与 bindQueryFn 绑定机制见第 9 条。
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
  type MutationSpec,
  type PersistOptions
} from 'react-toolroom/async';

import {useMock} from '@/util/mock';
import {getMockConfigs} from '@/util/mock-config';

import {DEFAULT_STALE_TIME, resetRefreshSeen} from './loaderCache';


// 对齐 TanStack Query 的 gcTime 默认值；低频全局实体可单独放长（见 tagsCache）
const DEFAULT_CACHE_TIME = 5 * 60_000;

// select 已按调用点裁剪，恒等投影是唯一投影：useResultSelect 只要结果存在
// 就会调 select，传 undefined 会在首个结果到达时抛「select is not a
// function」；模块级常量保证 select 身份稳定（「结果 + select」双重身份的
// memo 桶不随渲染击穿）。
const identity = <T,>(r: T) => r;

// 统一 hash 的归一层，缺一则同一参数会被拆成不同 key：
// 1. 剥掉混入的 AbortSignal（useRun({signal: true}) 每次 run 附加）——
//   顶层参数位与对象参数内嵌的一样递归剥：判定与 react-toolroom 的
//   isAbortSignal 同源（instanceof + 跨 realm 鸭子探测，不用 instanceof
//   直判），否则 refetch 的 cache.delete(args) 与 useRun 存下的带
//   signal 条目不同 key；嵌在对象参数里的 signal 同样拆 key——
//   stableHash 只把 signal 值折叠为固定占位，多出的键仍参与结构比较；
// 2. 递归剥掉对象里值为 undefined 的键——loader 侧拿 schema 输出（缺省
//   字段无键），视图侧拿组件状态（缺省字段是 undefined 属性），归一后
//   两侧永远同 key。
const stripVolatile = (v: unknown): unknown => {
  if (isAbortSignal(v)) return undefined;
  if (Array.isArray(v)) {
    return v.filter((e) => !isAbortSignal(e)).map(stripVolatile);
  }
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const next = stripVolatile(val);
      if (next !== undefined) out[k] = next;
    }
    return out;
  }
  return v;
};
const hashArgs = (args: unknown[]) => stableHash(stripVolatile(args));

// mutation 从可选收成必有：createQueryCache 恒由 createMemoryCacheProvider
// 创建（运行时必然携带），调用方零断言。值类型与 key 元组类型都在 cache 上
// 收紧——peek 不需要 as，key 写错形状编译期暴露。mutation 用方法简写而非
// 属性签名：方法参数按双变检查（react-toolroom ≥0.18.3 起 CacheProvider 全
// 成员同款），具体 EntityCache<T,[string]> 才可赋给 EntityCache<any,any[]>
// 的槽位——品牌值与注册表得以保住精确类型（decisions.md 第 9 条）。
export type EntityCache<T, K extends unknown[]> = CacheProvider<T, K> & {
  mutation<Args extends any[], Resp>(
    spec: (...args: Args) => MutationSpec<T, K, Args, Resp>
  ): BoundMutation<Args, Resp>;
};

// ---- 每实体缓存注册表 ------------------------------------------------------

// 新建实体 cache 即在 createQueryCache 内自动登记：登出清场（clearAllCaches
// 遍历）与 DevTool 面板遍历都以注册表为唯一事实来源，新实体自动带上名字。
export type CacheRegistryEntry = {
  name: string;
  // K 收 any[]（react-toolroom ≥0.18.3 方法简写后具体元组 cache 可赋值，
  // 旧版逆变种被迫收 any 的槽位已收紧）；注册表只服务遍历，值类型无意义
  cache: EntityCache<any, any[]>;
};

// 模块加载即填充：下方实体 cache 的创建语句逐个 push 进同一个数组，导出的
// 就是该引用（测试等处后建的临时 cache 同样可见）。
export const allCaches: CacheRegistryEntry[] = [];

// 持久化挂起门（决策见 docs/decisions.md 第 12 条，react-toolroom ≥0.23
// opts.persist 的 enabled 回调）：mock always 激活期间挂起持久化读写——
// 组件通道的 useMock 垫在缓存内层（Refresh/always/empty 生效的前提，见
// QueryHookConfig.mock），faker 数据会 settle 进缓存，不拦的话会镜像落盘；
// 刷新后 mockConfig（内存态）重置 off，盘上假数据被 hydrate 回来即脱离
// 面板管理。任一 key always 即全挂起而非按 key 精确拦（持久化实体只有
// tagsCache，为它建 key→cache 映射收益为零；宁可少写不写脏——挂起窗口
// 漏写的镜像由下次写盘补上，写脏则刷新后永久呈现）。enabled=false 只拦
// 磁盘读写：内存缓存照常更新，登出擦盘（clear 内建的 removeItem）与跨
// tab 收敛不被它拦。导出供持久化实体声明点与持久化契约测试共用（同
// resetAllCaches 的测试工具先例）。
export const persistEnabled = () =>
  !Object.values(getMockConfigs()).some((c) => c.when === 'always');

export function createQueryCache<T, K extends unknown[]>(
  name: string,
  cacheTime = DEFAULT_CACHE_TIME,
  opts: {persist?: PersistOptions} = {}
): EntityCache<T, K> {
  // persist 透传库选项（react-toolroom ≥0.23 opts.persist，决策见
  // docs/decisions.md 第 4 条补记）：创建期同步 hydrate（版本门禁 +
  // 形状粗验 + 保留 cachedAt）、全事件镜像写盘写前 diff、跨 tab storage
  // 收敛、clear 擦盘、存储异常全静默——模板侧原 attachPersistence 的
  // 语义逐条上移，旧盘载荷 {v:1,...} 与库默认 version 1 兼容，无感迁移。
  // enabled=false 只拦磁盘读写，不拦内存与擦盘。
  const provider = createMemoryCacheProvider<T, K>({
    cacheTime,
    hash: hashArgs,
    persist: opts.persist
  });
  // clear 的代际包装：provider 的 clear 与单键 delete 发同形 delete 事件，
  // bindRefresh 的 seen 保留语义只挂单键 delete（refetch 链），整实体
  // clear 在此显式归零——否则登出/DevTool 清场后首轮导航 loader 的
  // miss settle 会被残留 seen 判成换值、排出的 refresh 劫杀在飞导航链
  //（e2e 实测；机制与分家论证见 loaderCache 的 resetRefreshSeen）。
  // 闭包风格包装不动 provider 其余成员（方法全走工厂闭包，无 this 依赖）
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
/** 文章评论：key = [slug]，发评论后按 slug 失效重拉 */
export const commentsCache = createQueryCache<Comment[], [string]>('comments');
/** 全局标签：key = []（单例条目）；唯一持久化实体，cacheTime 放长（1h）对齐盘侧生命周期 */
export const tagsCache = createQueryCache<string[], []>(
  'tags',
  60 * 60 * 1000,
  {persist: {key: 'painless.cache.tags', enabled: persistEnabled}}
);

// 持久化实体的擦盘内建在库版 clear（先写空表镜像再 removeItem 兜底，镜像
// 写入被配额等异常吞掉也不残留），clearAllCaches 只清内存即完成登出清场。
// 擦盘必须完整：下个账号冷启动不得 hydrate 回上个账号的数据。
export const clearAllCaches = () => {
  for (const {cache} of allCaches) cache.clear();
};

// 模块加载期实体登记完成后的注册表快照：resetAllCaches 的还原基线。
// 测试专用的临时 cache 会持续 push 进 allCaches（只增不减），跨用例累积
// 后 DevTool 面板遍历与 clearAllCaches 的 O(n) 都背着死实体——重置让
// 注册表回到「只有模块实体」的干净基线
const BASELINE_CACHES = allCaches.slice();

// 测试工具：clearAllCaches 全量清场（内存 + 擦盘，语义同登出）后把
// allCaches 注册表还原到模块加载基线——测试文件 beforeEach 用例间隔离
// 时，临时 cache 不再在注册表里累积，模块实体（article/home/comments/
// tags）仍登记在册：后续经应用代码触发的 clearAllCaches（logout、
// DevTool Clear、mock refresh 闭包）行为不变。
// 边界：cache 建在「测试文件模块级」时（import 期创建、用例间复用同一
// 实例并依赖 beforeEach 清其内容）不适合换用本工具——首轮 reset 会把它
// 出册，此后不再被任何 clear 覆盖，条目跨用例泄漏（dataLoader.test 的
// triple cache 即此形态，该文件刻意保留 clearAllCaches）
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

// fetch × cache 配对只在此闭合一次，路由 loader / 场景 hook / mutation 写
// 穿从同一绑定取同一 cache（机制见 docs/decisions.md 第 9 条）。[bound] 是
// 模块私有 unique symbol 的 phantom 品牌（零运行时）：普通 service 函数缺
// 品牌，编译期就进不了 createQueryHook。品牌值收 EntityCache<T, K>——
// react-toolroom ≥0.18.3 起 CacheProvider 成员全部方法简写（双变），具体
// QueryFn 对 QueryFn<any, any[]>（QueryHookConfig.queryFn 的类型）可赋值
// （旧版因 K 逆变被迫收 unknown，已随 0.18.4 升级收回精确类型）。
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

// 不变量：一个 service 函数只绑一个 cache。DEV 下换绑不同 cache 早抛
// 而非静默覆盖（风格对齐 getCache 的早抛先例）：覆盖的症状隐蔽——先绑
// 的场景 hook 运行时改读后绑的 cache，数据通道无声张冠李戴，dev 首跑
// 即暴露；重绑同一 cache 实例是幂等操作，不视为违约。生产（非 DEV）
// 维持后写覆盖：模板自身每个 fetch 只 bind 一次，违约只可能来自误写，
// 生产路径不为它付检查成本。
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

// 未绑定抛错而非返回 undefined：品牌约束被 any 断链绕过时（JS 调用方、测试
// 替身），早抛比深处「cache.get is not a function」更快指向「service 函数
// 忘经 bindQueryFn 配对」。
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
  /**
   * 本 args 最近一次成功 settle 的时间戳（Date.now()）。与 data 同源同
   * 契约（useArgsStatus 的 provenance）：展示中的结果确由当前 args 取得
   * 时为数字，否则 undefined（含「另一组 args 的结果正在展示」的窗口）。
   * 失败不触碰——同 args 重拉失败保留上一次成功的时间戳，「数据截至 T」
   * 跨错误态保持真话。TanStack Query dataUpdatedAt 的对应物；CommentList
   * 的「Updated x ago」新鲜度小字以它为数据源，发评论失效重拉后自动刷新。
   */
  dataUpdatedAt: number | undefined;
  /** 删除当前 args 的缓存条目后重新请求（绕过缓存；引用稳定，失败 resolve undefined 不 reject） */
  refetch: () => void | Promise<unknown>;
};

// 场景声明点的全部选项：创建时闭合，之后不可变；cache 不在其中——已由
// queryFn 绑定携带，组装点不重复配对。泛型 T 是场景数据类型（queryFn
// 的 resolve 类型，公开重载从 queryFn 实参推断）：initData 随之收紧到
// T——错形状（误用别场景的兜底值）在声明点即编译错，不再被 unknown 吞
export type QueryHookConfig<T = unknown> = {
  queryFn: QueryFn<T, any[]>;
  /** 缓存多久后标记为 stale（ms），默认 2000 */
  staleTime?: number;
  /** 初始数据，避免首屏取到 undefined；声明后 data 类型收窄为非空 */
  initData?: T;
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
type SceneArgs<C extends QueryHookConfig<any>> =
  C['queryFn'] extends (...args: [...infer K, signal?: AbortSignal]) => Promise<any>
    ? K
    : never;
type SceneData<C extends QueryHookConfig<any>> =
  | Awaited<ReturnType<C['queryFn']>>
  | (C extends {initData: unknown} ? never : undefined);

// 公开重载的双参接线：T 从 queryFn 推断场景数据类型，C 保留字面量形状
//（initData 是否声明决定 data 非空）；交集成员 {queryFn: QueryFn<T, any[]>}
// 让 C 的约束按推断出的 T 检查——initData 错形状在此报错
export function createQueryHook<T, C extends QueryHookConfig<T>>(
  config: C & {queryFn: QueryFn<T, any[]>}
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
    // 语义的 loading 仍如实为 true。注解 unknown 收口：实现重载的
    // queryFn 是 QueryFn<any, any[]>，R<AF> 链路保持 any 会沿返回对象
    // 扩散（对外类型由公开重载收窄，实现体内 unknown 足够）。
    const data: unknown = useResultSelect(injectable, identity, initData);
    const fetching = useLoading(injectable);

    // per-args 观测：loading/error/failureCount 按 args key 独立——同一
    // queryFn 并发服务多组参数时互不串扰；loading 在其上重建 SWR 初载语
    // 义（「本参数有调用在飞」叠加「本参数尚无结果」——status.data 仅在
    // 共享结果的 provenance 匹配当前 args 时非空）。挂载即认领实例错误
    //（读即认领，0.18.1）：调用失败在边界 resolve undefined，错误统一
    // 从返回值 error 读，useRun / refetch 不产生悬空 rejection。
    const argsStatus = useArgsStatus(injectable, args);
    const loading = argsStatus.loading && argsStatus.data === undefined;
    // ArgsStatus.error 自 react-toolroom 0.19 起按 E 泛型收紧（默认
    // Error | undefined）——直接透传，不再断言收口
    const error = argsStatus.error;
    const failureCount = argsStatus.failureCount;
    // 透传 per-args 的成功时间戳：provenance 契约由 useArgsStatus 把关
    //（data 为 undefined 的窗口它恒为 undefined），组装层零加工。
    const dataUpdatedAt = argsStatus.dataUpdatedAt;

    // signal: true：每次 run 在 args 尾部附加 AbortSignal，args 变化或卸载
    // 时 abort 上一次（经服务层尾参透传到 fetch）；hash 让「结构变化」取代
    // 引用相等作为重跑依据——内联对象字面量做 args 不会每渲染重发。
    useRun(injectable, args, {signal: true, hash: hashArgs});

    const refetch = useRefresh(injectable, args, cache);

    return {data, loading, fetching, error, failureCount, stale, refetch, dataUpdatedAt};
  };
}
