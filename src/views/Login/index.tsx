import type {AppPaths} from '@/views';

import {useState} from 'react';
import {css} from '@linaria/core';
import {Form, useForm, useCanSubmit} from 'react-f0rm';
import {Card, Title, InputCore, Text, Alert, FormItem, useTitle} from 'haze-ui';
// FormItem 声明式桥（haze-ui 1.15）：传控件引用即自动接好
// id/aria-invalid/aria-describedby/onBlur/onChange/value（接线属性恒定
// 优先、不可覆盖），其余 props 经泛型全类型校验透传。
import {
  useRouter,
  TypedLink,
  useSearch,
  type StandardSchemaV1
} from '@native-router/react';
import {navigate, invalidate} from '@native-router/core';


import * as auth from '@/services/auth';
import {required, email, compose, applyApiFieldErrors} from '@/util/validators';
import SubmitButton from '@/components/SubmitButton';

// 窄卡居中：认证表单是单一任务界面，通栏卡片（此前 1024px 宽、输入框
// 1010px 宽）没有任何信息收益，480px 是舒适的单手扫视宽度
const cardCls = css`
  max-width: 480px;
  margin-inline: auto;
`;

// 字段纵向节奏：FormItem 自身只有内部 gap，字段与字段之间此前零间距
const formStack = css`
  display: flex;
  flex-direction: column;
  gap: var(--haze-space-4);
`;

// /login 的 search 契约：?redirect=<encodeURIComponent(原目的页)>——由
// requireLogin 守卫写入（views/index.tsx）。非字符串/空串一律丢弃，落
// 回首页。
type LoginSearch = {redirect?: string};

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

// redirect 白名单（防 open redirect）：只接受站内绝对路径——非空、以
// '/' 开头、不以 '//' 开头（协议相对）、不含 '://'（带协议）、不含
// '\'。反斜杠是前两条检查的绕过面：WHATWG URL 把特殊协议 URL 中的
// '\' 归一为 '/'，history.push('/\evil.com') 归一即 '//evil.com' 协议
// 相对跳转——故含反斜杠整体拒绝（含归一后仍同源的无害形态，白名单从
// 严不做例外）。其余落首页。
export const sanitizeRedirect = (value: string | undefined): string =>
  value !== undefined &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('://') &&
  !value.includes('\\')
    ? value
    : '/';

export default function Login() {
  useTitle('Login · Painless');
  // 空字符串 initialValues 让字段首帧即受控输入（undefined 起始触发
  // uncontrolled→controlled 警告）。
  type LoginValues = {email: string; password: string};
  const form = useForm<LoginValues>({initialValues: {email: '', password: ''}});
  // useCanSubmit 复合订阅：isSubmitting 覆盖整个异步提交期，hasErrors 在
  // 任一字段带错时为 true。
  const canSubmit = useCanSubmit(form);
  const router = useRouter();
  // 守卫写入的原目的页：URL 侧 encode，此处已解码。
  const {redirect} = useSearch(loginSearchSchema);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: LoginValues) => {
    // 新一轮提交即刻撤下上次顶部错误，避免提交窗口内显示过期错误误导
    setError(null);
    try {
      await auth.login(values.email, values.password);
      // 清 viewStack 快照：防登录后同文档 back 重放匿名视图（或绕过已
      // 执行过的 requireLogin 守卫）。
      invalidate(router);
      // 非法/缺失（直接访问 /login）落首页；NCE（被取代/取消）吞掉即
      // 「停在旧视图」语义。
      void navigate(router, sanitizeRedirect(redirect)).catch(() => undefined);
    } catch (e: unknown) {
      // 422 字段错误经 applyApiFieldErrors 回填到字段下方；对不上字段的键
      //（如 RealWorld 的 "email or password"）与非结构化错误才留在顶部
      // Alert。
      setError(applyApiFieldErrors(form, e, ['email', 'password']));
    }
  };

  return (
    <Card className={cardCls}>
      <Title>Login</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      {/* onSubmit 被 await，isSubmitting 覆盖整个异步提交 */}
      <Form form={form} onSubmit={handleSubmit} aria-label='Login form' className={formStack}>
        {/* mode='onBlur'：默认提交才校验，email 失焦即校验；onBlur 由
            input 桥自动接线 */}
        <FormItem
          form={form}
          name='email'
          mode='onBlur'
          validate={compose(required('Email is required'), email('Invalid email'))}
          input={InputCore}
          type='email'
          placeholder='Email'
        />
        {/* password 提交时才首验；onBlur 由 input 桥自动接线（blur 档
            校验只经它可达） */}
        <FormItem
          form={form}
          name='password'
          validate={required('Password is required')}
          input={InputCore}
          type='password'
          placeholder='Password'
        />
        {/* 初始可点是刻意语义：首次校验由提交触发、errors 初始为空——
            若初始 disabled 提交永远不会发生。改字段即逐键复验，错误清即
            弹起。 */}
        <SubmitButton disabled={!canSubmit}>Login</SubmitButton>
      </Form>
      <Text>
        Don't have an account? <TypedLink<AppPaths> to='/register'>Register</TypedLink>
      </Text>
    </Card>
  );
}
