import type {StandardSchemaV1} from '@native-router/react';

// / 路由（Home）的 search 契约：?tag=xxx&offset=20&limit=10。
// 手写 Standard Schema（zod / valibot / arktype 均实现该标准接口）——
// 模板不为此引入 schema 库，同时演示 @native-router 的 search 校验
// 对任何标准实现开放。校验必须同步完成（useSearch 约束）。

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

export const homeSearchSchema: StandardSchemaV1<unknown, HomeSearch> = {
  '~standard': {
    version: 1,
    vendor: 'painless',
    validate: (input) => {
      const raw = (input ?? {}) as Record<string, unknown>;
      const value: HomeSearch = {
        offset: positiveInt(raw.offset) ?? 0,
        limit: positiveInt(raw.limit) ?? DEFAULT_LIMIT
      };
      if (typeof raw.tag === 'string' && raw.tag !== '') value.tag = raw.tag;
      return {value};
    }
  }
};
