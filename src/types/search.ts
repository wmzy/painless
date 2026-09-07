import type {StandardSchemaV1} from '@native-router/react';

import {writeSchema} from '@native-router/core';

// /（Home）search 契约：手写 Standard Schema（不引 schema 库）；校验必须同步（useSearch 约束）。

export const DEFAULT_LIMIT = 10;

export type HomeSearch = {
  tag?: string;
  offset: number;
  limit: number;
};

const positiveInt = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

// 读/写共用保证契约单点。
const parseHomeSearch = (input: unknown): HomeSearch => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const value: HomeSearch = {
    offset: positiveInt(raw.offset) ?? 0,
    limit: positiveInt(raw.limit) ?? DEFAULT_LIMIT
  };
  if (typeof raw.tag === 'string' && raw.tag !== '') value.tag = raw.tag;
  return value;
};

// Input 位只服务链接契约：offset/limit 放宽 string|number（写入 String() 化）。
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

// 从读 schema 派生（decisions.md #16）：先读契约 validate，再抹等于缺省与 undefined 的键。
export const homeSearchWriteSchema = writeSchema(homeSearchSchema, {
  offset: 0,
  limit: DEFAULT_LIMIT
});
