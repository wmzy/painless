// 公开档案实体服务：按 username 查档案（Profile 页路由 loader 与
// Register 用户名查重的共同数据源）。与 article.ts 同构——只读查询接
// 可选尾参 signal、路径参数经 fillPath、dev-only 响应校验 schema 整组
// 包在 import.meta.env.DEV 三元里（生产折叠摇出，见 article.ts 头注释）。
import type {Author} from '@/types';

import {fillPath} from 'fetch-fun';

import * as http from '@/util/http';
import {envelope} from '@/util/jsonSchema';
import {authorSchema} from '@/types/index.schema';

// 值类型 unknown：虚拟模块的导出是 any，unknown 槽位承接（校验侧自行
// 收窄），避免 any 沿着对象字面量扩散。
const schemas: Record<string, unknown> | undefined = import.meta.env.DEV
  ? {profile: envelope('profile', authorSchema)}
  : undefined;

// RealWorld 契约 GET profiles/{username}，无需鉴权（匿名可查），200
// 返回 {profile}（Author 形状），用户不存在时 404——非 2xx 由 http 层
// 统一映射为 ff.HTTPError（status/data 可判别），调用方据此区分
// 「占用 / 可用」。Register 的用户名异步查重正是复用该端点：200 = 已被
// 占用，404 = 可用（见 util/validators 的 usernameAvailable）。
// 路径参数经 fillPath：`{username}` 占位符在编译期约束参数集合，运行时
// 逐值 encodeURIComponent，用户名里的空格/斜杠/中文不依赖裸插值。尾参
// signal 透传给 fetch——被超越的校验轮次可撤销在途请求。
export function fetchProfile(
  username: string,
  signal?: AbortSignal
): Promise<Author> {
  return http
    .get<{profile: Author}>(
      fillPath('profiles/{username}', {username}),
      undefined,
      {signal, schema: schemas?.profile}
    )
    .then(({profile}) => profile);
}
