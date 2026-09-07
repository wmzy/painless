import type {StandardSchemaV1} from '@native-router/react';

import {writeSchema} from '@native-router/core';

// /（Home）search 契约：手写 Standard Schema（不引 schema 库）；校验必须同步（useSearch 约束）。

export const DEFAULT_LIMIT = 10;

export type HomeSearch = {
  tag?: string;
  /** 页偏移，缺省 0 */
  offset: number;
  /** 页大小，缺省 10 */
  limit: number;
};

const positiveInt = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

// 读侧：URL 输入 → coerce + 补缺省；读/写共用保证契约单点。
const parseHomeSearch = (input: unknown): HomeSearch => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const value: HomeSearch = {
    offset: positiveInt(raw.offset) ?? 0,
    limit: positiveInt(raw.limit) ?? DEFAULT_LIMIT
  };
  if (typeof raw.tag === 'string' && raw.tag !== '') value.tag = raw.tag;
  return value;
};

// 读侧 schema 的 Input 位（只服务链接契约）：offset/limit 放宽 string|number（写入 String() 化后进 query）。
// 标注后字段拼错/多传编译期报（unknown 会退化为宽松 SearchInput）；validate 恒收 unknown，解析行为不变。
export type HomeSearchInput = {
  tag?: string;
  offset?: string | number;
  limit?: string | number;
};

export const homeSearchSchema: StandardSchemaV1<HomeSearchInput, HomeSearch> = {
  '~standard': {
    version: 1,
    vendor: 'painless',
    validate: (input) => ({value: parseHomeSearch(input)})
  }
};

// 写侧由 writeSchema 从读 schema 派生（decisions.md #16）：先经读契约 validate，再抹等于缺省
// 与 undefined 的键（URL 干净形态 + 往返不变量由库保证）。
export const homeSearchWriteSchema = writeSchema(homeSearchSchema, {
  offset: 0,
  limit: DEFAULT_LIMIT
});
