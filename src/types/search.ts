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

// 读侧核心：URL 输入（字符串世界）→ coerce + 补缺省。读/写两个 schema
// 共用，保证契约单点（useSetSearch 的写入同样先过这里）
const parseHomeSearch = (input: unknown): HomeSearch => {
  const raw = (input ?? {}) as Record<string, unknown>;
  const value: HomeSearch = {
    offset: positiveInt(raw.offset) ?? 0,
    limit: positiveInt(raw.limit) ?? DEFAULT_LIMIT
  };
  if (typeof raw.tag === 'string' && raw.tag !== '') value.tag = raw.tag;
  return value;
};

// URL 输入侧的 search 形状——读侧 schema 的 Input 位与写侧 schema 的
// Output 位共用一个口径：链接（TypedLink 的 search prop）与 useSetSearch
// 都把值 String() 化后序列化进 query，number/string 均是合法写入形态
//（coerce 交给 schema），故 offset/limit 放宽到 string | number。
// Input 位若是 unknown，native-router 的 RouteSearchInputOf 会把链接的
// search 契约退化为宽松 SearchInput（值仍是 string | string[]，但字段名
// 不查）；标注为本形状后字段拼错/多传在编译期即报。validate 的运行时
// 入参不受影响（Standard Schema 规范里 validate 恒收 unknown，Input 只
// 活在可选的 types 幻影对里），解析行为不变。
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

// useSetSearch 会把 schema 校验后的输出整体序列化进 URL，而读侧恒定补齐
// offset/limit 缺省（0/10）——直接复用读 schema 会把缺省值写脏 URL。写侧
// 先按读侧契约 coerce，再抹去等于缺省的字段：URL 保持「offset 为 0、
// limit 为缺省时不出现」的干净形态，读写共用同一契约。
export const homeSearchWriteSchema: StandardSchemaV1<unknown, HomeSearchInput> = {
  '~standard': {
    version: 1,
    vendor: 'painless',
    validate: (input) => {
      const {tag, offset, limit} = parseHomeSearch(input);
      return {
        value: {
          ...(tag !== undefined ? {tag} : {}),
          ...(offset !== 0 ? {offset} : {}),
          ...(limit !== DEFAULT_LIMIT ? {limit} : {})
        }
      };
    }
  }
};
