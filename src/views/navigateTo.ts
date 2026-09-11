// 命令式导航的类型化收口——TypedLink（decisions.md #23）的命令式侧对应
// 物。声明式侧 to 已收窄到 AppPaths 字面量联合、动态段强制 params；此前
// 命令式调用点仍是运行时字符串拼接（`/profile/${...}`），路径拼写与
// params 缺失都逃逸到生产运行时。插值与编码同 TypedLink 落点
// （link-behavior 的 interpolatePath：逐值 encodeURIComponent）——同一
// 路径「点链接」与「命令式跳转」产生同一 href。
// 刻意不走本封装的两类出口：
// - services/auth.ts（logoutAndNavigate / bindUnauthorizedRedirect）：
//   依赖方向——auth 被 views import，反向 import AppPaths 成环；服务层
//   也不该认识视图层的路由表。
// - Login 的 sanitizeRedirect 产物：目标是用户控制的任意站内路径
//   （白名单校验过），本就不是 AppPaths 的字面量联合成员。
import type {RouteParams} from '@native-router/react';
import type {RouterInstance} from '@native-router/core';

import type {AppPaths} from './index';

import {navigate} from '@native-router/core';


// 判别同库内 TypedLinkMember（types.d.ts）：静态 pattern
// （Record<never, never> extends RouteParams<P>）只收 search；参数化
// pattern 强制 params。「opts 可省」编码在 rest 元组长度上——参数化路径
// 缺第三参、静态路径塞 params 都是编译期错误（可选参数无法表达「整个
// opts 省略与否取决于 P」）。NoInfer 必不可少：rest 元组里的 RouteParams<P>
// 会成为 P 的推断源，把 path 侧的字面量候选污染成整个 AppPaths 联合
//（判别随之坍缩到静态臂），NoInfer 阻断后 P 只从 path 收窄。
type NavigateArgs<P extends AppPaths> =
  // 空 record 是刻意的：与库内 TypedLinkMember 的静态 pattern 判别式
  // 逐字对齐（`{}` extends 检查），改写形态会偏离库判别行为
  // eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type
  Record<never, never> extends RouteParams<P>
    ? [opts?: {search?: string}]
    : [opts: {params: NoInfer<RouteParams<P>>; search?: string}];

// interpolatePath 的本地同构实现：库未把它导出为公共 API
// （dist/components/link-behavior.js 深路径被 exports map 封锁），core
// 侧也无 params 插值函数——按库源码逐行为对齐：`:name` 取 string、
// `*name` 取 string[]（'/' 连接），逐值 encodeURIComponent；`\` 转义段
// 原样保留；缺失/空值抛错（漏 params 本应是编译错误，这里只兜绕过
// 类型面的调用）。
function interpolatePath(
  pattern: string,
  params: Record<string, string | string[]>
): string {
  return pattern.replace(
    /\\.|[:*]([A-Za-z_$][A-Za-z0-9_$]*)/g,
    (match, name: string | undefined) => {
      if (name === undefined) return match;
      const value = params[name];
      if (value === undefined || value.length === 0) {
        throw new Error(
          `Missing param "${name}" for the path pattern "${pattern}"`
        );
      }
      return (Array.isArray(value) ? value : [value])
        .map(encodeURIComponent)
        .join('/');
    }
  );
}

// appendSearch 的库语义：目标已有 '?' 用 '&' 续接，否则补 '?'；空/缺省
// 不追加。search 是原始 query 串，编码责任在调用方（TypedLink 的 search
// prop 走 schema 序列化，命令式侧无 schema 可依）。
function appendSearch(to: string, search: string | undefined): string {
  if (!search) return to;
  return `${to}${to.includes('?') ? '&' : '?'}${search}`;
}

// fire-and-forget：被取代/取消的导航链 reject NavigationCancelledError
// （core ≥1.15），.catch(() => undefined) 吞掉即「停在旧视图」语义
// （services/auth.ts 同款 idiom）。返回 void：调用点无从 await，也不会
// 有 rejection 漏进 unhandled 通道。
export function navigateTo<P extends AppPaths>(
  router: RouterInstance<any>,
  path: P,
  ...args: NavigateArgs<P>
): void {
  const {params, search} = (args[0] ?? {}) as {
    params?: Record<string, string | string[]>;
    search?: string;
  };
  const href = appendSearch(interpolatePath(path, params ?? {}), search);
  void navigate(router, href).catch(() => undefined);
}
