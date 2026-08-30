// dev-only 运行时校验执行侧：JSON Schema（@/types/index.schema 生成）
// → 可定位的错误。生产隔离与 ./faker 同款：本模块只被 DEV 分支内的
// 动态 import 引用（http.ts 的 Standard Schema 适配器、mock.ts 的
// always 分支），ajv 与本文件都不会进生产 chunk。
//
// issue 形状对齐 Standard Schema v1 的约定（message 字段）——fetch-fun
// 的 ValidationError 取首个 issue 的 message 当错误文案，所以 message
// 自带完整定位：请求 + 实例指针 + 期望 + 实际值。
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

// 编译缓存：key 是调用方传入的原 schema 对象（服务层/module 侧恒为
// 模块级常量，身份稳定），值是「剔除 mock 注解后的 schema + 编译产物」
//——同一 schema 只付一次 strip + compile 成本。
const cache = new WeakMap<object, {relaxed: object; validate: ValidateFunction}>();

async function entryFor(schema: object) {
  let entry = cache.get(schema);
  if (!entry) {
    if (!ajv) {
      const {default: Ajv} = await import('ajv');
      // strict:false：ts-json-schema-generator 会原样输出非标准注解
      //（@faker/@unique 等），ajv 严格模式会拒之门外；allErrors:true
      // 一次跑出全部失配点，而不是只报第一个。
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

/**
 * 校验一份数据是否满足 JSON Schema（剔除 mock 生成注解后）。
 * 成功返回 `{value: data}`（Standard Schema v1 成功形状，fetch-fun 的
 * validate 中间件会以它替换响应数据）；失败返回 `{issues}`，由中间件
 * 抛成 `ff.ValidationError`。schema 非对象（如手写桩）视为无契约，放行。
 */
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
