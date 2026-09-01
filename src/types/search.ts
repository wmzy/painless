import type {StandardSchemaV1} from '@native-router/react';
import {writeSchema} from '@native-router/core';

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

// URL 输入侧的 search 形状——读侧 schema 的 Input 位（链接与 useSetSearch
// 的写入都把值 String() 化后序列化进 query，number/string 均是合法写入形态
//（coerce 交给 schema），故 offset/limit 放宽到 string | number。写侧
// schema 已改由 writeSchema 派生（见文件末尾），其 Output 是推断的
// 可选化投影，本形状只服务链接契约。
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

// 写侧 schema 由 @native-router/core ≥1.13 的 writeSchema 从读 schema 派生
//（此前是本文件手写的第二份 Standard Schema）：写入值先经读契约
// validate（coerce、补缺省），再抹去等于缺省的键与 undefined 键——URL
// 保持「offset 为 0、limit 为缺省时不出现」的干净形态，被抹后的 URL 读回
// 还原同一值（往返不变量由库保证）。读写共用同一契约、缺省表只此一处；
// 输出类型 WriteSearchOutputOf<HomeSearch, …> 自动推断（有缺省或本就
// 可选的键收为可选），手写的 StandardSchemaV1<unknown, HomeSearchInput>
// 注解随之删除。调用点（Tags/Home 的 useSetSearch）零改动。
export const homeSearchWriteSchema = writeSchema(homeSearchSchema, {
  offset: 0,
  limit: DEFAULT_LIMIT
});
