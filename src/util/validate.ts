// dev-only 运行时校验执行侧（JSON Schema → 可定位错误）；仅被 DEV 分支动态 import
//（ajv 不进生产 chunk，decisions.md #7）。issue 形状对齐 Standard Schema v1：
// message 自带完整定位（fetch-fun ValidationError 取首个 issue.message 当文案）。
import type {ValidateFunction} from 'ajv';
import type Ajv from 'ajv';

import {forResponse} from './jsonSchema';

export type ResponseIssue = {
  /** 请求定位标签，如 'GET articles' / 'mock articlePage' */
  label: string;
  /** 实例指针（JSON Pointer），如 '/articles/0/title' */
  path: string;
  /** 完整可读文案（含 label/path/期望/实际），供 ValidationError.message */
  message: string;
  /** 触发失败的 schema 指针（调试 schema 本身时用） */
  schemaPath: string;
};

export type CheckResult =
  | {value: unknown}
  | {issues: ResponseIssue[]};

let ajv: Ajv | undefined;

// 编译缓存：按原 schema 对象身份，同一 schema 只付一次 strip + compile。
const cache = new WeakMap<object, {relaxed: object; validate: ValidateFunction}>();

async function entryFor(schema: object) {
  let entry = cache.get(schema);
  if (!entry) {
    if (!ajv) {
      const {default: Ajv} = await import('ajv');
      // strict:false（生成 schema 含非标准注解）+ allErrors:true（一次报全部失配）。
      ajv = new Ajv({allErrors: true, strict: false, logger: false});
    }
    const relaxed = forResponse(schema) as object;
    entry = {relaxed, validate: ajv.compile(relaxed)};
    cache.set(schema, entry);
    // 松弛副本也进 WeakMap 身份映射，避免同一副本被再次 strip。
    cache.set(relaxed, entry);
  }
  return entry;
}

// 沿实例指针取实际值，截断序列化后进错误文案（「实际是什么」可定位）。
function actualAt(data: unknown, pointer: string): string {
  let node: unknown = data;
  for (const seg of pointer.split('/').slice(1)) {
    if (node == null || typeof node !== 'object') return '…';
    node = (node as Record<string, unknown>)[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  const json = JSON.stringify(node);
  const text = typeof json === 'string' ? json : String(node);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** 校验数据是否满足 JSON Schema（剔除 mock 注解）。成功 {value}（Standard Schema v1），
 * 失败 {issues}（中间件抛 ValidationError）；schema 非对象视为无契约放行。 */
export async function check(
  schema: unknown,
  data: unknown,
  label: string
): Promise<CheckResult> {
  if (schema === null || typeof schema !== 'object') return {value: data};
  const {validate} = await entryFor(schema);
  if (validate(data)) return {value: data};
  const issues = (validate.errors ?? []).map((e) => ({
    label,
    path: e.instancePath || '/',
    message: `${label}: 响应失配于 ${e.instancePath || '/'} — ${e.message ?? 'failed validation'}（实际值: ${actualAt(data, e.instancePath)}）`,
    schemaPath: e.schemaPath
  }));
  return {issues};
}
