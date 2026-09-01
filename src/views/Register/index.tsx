import type {AppPaths} from '@/views';

import {useState} from 'react';
import {Form, useForm, useCanSubmit} from 'react-f0rm';
import {Card, Title, InputCore, Text, Alert, FormItem} from 'haze-ui';
// FormItem（haze-ui 1.8 引入、1.11 起随 form 层并入主 barrel）：接管字段
// id/错误 span/aria 链路——首条错误渲染为 <span role='alert'>。1.15 起
// input 声明式桥：传控件引用即自动接好 id/aria-invalid/aria-describedby/
// onBlur/onChange/value（接线属性恒定优先），控件其余 props 写在
// FormItem 上经泛型全类型校验透传。
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
  usernameAvailable,
  applyApiFieldErrors
} from '@/util/validators';
import {useTitle} from '@/util/useTitle';

// —— 用户名异步查重：react-f0rm 异步 validate 协议 ——
// debounce 窗口（validateDebounce）由 FormItem 透传给 react-f0rm 的
// useField（haze-ui ≥1.12 内建透传），窗口内重复触发只跑最后一轮；窗口
// 挂起期间字段计入 validating，提交（trigger/ensureValidate）会等窗口与
// 异步轮全部走完，不与在途校验赛跑。
// AbortSignal 全链路：useValidate 在新一轮校验开始（或字段卸载）时
// abort 上一轮的 meta.signal——usernameAvailable 把 signal 透传给
// fetchProfile，被超越的轮次撤销在途请求；即使旧轮仍返回结果（校验方
// 不监听 signal），useValidate 的 lock 机制也会独立丢弃过期结果。
const USERNAME_DEBOUNCE_MS = 300;

// 同步 required 分支先行短路：react-f0rm 的 rules+validate 组合
// （combineRulesAndValidate）两边都跑、不短路——若把 required 放 rules，
// 空值也会发一轮 profiles 请求。这里在进入异步轮前手动短路：空值同步
// 返回错误，非空才走 usernameAvailable 的 GET profiles/{username} 查重。
// 注意 validateDebounce>0 时 react-f0rm 对整个 validator（含本同步
// 分支）统一经 setTimeout 延后——空值失焦后错误也是 300ms 窗口走完才
// 出现，并非「required 即时显示」。
const validateUsername = (value: string, meta: {signal: AbortSignal}) => {
  const empty = required('Username is required')(value);
  if (empty !== undefined) return empty;
  return usernameAvailable()(value, meta);
};

export default function Register() {
  // 页标题（统一口径见 Home 的 useTitle 注释）：页名与视图内 <Title> 一致
  useTitle('Register · Painless');
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
  // 提交按钮的 disabled flag（react-f0rm ≥0.8 的 useCanSubmit 复合订阅，
  // 语义 = !isSubmitting && !hasErrors，取代此前两个订阅 hook 的手组）：
  // isSubmitting 覆盖整个异步提交期（含用户名查重的 debounce 窗口）；
  // hasErrors 在任一字段带错（客户端校验、一致性 mismatch 或 422 回填）
  // 时为 true。
  const canSubmit = useCanSubmit(form);
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
        {/* 用户名：异步查重（react-f0rm 异步 validate 协议，查重端点
            services/auth 的 fetchProfile）。mode='onBlur' 同 email——
            失焦/提交才校验，避免每次击键一轮请求；validateDebounce 把
            窗口调度交给 useField（窗口内重复触发只跑最后一轮，提交
            trigger 会等窗口走完）。失焦钩子由 input 桥自动接线 */}
        <FormItem
          form={form}
          name='username'
          mode='onBlur'
          validateDebounce={USERNAME_DEBOUNCE_MS}
          validate={validateUsername}
          input={InputCore}
          placeholder='Username'
        />
        {/* 同 Login：email 字段失焦即校验（字段级 mode 覆盖 form 默认） */}
        <FormItem
          form={form}
          name='email'
          mode='onBlur'
          validate={compose(required('Email is required'), email('Invalid email'))}
          input={InputCore}
          type='email'
          placeholder='Email'
        />
        {/* 同 Login：password 无字段级 mode（提交时首验）。onBlur 由
            input 桥自动接线（blur 档校验只经它可达） */}
        <FormItem
          form={form}
          name='password'
          validate={compose(
            required('Password is required'),
            minLength(8, 'Password must be at least 8 characters')
          )}
          input={InputCore}
          type='password'
          placeholder='Password'
        />
        {/* 确认密码：一致性校验在 form 级 validate（跨字段，见 useForm
            注释），这里的字段级 validate 只报必填——它同时承担复验
            （默认档 reValidateMode='onChange'，桥写值即触发）的清错
            职责：字段带错后修改即重跑，通过即清（含 form 级挂上来的
            mismatch，见 useForm 注释里的显示局限）。a11y 链路与 password
            字段完全一致（均由 input 桥接线）。 */}
        <FormItem
          form={form}
          name='confirmPassword'
          validate={required('Confirm password is required')}
          input={InputCore}
          type='password'
          placeholder='Confirm password'
        />
        {/* 防重复/防无效提交。初始可点是刻意语义：表单默认
            mode='onSubmit'，首次校验由提交触发，errors 初始为空集
            （canSubmit 的 hasErrors 分量只读错误 Map 的 size，不预跑
            校验）——若初始就 disabled，提交永远不会发生。首次失败后
            按钮压下；提交失败后修改字段即逐键复验（默认档
            reValidateMode='onChange'，FormItem 的 onChange 即
            useField.onChange），错误清即弹起，422 回填的字段错误同理。 */}
        <button type='submit' disabled={!canSubmit}>
          Register
        </button>
      </Form>
      <Text>
        Already have an account? <TypedLink<AppPaths> to='/login'>Login</TypedLink>
      </Text>
    </Card>
  );
}
