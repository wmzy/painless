// 公开档案实体服务（Profile loader 与 Register 查重共用数据源）。与 article.ts 同构：
// 尾参 signal / fillPath / dev-only 校验 schema 包 DEV 三元（见 article.ts）。
import type {Author} from '@/types';

import {fillPath} from 'fetch-fun';

import * as http from '@/util/http';
import {envelope} from '@/util/jsonSchema';
import {authorSchema} from '@/types/index.schema';

// 值收 unknown：虚拟模块导出 any，防 any 沿对象字面量扩散。
const schemas: Record<string, unknown> | undefined = import.meta.env.DEV
  ? {profile: envelope('profile', authorSchema)}
  : undefined;

// GET profiles/{username}（匿名可查），200 {profile} / 404 不存在（ff.HTTPError 判别）；
// Register 查重复用：200 占用 / 404 可用。路径经 fillPath；尾参 signal 透传。
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
