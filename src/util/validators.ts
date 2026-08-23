// 表单层共享工具：字段验证器工厂 + 服务端 422 字段错误回填。
// Login/Register/Editor 三页此前各自手写 required/email/minLength 的
// validate 回调、并在 catch 里把服务端错误拼成一句话放顶部 Alert，
// 两处重复都在此收敛。
import type {FormInstance} from 'react-f0rm';

import {setError} from 'react-f0rm';

import {ApiError} from './http';

// 与 Field 的 validate 回调同形：返回错误文案表示未通过，undefined 通过
export type Validator = (v: string) => string | undefined;

// 必填校验：空字符串视为缺失
export function required(msg = 'This field is required'): Validator {
  return (v) => (v ? undefined : msg);
}

const EMAIL_RE = /\S+@\S+\.\S+/;

// 邮箱格式校验。注意不负责必填——是否把空值判为「必填」由调用方通过
// compose(required(...), email(...)) 决定，与原三页手写的 if 链语义一致。
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

// 服务端 422 字段错误回填：能对应到表单字段（fields）的错误写到该字段
// 的 error 槽位（由页面上的 FieldError 组件渲染在字段下方），顶部 Alert
// 只保留对不上字段的部分；返回值即 Alert 应显示的文案，null 表示不显示。
//
// 写入用 setError(form, name, error)：它是库导出的字段名版公开 API，
// 内部即 create(name) 构造 Path 后转调 setErrorByPath（dist 证据：
// setErrorByPath 签名为 (form, path: Path, error)，Path 是未导出工厂的
// 内部对象 {value, key}，直接传字段名字符串反而是错的）。
//
// Alert 策略（按合约「实现从简，选一种」）：全部错误都已落到字段 → 隐藏
// Alert；存在对不上字段的键（如登录 422 的 "email or password"）→ 这些
// 键按 `${field} ${message}` 拼接上 Alert，避免错误凭空消失；非 ApiError
// 或没有字段级错误 → 沿用 e.message 整句兜底。
export function applyApiFieldErrors(
  form: FormInstance,
  e: unknown,
  fields: readonly string[]
): string | null {
  if (!(e instanceof ApiError)) {
    return e instanceof Error ? e.message : String(e);
  }
  const entries = Object.entries(e.errors);
  if (!entries.length) return e.message;
  const rest: string[] = [];
  for (const [field, messages] of entries) {
    if (fields.includes(field)) {
      // 多条文案的拼接风格与服务端 errorText 保持一致（空格连接）
      setError(form, field, messages.join(' '));
    } else {
      for (const m of messages) rest.push(`${field} ${m}`);
    }
  }
  return rest.length ? rest.join('; ') : null;
}
