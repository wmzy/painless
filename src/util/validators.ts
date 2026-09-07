// 表单共享工具：字段验证器工厂（同步+异步）+ 服务端 422 回填。
// usernameAvailable 依赖 services 层查重端点（util → services 特例，profile 不回指本文件，无环）。
import type {FormInstance} from 'react-f0rm';

import type {ApiFieldErrors} from './apiError';

import {setServerErrors} from 'react-f0rm';

import {fetchProfile} from '@/services/profile';

import {parseApiError} from './apiError';

// 与 Field 的 validate 回调同形：返回错误文案表示未通过，undefined 通过
export type Validator = (v: string) => string | undefined;

// 必填校验：空字符串视为缺失
export function required(msg = 'This field is required'): Validator {
  return (v) => (v ? undefined : msg);
}

const EMAIL_RE = /\S+@\S+\.\S+/;

// 不负责必填：空值是否必填由调用方 compose(required, email) 决定。
export function email(msg = 'Invalid email'): Validator {
  return (v) => (EMAIL_RE.test(v) ? undefined : msg);
}

export function minLength(n: number, msg?: string): Validator {
  return (v) =>
    v.length >= n ? undefined : (msg ?? `Must be at least ${n} characters`);
}

// 组合子：按声明顺序执行，返回第一个命中的错误
export function compose(...validators: Validator[]): Validator {
  return (v) => {
    for (const validate of validators) {
      const error = validate(v);
      if (error !== undefined) return error;
    }
    return undefined;
  };
}

// ---- 异步校验器 -----------------------------------------------------------
// 对齐 react-f0rm validate 协议：meta.signal 在轮次被超越时 abort，透传撤销在途请求；
// 被取消轮次即使返回也被 useValidate lock 丢弃（库保证）。
export type AsyncValidator = (
  v: string,
  meta: {signal: AbortSignal}
) => Promise<string | undefined>;

// Register 用户名查重：200 占用 / 404 可用；fail-open——除 AbortError 外一切失败放行，
// 权威判定在提交时 422 回填（decisions.md #11）。
export function usernameAvailable(
  msg = 'has already been taken'
): AsyncValidator {
  return (v, meta) =>
    fetchProfile(v, meta.signal).then(
      // 200：档案存在 → 用户名已被占用
      () => msg,
      (e: unknown) => {
        // 取消非失败：维持拒绝，让 useValidate 吞掉被超越轮次（结果本也会被 lock 丢弃）
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        // 404 = 可用；其余（5xx/网络错/超时）结果未知，同样放行
        return undefined;
      }
    );
}

// 422 字段错误回填：命中字段写字段 error 槽，顶部 Alert 只保留对不上字段的部分。
// setServerErrors 默认先 clearErrors（新响应描述当前状态）。错误判别用鸭子形状
//（不 import http，表单工具不耦合具体 HTTP 库）。Alert 策略：全落到字段 → 隐藏；
// 有对不上字段 → 拼 `${field} ${message}`；非 422/无 errors → e.message 兜底。
type ApiErrorLike = {
  status?: unknown;
  data?: {errors?: Record<string, unknown>};
};

// 422 判别留在本地（鸭子形状只认错误对象），errors 归一共用 ./apiError（decisions.md #22）。
function fieldErrorsOf(e: unknown): ApiFieldErrors | undefined {
  const api = e as ApiErrorLike | null;
  if (!api || typeof api !== 'object' || api.status !== 422) return undefined;
  return parseApiError(api.data).fieldErrors;
}

export function applyApiFieldErrors(
  form: FormInstance,
  e: unknown,
  fields: readonly string[]
): string | null {
  const fieldErrors = fieldErrorsOf(e);
  const fallback = e instanceof Error ? e.message : String(e);
  if (!fieldErrors) return fallback;
  const entries = Object.entries(fieldErrors);
  if (!entries.length) return fallback;
  // matched 交 setServerErrors（type:'server'，默认先 clearErrors）；rest 拼上 Alert
  const matched: Record<string, string[]> = {};
  const rest: string[] = [];
  for (const [field, messages] of entries) {
    if (fields.includes(field)) {
      matched[field] = messages;
    } else {
      for (const m of messages) rest.push(`${field} ${m}`);
    }
  }
  setServerErrors(form, matched);
  return rest.length ? rest.join('; ') : null;
}
