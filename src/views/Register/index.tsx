import type {AppPaths} from '@/views';

import {useState} from 'react';
import {Form, useForm} from 'react-f0rm';
import {Card, Title, Input, Text, Alert, FormItem} from 'haze-ui';
// FormItem（haze-ui 1.8 引入、1.11 起随 form 层并入主 barrel）：接管字段
// id/错误 span/aria 链路——首条错误渲染为 <span role='alert'>，control
// 桥直接驱动 haze-ui 控件，取代 Field + FieldError 的手工挂接。
// 1.12 起额外透传 react-f0rm ≥0.6 的 validateDebounce / delayError /
// rules 到 useField，字段校验调度（debounce 窗口）无需再手写。
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
// debounce 窗口（validateDebounce）由 FormItem 透传给 react-f0rm ≥0.6 的
// useField（haze-ui ≥1.12 起内建支持），此前的手写 debounce 闭包校验器
// 已删除：validate 里只剩「查 signal + 发请求」，窗口内重复触发只跑最后
// 一轮（提交 trigger 会等窗口走完，语义与手写版一致）。
// AbortSignal 全链路：useValidate 在新一轮校验开始（或字段卸载）时
// abort 上一轮的 meta.signal——校验函数据此撤销在途请求；即使被取消的
// 轮次仍返回结果，useValidate 的 lock 机制也会独立丢弃过期结果。
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

// 异步查重校验器：必填走同步分支（返回同步错误，不经网络请求）。注意
// validateDebounce>0 时 react-f0rm 对整个 validator（含本同步 required
// 分支）统一经 setTimeout 延后——空值失焦后错误也是 300ms 窗口走完才
// 出现，并非「required 即时显示」；异步轮保留对 meta.signal.aborted 的
// 响应与 AbortError 语义（AbortError 被 useValidate 的 .catch(() => {})
// 吞掉，取消的轮次不落任何错误）。
const validateUsername = (value: string, meta: {signal: AbortSignal}) => {
  const empty = required('Username is required')(value);
  if (empty !== undefined) return empty;
  if (meta.signal.aborted) return Promise.reject(usernameAbortError());
  return checkUsernameReserved(value, meta.signal).then((reserved) =>
    reserved ? `'${value}' is already taken` : undefined
  );
};

export default function Register() {
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断。
  // 空字符串 initialValues 让字段从首帧就是受控输入（undefined 起始会
  // 触发 React 的 uncontrolled→controlled 警告）
  type RegisterValues = {username: string; email: string; password: string};
  const form = useForm<RegisterValues>({
    initialValues: {username: '', email: '', password: ''}
  });
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
            请求；validateDebounce 把窗口调度交给 useField（窗口内重复
            触发只跑最后一轮，提交 trigger 会等窗口走完） */}
        <FormItem
          form={form}
          name='username'
          mode='onBlur'
          validateDebounce={USERNAME_DEBOUNCE_MS}
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
