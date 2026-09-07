// 表单共享工具：验证器工厂（同步+异步）+ 服务端 422 回填。
// usernameAvailable 依赖 services 层查重端点（util → services 特例，无环）。
import type {FormInstance} from 'react-f0rm';

import type {ApiFieldErrors} from './apiError';

import {setServerErrors} from 'react-f0rm';

import {fetchProfile} from '@/services/profile';

import {parseApiError} from './apiError';

// 与 react-f0rm Field 的 validate 回调同形。
type Validator = (v: string) => string | undefined;

export function required(msg = 'This field is required'): Validator {
  return (v) => (v ? undefined : msg);
}

const EMAIL_RE = /\S+@\S+\.\S+/;

// 不负责必填：由调用方 compose(required, email) 决定。
export function email(msg = 'Invalid email'): Validator {
  return (v) => (EMAIL_RE.test(v) ? undefined : msg);
}

export function minLength(n: number, msg?: string): Validator {
  return (v) =>
    v.length >= n ? undefined : (msg ?? `Must be at least ${n} characters`);
}

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
// meta.signal 在轮次被超越时 abort；被取消轮次即使返回也被 lock 丢弃（库保证）。
type AsyncValidator = (
  v: string,
  meta: {signal: AbortSignal}
) => Promise<string | undefined>;

// 200 占用 / 404 可用；fail-open（除 AbortError 外放行），权威判定在 422 回填（decisions.md #11）。
export function usernameAvailable(
  msg = 'has already been taken'
): AsyncValidator {
  return (v, meta) =>
    fetchProfile(v, meta.signal).then(
      () => msg,
      (e: unknown) => {
        // 取消维持拒绝，让 useValidate 吞掉被超越轮次。
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        // 404 可用；其余结果未知同样放行。
        return undefined;
      }
    );
}

// 命中字段写 error 槽，顶部 Alert 只保留对不上字段；setServerErrors 默认先 clearErrors。
// 鸭子形状判别（不耦合 HTTP 库）：全落字段→隐藏；有落空→拼 `${field} ${message}`；非 422→e.message 兜底。
type ApiErrorLike = {
  status?: unknown;
  data?: {errors?: Record<string, unknown>};
};

// errors 归一共用 ./apiError（decisions.md #22）。
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
