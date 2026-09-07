// Profile loader 与 Register 查重共用数据源；与 article.ts 同构。
import type {Author} from '@/types';

import {fillPath} from 'fetch-fun';

import * as http from '@/util/http';
import {envelope} from '@/util/jsonSchema';
import {authorSchema} from '@/types/index.schema';

// 值收 unknown：虚拟模块导出 any，防 any 沿对象字面量扩散。
const schemas: Record<string, unknown> | undefined = import.meta.env.DEV
  ? {profile: envelope('profile', authorSchema)}
  : undefined;

// schema 静态烘焙进链；signal 每请求经 withSignal 挂载（同 article.ts）。
const profileClient = http.withDevValidation(http.api, schemas?.profile);

// 200 {profile} / 404 不存在（ff.HTTPError 判别）；Register 查重复用。
export function fetchProfile(
  username: string,
  signal?: AbortSignal
): Promise<Author> {
  return http
    .get<{profile: Author}>(
      fillPath('profiles/{username}', {username}),
      undefined,
      http.withSignal(profileClient, signal)
    )
    .then(({profile}) => profile);
}
