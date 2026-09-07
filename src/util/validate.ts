// dev-only 校验执行侧；ajv 经 DEV 分支动态 import 不进生产 chunk（decisions.md #7）。
import type {ValidateFunction} from 'ajv';
import type Ajv from 'ajv';

import {forResponse} from './jsonSchema';

export type ResponseIssue = {
  /** 定位标签，如 'GET articles' / 'mock articlePage' */
  label: string;
  /** 实例指针（JSON Pointer），如 '/articles/0/title' */
  path: string;
  /** 完整可读文案，供 ValidationError.message */
  message: string;
  schemaPath: string;
};

export type CheckResult =
  | {value: unknown}
  | {issues: ResponseIssue[]};

let ajv: Ajv | undefined;

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
    // 松弛副本也入 WeakMap，避免重复 strip。
    cache.set(relaxed, entry);
  }
  return entry;
}

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
