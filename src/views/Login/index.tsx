import type {AppPaths} from '@/views';

import {useState} from 'react';
import {Form, useForm, useCanSubmit} from 'react-f0rm';
import {Card, Title, InputCore, Text, Alert, FormItem, useTitle} from 'haze-ui';
// FormItem（haze-ui 1.8 引入、1.11 起随 form 层并入主 barrel）：接管字段
// id/错误 span/aria 链路——首条错误渲染为 <span role='alert'>（错误 span
// 只在 invalid 时渲染，aria-describedby 相应省略，无悬空 id）。1.15 起
// 支持 input 声明式桥：传控件引用（InputCore 等）即自动接好
// id/aria-invalid/aria-describedby/onBlur/onChange/value（接线属性恒定
// 优先，不可覆盖），控件其余 props 直接写在 FormItem 上经泛型全类型
// 校验透传
import {
  useRouter,
  TypedLink,
  useSearch,
  type StandardSchemaV1
} from '@native-router/react';
import {navigate} from '@native-router/core';


import * as auth from '@/services/auth';
import {required, email, compose, applyApiFieldErrors} from '@/util/validators';

// /login 的 search 契约：?redirect=<encodeURIComponent(原目的页)>——由
// requireLogin 守卫写入（见 views/index.tsx）。手写 Standard Schema
//（同 src/types/search.ts 的做法），非字符串/空串一律丢弃（视为无
// redirect），Login 落回首页。
export type LoginSearch = {redirect?: string};

export const loginSearchSchema: StandardSchemaV1<unknown, LoginSearch> = {
  '~standard': {
    version: 1,
    vendor: 'painless',
    validate: (input) => {
      const raw = (input ?? {}) as Record<string, unknown>;
      const value: LoginSearch = {};
      if (typeof raw.redirect === 'string' && raw.redirect !== '')
        value.redirect = raw.redirect;
      return {value};
    }
  }
};

// redirect 白名单式校验（防 open redirect）：只接受站内绝对路径——非空、
// 以 '/' 开头、不以 '//' 开头（协议相对 //evil.com）、不含 '://'（带协议
// https://evil.com）、不含 '\'。反斜杠是前两条检查的绕过面：WHATWG URL
// 规范把特殊协议（http/https 等）URL 中的 '\' 归一为 '/'，
// history.push('/\evil.com') 经浏览器归一即 '//evil.com' 协议相对跳转，
// 故含反斜杠的值整体拒绝（含 '/foo\bar' 这类归一后仍同源的无害形态，
// 白名单从严不做例外）。其余（含缺失）一律落首页。
export const sanitizeRedirect = (value: string | undefined): string =>
  value !== undefined &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('://') &&
  !value.includes('\\')
    ? value
    : '/';

export default function Login() {
  // 页标题（统一口径见 Home 的 useTitle 注释）：页名与视图内 <Title> 一致
  useTitle('Login · Painless');
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断。
  // 空字符串 initialValues 让字段从首帧就是受控输入（undefined 起始会
  // 触发 React 的 uncontrolled→controlled 警告）
  type LoginValues = {email: string; password: string};
  const form = useForm<LoginValues>({initialValues: {email: '', password: ''}});
  // 提交按钮的 disabled flag（react-f0rm ≥0.8 的 useCanSubmit 复合订阅，
  // 语义 = !isSubmitting && !hasErrors，取代此前两个订阅 hook 的手组）：
  // isSubmitting 覆盖整个异步提交期；hasErrors 在任一字段带错（客户端
  // 校验或 422 回填）时为 true。布尔快照仅翻转重渲染（库内订阅粒度）。
  const canSubmit = useCanSubmit(form);
  const router = useRouter();
  // 守卫写入的原目的页（见上方 loginSearchSchema）：URL 侧整体 encode，
  // 这里拿到的是已解码的 pathname+search
  const {redirect} = useSearch(loginSearchSchema);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {email: string; password: string}) => {
    try {
      await auth.login(values.email, values.password);
      // 回跳原目的页；非法/缺失（直接访问 /login）落首页。被取代/取消的
      // 导航 reject NCE（core 1.15）：吞掉即「停在旧视图」语义，与旧版
      // void（永不 settle）等价
      void navigate(router, sanitizeRedirect(redirect)).catch(() => undefined);
    } catch (e: unknown) {
      // 422 字段错误经 applyApiFieldErrors（validators.ts 单通道）回填到
      // 对应字段下方，内部走 react-f0rm 0.5.0 的 setServerErrors
      // （type: 'server'）；对不上字段的键（如 RealWorld 登录 422 的
      // "email or password"）与非结构化错误才留在顶部 Alert
      setError(applyApiFieldErrors(form, e, ['email', 'password']));
    }
  };

  return (
    <Card>
      <Title>Login</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      {/* react-f0rm ≥0.4：onSubmit 被 await，isSubmitting 覆盖整个异步提交 */}
      <Form form={form} onSubmit={handleSubmit} aria-label='Login form'>
        {/* mode='onBlur'（react-f0rm 0.6 字段级覆盖 + haze-ui 1.9 FormItem
            透传）：表单默认 onSubmit 提交时才校验，email 单字段失焦即校验
            ——失焦钩子（onBlur）由 input 桥自动接线，无需再手传给控件 */}
        <FormItem
          form={form}
          name='email'
          mode='onBlur'
          validate={compose(required('Email is required'), email('Invalid email'))}
          input={InputCore}
          type='email'
          placeholder='Email'
        />
        {/* password 无字段级 mode（提交时才首验）。onBlur 同样由 input 桥
            自动接线：blur 档校验（mode='onBlur'/'onTouched'/'all' 或
            reValidateMode='onBlur'）只经它可达，声明式桥让这条链路不再
            依赖调用点记得手接 */}
        <FormItem
          form={form}
          name='password'
          validate={required('Password is required')}
          input={InputCore}
          type='password'
          placeholder='Password'
        />
        {/* 防重复/防无效提交。初始可点是刻意语义：表单默认
            mode='onSubmit'，首次校验由提交触发，errors 初始为空集
            （canSubmit 的 hasErrors 分量只读错误 Map 的 size，不预跑
            校验）——若初始就 disabled，提交永远不会发生。首次失败后
            按钮压下；提交失败后修改字段即逐键复验（默认档
            reValidateMode='onChange'，FormItem 的 onChange 即
            useField.onChange），错误清即弹起，422 回填的字段错误同理。 */}
        <button type='submit' disabled={!canSubmit}>
          Login
        </button>
      </Form>
      <Text>
        Don't have an account? <TypedLink<AppPaths> to='/register'>Register</TypedLink>
      </Text>
    </Card>
  );
}
