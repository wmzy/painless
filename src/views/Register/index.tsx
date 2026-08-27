import type {AppPaths} from '@/views';

import {useMemo, useState} from 'react';
import {Form, useForm} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
// FormItem（haze-ui/form 1.8.0）：接管字段 id/错误 span/aria 链路——首条
// 错误渲染为 <span role='alert'>，control 桥直接驱动 haze-ui 控件，取代
// Field + FieldError 的手工挂接（FieldError 组件随之删除）
import {FormItem} from 'haze-ui/form';
import {useRouter, TypedLink} from '@native-router/react';
import {navigate} from '@native-router/core';


import * as auth from '@/services/auth';
import {
  required,
  email,
  minLength,
  compose,
  applyApiFieldErrors
} from '@/util/validators';

// —— 用户名异步查重：react-f0rm 异步 validate 协议示范 ——
// 取舍说明：react-f0rm 0.6 的 useField 内建 validateDebounce / delayError
// 选项，但 haze-ui 1.9 的 FormItem 只透传 validate / mode 两个校验相关
// prop（见 FormItemProps），表单层拿不到内建入口 → debounce 在校验函数
// 闭包内自实现（每次触发先撤销上一轮未发出的请求）；delayError 属渲染层
// 错误延迟展示，无法从 validate 函数内模拟，且异步轮自身的往返延迟已经
// 天然错峰了错误出现时机，故不手写。若未来 FormItem 透传这两个选项，
// 删掉闭包定时器改传 prop 即可，validate 只剩「查 signal + 发请求」。
//
// AbortSignal 全链路：useValidate 在新一轮校验开始（或字段卸载）时
// abort 上一轮的 meta.signal——校验函数据此撤销挂起的 debounce 定时器
// 与在途请求；即使被取消的轮次仍返回结果，useValidate 的 lock 机制也会
// 独立丢弃过期结果，双保险。
const USERNAME_RESERVED = new Set(['admin', 'root', 'system', 'superuser']);
// debounce 窗口与模拟网络延迟分开调参：窗口内重复触发只发最后一次
const USERNAME_DEBOUNCE_MS = 300;
const USERNAME_CHECK_MS = 400;

const usernameAbortError = () =>
  new DOMException('username check aborted', 'AbortError');

// 模拟端点：保留字查询 + ~400ms 延迟。
// 生产替换点：换成真实查重 API，并把 signal 透传给
// fetch(`/api/usernames/${encodeURIComponent(username)}`, {signal})，
// 协议不变（AbortError 同样由调用方按取消处理）。
function checkUsernameReserved(username: string, signal: AbortSignal) {
  return new Promise<boolean>((resolve, reject) => {
    // 请求发出前 signal 已 abort：跳过，不发请求
    if (signal.aborted) return reject(usernameAbortError());
    const timer = setTimeout(() => {
      // 「响应」到达时再查一次：往返途中被取代的请求按取消处理
      if (signal.aborted) return reject(usernameAbortError());
      resolve(USERNAME_RESERVED.has(username.trim().toLowerCase()));
    }, USERNAME_CHECK_MS);
    // 在途取消：abort 时撤销响应定时器（对应真实 fetch 的 AbortError）
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(usernameAbortError());
      },
      {once: true}
    );
  });
}

// debounce 闭包工厂：pending 定时器要跨 render 存活，组件里用 useMemo
// 固定一份校验器（render 里直接调用工厂会每帧新建闭包，丢掉上一轮
// 定时器的引用）。必填走同步分支，保持原 required 的即时语义；AbortError
// 会被 useValidate 的 .catch(() => {}) 吞掉，取消的轮次不落任何错误。
function createUsernameValidator() {
  let pending: ReturnType<typeof setTimeout> | null = null;
  return (value: string, meta: {signal: AbortSignal}) => {
    const empty = required('Username is required')(value);
    if (empty !== undefined) return empty;
    // debounce：新一轮触发先撤销上一轮还没发出的请求
    if (pending !== null) clearTimeout(pending);
    const {signal} = meta;
    return new Promise<string | undefined>((resolve, reject) => {
      // 只撤销自己的定时器（识别 mine），不误伤已接管 pending 的新一轮
      let mine: ReturnType<typeof setTimeout> | null = null;
      const cancel = () => {
        if (mine !== null) {
          clearTimeout(mine);
          if (pending === mine) pending = null;
        }
        reject(usernameAbortError());
      };
      signal.addEventListener('abort', cancel, {once: true});
      mine = pending = setTimeout(() => {
        mine = null;
        pending = null;
        checkUsernameReserved(value, signal).then(
          (reserved) =>
            resolve(reserved ? `'${value}' is already taken` : undefined),
          reject
        );
      }, USERNAME_DEBOUNCE_MS);
    });
  };
}

export default function Register() {
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断。
  // 空字符串 initialValues 让字段从首帧就是受控输入（undefined 起始会
  // 触发 React 的 uncontrolled→controlled 警告）
  type RegisterValues = {username: string; email: string; password: string};
  const form = useForm<RegisterValues>({
    initialValues: {username: '', email: '', password: ''}
  });
  // debounce 闭包跨 render 固定一份（见 createUsernameValidator 注释）
  const validateUsername = useMemo(createUsernameValidator, []);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {username: string; email: string; password: string}) => {
    try {
      await auth.register(values.username, values.email, values.password);
      void navigate(router, '/');
    } catch (e: unknown) {
      // 422 字段错误经 applyApiFieldErrors（validators.ts 单通道）回填到
      // 对应字段下方，内部走 react-f0rm 0.5.0 的 setServerErrors
      // （type: 'server'）；对不上字段的键与非结构化错误留在顶部 Alert
      setError(applyApiFieldErrors(form, e, ['username', 'email', 'password']));
    }
  };

  return (
    <Card>
      <Title>Register</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      <Form form={form} onSubmit={handleSubmit} aria-label='Register form'>
        {/* 错误 span 只在 invalid 时渲染，aria-describedby 相应条件传递，
            避免指向不存在元素的悬空 id */}
        {/* 用户名：异步查重示范（react-f0rm 异步 validate 协议）。
            mode='onBlur' 同 email——失焦/提交才校验，避免每次击键一轮
            请求；onBlur 由 FormItem binding 提供，接给 Input 才触发 */}
        <FormItem
          form={form}
          name='username'
          mode='onBlur'
          validate={validateUsername}
        >
          {({id, errorId, invalid, control, onBlur}) => (
            <Input
              id={id}
              value={control}
              placeholder='Username'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              onBlur={onBlur}
            />
          )}
        </FormItem>
        {/* 同 Login：email 字段失焦即校验（字段级 mode 覆盖 form 默认） */}
        <FormItem
          form={form}
          name='email'
          mode='onBlur'
          validate={compose(required('Email is required'), email('Invalid email'))}
        >
          {({id, errorId, invalid, control, onBlur}) => (
            <Input
              id={id}
              value={control}
              type='email'
              placeholder='Email'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              onBlur={onBlur}
            />
          )}
        </FormItem>
        <FormItem
          form={form}
          name='password'
          validate={compose(
            required('Password is required'),
            minLength(8, 'Password must be at least 8 characters')
          )}
        >
          {({id, errorId, invalid, control}) => (
            <Input
              id={id}
              value={control}
              type='password'
              placeholder='Password'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
            />
          )}
        </FormItem>
        <button type='submit'>Register</button>
      </Form>
      <Text>
        Already have an account? <TypedLink<AppPaths> to='/login'>Login</TypedLink>
      </Text>
    </Card>
  );
}
