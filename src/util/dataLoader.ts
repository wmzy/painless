// 路由 data 管道的收敛工厂：把「withCache 双通道缓存 → DevTool mock →
// 路由 data」三层包装、视图侧取数、组件通道取数入口收拢为一次
// createDataLoader 声明——路由表只挂 loader 引用，视图不再手写
// useData<T>()! / ?? undefined 的来源断言与泛型手工标注。库侧
// （@native-router/react ≥1.11）为裸 useData 消费者提供了类型工具
// RouteDataOf<S>（useData<RouteDataOf<typeof loadX>>，从 loader 引用
// 推导返回类型）；本工厂不需要它——T 从 fetch 声明直接流进 UseData<T>，
// 与 RouteDataOf<typeof loader> 已验证逐类型等价，且额外绑定「声明
// 身份」（route.data === loader 的 DEV 校验），见 decisions.md 第 15 条。
// 【归宿已定】本工厂与 useQuery / loaderCache 同属项目级胶水层：2026-09-01
// 评估后不抽包、常驻模板（docs/decisions.md 第 13 条补记）；三元组形态
// （loader / useData / queryFn）+ 场景层组装（createQueryHook，绑定见
// services/dataloaders.ts）曾完成独立包预演（未发布）——第 8 条记录了 DEV
// 来源校验选「声明身份」而非「结果指纹」的论证。
import {useData as useRouteData, useMatched} from '@native-router/react';

import {withCache, type LoaderCtx} from './loaderCache';
import {mockViewData} from './mock';
import {bindQueryFn, type EntityCache, type QueryFn} from './useQuery';

// 路由 data loader：ctx 即 @native-router 的 loader 上下文（search/params/
// signal/router 按路由异构，宽松形状见 loaderCache 的 LoaderCtx）
export type DataLoader<T> = (ctx: LoaderCtx) => Promise<T>;

// 视图取数 hook：
// - 无参调用：返回 T——路由声明了本 loader，进组件前数据必已 resolve
//   （pending/error 由 pendingComponent/errorComponent 接管），视图层
//   不再写 ! 断言；
// - {optional: true}：返回 T | undefined——共用组件的路由可能不挂 data
//   （如 /editor 新建态之于 /editor/:slug），无 loader 也合法。
// optional 与否是「路由是否保证有值」的语义差异，用重载体现在返回类型
// 上——原 useData<T>()! 的 ! 正是模板里手写的这个语义，工厂内一次性收拢。
export type UseData<T> = {
  (opts?: {optional?: false}): T;
  (opts: {optional: true}): T | undefined;
};

export function createDataLoader<T, K extends unknown[]>(
  spec: {
    // 参数化 service 函数：与 queryFn 同形状（尾参可选 signal——useRun
    // 的 {signal: true} 与路由 ctx.signal 都从这里透传到 fetch）
    fetch: (...args: [...K, signal?: AbortSignal]) => Promise<T>;
    // K 的契约源（现状约定）：cache 的 key 元组形状即 K——fetch 的参数
    // 元组、keyOf 的返回形状都向它看齐，错形状编译期暴露
    cache: EntityCache<T, K>;
    // 从路由 ctx 提取 key 元组：key 的定义只此一处，mutation 侧经
    // cache.mutation 寻址同一实体。ctx 收 any：按本路由的实际形状解构
    // （同 withCache 的约定）
    keyOf: (ctx: any) => K;
    staleTime?: number;
    mock?: {schema: unknown; key: string};
  }
): [DataLoader<T>, UseData<T>, QueryFn<T, K>] {
  const {fetch, cache, keyOf, staleTime, mock} = spec;

  // 桥接：路由 ctx → service 参数元组（[...keyOf(ctx), signal]）。三层由
  // 内到外：withCache（双通道缓存/SWR/预取共享 in-flight）→ mockViewData
  //（DevTool 造数，PROD 原样旁路）——与收敛前路由表里手写的包装顺序一致
  //（mock 在最外层：只有透传的真实数据才进缓存，faker 造数不污染缓存）。
  const cached = withCache(
    cache,
    keyOf,
    (ctx: LoaderCtx) => fetch(...keyOf(ctx), ctx.signal),
    staleTime !== undefined ? {staleTime} : undefined
  );
  // loader 即路由表要挂的引用——身份校验闭包绑定它
  const loader: DataLoader<T> = mock
    ? mockViewData(cached, mock.schema, mock.key)
    : cached;

  // 视图取数 + DEV 来源校验。校验的是「声明身份」而非「结果指纹」：
  // route.data === loader 证明本视图读的值就是本 loader resolve 出的值
  //（native-router resolve-view 直接调用 route.data(ctx)，loader 引用
  // 原样保存在 matched 上；viewStack 的 POP 回放保留原快照的
  // MatchedContext，往返后校验依然成立）。WeakMap<loader, result> 的指纹
  // 方案已否决——同 loader 不同参数的 POP 交叉、乐观写穿、SWR 旧值先行
  // 三个场景都会误报（论证见 docs/decisions.md 第 8 条）。useMatched 的
  // 调用保持无条件（hooks 规则），校验块整体包 import.meta.env.DEV：
  // vite define 常量折叠 + 摇树，生产产物不含比较与报错文案（与
  // DevTool/faker/mock 的既有先例同款）。
  const useDataHook = (opts?: {optional?: boolean}): T | undefined => {
    const value = useRouteData<T>();
    const matched = useMatched();
    if (import.meta.env.DEV) {
      // matched 的标注是非空，但路由外渲染（无 Provider）时运行时是
      // undefined——就地收宽后 optional chain 兜住（视同失配）；index
      // 取值仍走原非空标注，链上空值检查两侧都对齐
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

  // 组件通道取数入口：fetch × cache 在此绑定（bindQueryFn），场景 hook
  // 的组装（createQueryHook）移到应用绑定层（services/dataloaders.ts）——
  // 机制层不预测用户场景，选项（initData/mock/staleTime）在场景声明点
  // 闭合，运行时调用点零 option。
  const queryFn = bindQueryFn(fetch, cache);

  // useDataHook 的 T | undefined → UseData<T>（optional 重载的语义收窄）
  // 需断言收拢：泛型实现体内不可静态证明（运行时语义由路由声明保证）
  return [loader, useDataHook as UseData<T>, queryFn];
}
