import type {AppPaths} from '@/views';

import {useState} from 'react';
import {Form, useForm, useHasErrors, useIsSubmitting} from 'react-f0rm';
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
  // 触发 React 的 uncontrolled→controlled 警告）。confirmPassword 是纯
  // 客户端闸门：RealWorld 注册契约只有 username/email/password，提交
  // 映射时剔除（见 handleSubmit）。
  type RegisterValues = {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  const form = useForm<RegisterValues>({
    initialValues: {username: '', email: '', password: '', confirmPassword: ''},
    // form 级校验：跨字段一致性（密码 vs 确认密码）——字段级 validate
    // 只收单字段值，比较另一字段要走 useForm 的 validate 选项（收全量
    // values、返回按字段挂错的 record，react-f0rm 官方跨字段形态，见
    // README「Form-level validation」同款示例）。错误挂到
    // confirmPassword，经该字段 FormItem 的 role='alert' span 渲染，
    // 与其它字段同一条 a11y 链路。
    // 时序：提交时字段级校验全过才会跑 form 级（ensureValidate 先等
    // 字段轮 settle、有错即早退），所以「确认为空」先报字段级
    // required，「确认非空但不一致」才轮到 mismatch。
    // 已知显示局限（跨字段校验的通病）：mismatch 挂上后，改 password
    // 不会重跑 form 级校验（复验只打确认字段自身的 validator）；改
    // confirmPassword 逐键复验清错也可能「仍不一致却已清空」——安全
    // 边界不受影响：提交永远重跑 form 级校验，错误至多「早消失」，
    // 不会放行无效提交。一致时返回空 record（falsy 结果被跳过，
    // 空 record 展开无键、等价无错）。
    validate: (values) =>
      values.password === values.confirmPassword
        ? {}
        : {confirmPassword: 'Passwords do not match'}
  });
  // 提交按钮的 disabled 组合（react-f0rm 0.6 无 canSubmit 复合 flag，
  // 由两个订阅 hook 组出）：isSubmitting 覆盖整个异步提交期（含用户名
  // 查重的 debounce 窗口）；hasErrors 在任一字段带错（客户端校验、
  // 一致性 mismatch 或 422 回填）时为 true。
  const hasErrors = useHasErrors(form);
  const isSubmitting = useIsSubmitting(form);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: RegisterValues) => {
    try {
      // RealWorld 契约只有 username/email/password：确认字段不进提交体
      const {username, email, password} = values;
      await auth.register(username, email, password);
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
        {/* 同 Login：password 无字段级 mode（提交时首验）。onBlur 仍由
            FormItem binding 提供并显式传给 Input：blur 档校验只经它
            可达，删掉会窄化触发面 */}
        <FormItem
          form={form}
          name='password'
          validate={compose(
            required('Password is required'),
            minLength(8, 'Password must be at least 8 characters')
          )}
        >
          {({id, errorId, invalid, control, onBlur}) => (
            <Input
              id={id}
              value={control}
              type='password'
              placeholder='Password'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              onBlur={onBlur}
            />
          )}
        </FormItem>
        {/* 确认密码：一致性校验在 form 级 validate（跨字段，见 useForm
            注释），这里的字段级 validate 只报必填——它同时承担复验
            （默认档 reValidateMode='onChange'，桥写值即触发）的清错
            职责：字段带错后修改即重跑，通过即清（含 form 级挂上来的
            mismatch，见 useForm 注释里的显示局限）。onBlur 接线与其它
            字段一致（blur 档校验只经它可达）。a11y 链路与 password
            字段完全一致。 */}
        <FormItem
          form={form}
          name='confirmPassword'
          validate={required('Confirm password is required')}
        >
          {({id, errorId, invalid, control, onBlur}) => (
            <Input
              id={id}
              value={control}
              type='password'
              placeholder='Confirm password'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
              onBlur={onBlur}
            />
          )}
        </FormItem>
        {/* 防重复/防无效提交。初始可点是刻意语义：表单默认
            mode='onSubmit'，首次校验由提交触发，errors 初始为空集
            （useHasErrors 只读错误 Map 的 size，不预跑校验）——若初始
            就 disabled，提交永远不会发生。首次失败后按钮压下；提交失败
            后修改字段即逐键复验（默认档 reValidateMode='onChange'，
            react-f0rm 0.7 起 FormItem control 桥的写值等价
            useField.onChange），错误清即弹起，422 回填的字段错误同理。 */}
        <button type='submit' disabled={isSubmitting || hasErrors}>
          Register
        </button>
      </Form>
      <Text>
        Already have an account? <TypedLink<AppPaths> to='/login'>Login</TypedLink>
      </Text>
    </Card>
  );
}
