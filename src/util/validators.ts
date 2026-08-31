// 表单层共享工具：字段验证器工厂（同步 + 异步）+ 服务端 422 字段错误
// 回填。Login/Register/Editor 三页此前各自手写 required/email/minLength 的
// validate 回调、并在 catch 里把服务端错误拼成一句话放顶部 Alert，
// 两处重复都在此收敛。异步校验器（usernameAvailable）依赖 services 层
// 的查重端点——方向是 util → services 的特例：本文件定位是应用级表单
// 工具（已耦合 react-f0rm 与 RealWorld 的 422 错误形状），services/auth
// 的依赖图（http/useQuery）不回指本文件，无环。
import type {FormInstance} from 'react-f0rm';

import {setServerErrors} from 'react-f0rm';

import {fetchProfile} from '@/services/auth';

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

// ---- 异步校验器 -----------------------------------------------------------
// 与上面同步 Validator 的差别在第二参：对齐 react-f0rm 的 validate 回调
// 协议（src/hooks/validate.ts 的 Validator）——meta.signal 在轮次被超越
// （新一轮开始/字段卸载）时自动 abort，透传给 service 层即可撤销在途
// 请求；被取消的轮次即使仍有返回，也会被 useValidate 的 lock 机制独立
// 丢弃（「不监听 signal 也保持正确」是库的显式保证）。
export type AsyncValidator = (
  v: string,
  meta: {signal: AbortSignal}
) => Promise<string | undefined>;

// 用户名占用校验（Register 异步查重）：GET profiles/{username}——200 表示
// 已被占用；文案对齐 RealWorld 后端对重复用户名的 422 字段错误
// 'has already been taken'，提前暴露与提交时 applyApiFieldErrors 的权威
// 回填是同一句话，用户看到的占用提示前后一致。
//
// fail-open 论证：查重只是提前暴露的 UX 优化，校验通道绝不阻塞注册。
// 除 AbortError（轮次被取消，交还 react-f0rm 吞掉）外的一切失败——404
// （用户名可用）、5xx/网络错/超时（结果未知）——都返回 undefined 放行。
// 权威判定在提交时：后端对占用用户名返回 422，字段回填兜底已存在
// （applyApiFieldErrors）；若在这里 fail-closed（把网络错当占用报错），
// 查重服务的抖动会被升级成「无法注册」，可用性损失远大于晚一步才见
// 占用提示的收益。
export function usernameAvailable(
  msg = 'has already been taken'
): AsyncValidator {
  return (v, meta) =>
    fetchProfile(v, meta.signal).then(
      // 200：档案存在 → 用户名已被占用
      () => msg,
      (e: unknown) => {
        // 取消不是失败：维持拒绝语义，让 useValidate 的 .catch(() => {})
        // 吞掉被超越的轮次（其结果本来也会被 lock 丢弃，这里是显式交还）
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        // 404 = 可用；其余（5xx/网络错/超时）结果未知，同样放行
        return undefined;
      }
    );
}

// 服务端 422 字段错误回填：能对应到表单字段（fields）的错误写到该字段
// 的 error 槽位（由 FormItem 渲染的字段错误 span，role='alert'），顶部 Alert
// 只保留对不上字段的部分；返回值即 Alert 应显示的文案，null 表示不显示。
//
// 写入用 setServerErrors(form, matched)：命中字段以 type:'server' 落到
// 与客户端校验同一渲染通道，且默认先 clearErrors——新的服务端响应描述
// 当前状态，不是往上一次的旧错误上打补丁。
//
// 错误判别用鸭子形状而非 instanceof：http 层抛的 ff.HTTPError 带
// status/data，但这里刻意不 import 它——表单工具不该耦合具体 HTTP
// 库，测试构造的普通对象、或任何形状一致的错误同样命中。
// Alert 策略（按合约「实现从简，选一种」）：全部错误都已落到字段 → 隐藏
// Alert；存在对不上字段的键（如登录 422 的 "email or password"）→ 这些
// 键按 `${field} ${message}` 拼接上 Alert，避免错误凭空消失；非 422 或
// 没有结构化 errors → 沿用 e.message 整句兜底。
type ApiErrorLike = {
  status?: unknown;
  data?: {errors?: Record<string, unknown>};
};

// 归一错误体的字段级 errors：单条 string 包成数组，非字符串条目丢弃；
// 形状不对（缺 data.errors / 非对象）返回 undefined。
function fieldErrorsOf(e: unknown): Record<string, string[]> | undefined {
  const api = e as ApiErrorLike | null;
  if (!api || typeof api !== 'object' || api.status !== 422) return undefined;
  const raw = api.data?.errors;
  if (!raw || typeof raw !== 'object') return undefined;
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(raw)) {
    const list = Array.isArray(messages) ? messages : [messages];
    const strings = list.filter((m): m is string => typeof m === 'string');
    if (strings.length) result[field] = strings;
  }
  return result;
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
  // matched/unmatched 分流：matched 子集保留原 string[] 交给
  // setServerErrors——错误带 type:'server' 与客户端校验错误可区分，
  // 且默认先 clearErrors（新响应描述当前状态，而非往旧错误上打补丁）
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
