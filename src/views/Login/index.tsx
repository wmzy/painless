import type {AppPaths} from '@/views';

import {useState} from 'react';
import {Form, useForm, useHasErrors, useIsSubmitting} from 'react-f0rm';
import {Card, Title, Input, Text, Alert, FormItem} from 'haze-ui';
// FormItem（haze-ui 1.8 引入、1.11 起随 form 层并入主 barrel）：接管字段
// id/错误 span/aria 链路——首条错误渲染为 <span role='alert'>，control
// 桥直接驱动 haze-ui 控件，取代 Field + FieldError 的手工挂接
import {useRouter, TypedLink} from '@native-router/react';
import {navigate} from '@native-router/core';


import * as auth from '@/services/auth';
import {useTitle} from '@/util/useTitle';
import {required, email, compose, applyApiFieldErrors} from '@/util/validators';

export default function Login() {
  // 页标题（统一口径见 Home 的 useTitle 注释）：页名与视图内 <Title> 一致
  useTitle('Login · Painless');
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断。
  // 空字符串 initialValues 让字段从首帧就是受控输入（undefined 起始会
  // 触发 React 的 uncontrolled→controlled 警告）
  type LoginValues = {email: string; password: string};
  const form = useForm<LoginValues>({initialValues: {email: '', password: ''}});
  // 提交按钮的 disabled 组合（react-f0rm 0.6 无 canSubmit 复合 flag，
  // 由两个订阅 hook 组出）：isSubmitting 覆盖整个异步提交期；
  // hasErrors 在任一字段带错（客户端校验或 422 回填）时为 true。
  const hasErrors = useHasErrors(form);
  const isSubmitting = useIsSubmitting(form);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {email: string; password: string}) => {
    try {
      await auth.login(values.email, values.password);
      void navigate(router, '/');
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
        {/* 错误 span 只在 invalid 时渲染，aria-describedby 相应条件传递，
            避免指向不存在元素的悬空 id */}
        {/* mode='onBlur'（react-f0rm 0.6 字段级覆盖 + haze-ui 1.9 FormItem
            透传）：表单默认 onSubmit 提交时才校验，email 单字段失焦即校验。
            onBlur 由 FormItem binding 提供，接给 Input 才触发失焦钩子 */}
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
        {/* password 无字段级 mode（提交时才首验）。onBlur 仍由 FormItem
            binding 提供并显式传给 Input：blur 档校验（mode='onBlur'/
            'onTouched'/'all' 或 reValidateMode='onBlur'）只经它可达，
            删掉会窄化触发面 */}
        <FormItem
          form={form}
          name='password'
          validate={required('Password is required')}
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
        {/* 防重复/防无效提交。初始可点是刻意语义：表单默认
            mode='onSubmit'，首次校验由提交触发，errors 初始为空集
            （useHasErrors 只读错误 Map 的 size，不预跑校验）——若初始
            就 disabled，提交永远不会发生。首次失败后按钮压下；提交失败
            后修改字段即逐键复验（默认档 reValidateMode='onChange'，
            react-f0rm 0.7 起 FormItem control 桥的写值等价
            useField.onChange），错误清即弹起，422 回填的字段错误同理。 */}
        <button type='submit' disabled={isSubmitting || hasErrors}>
          Login
        </button>
      </Form>
      <Text>
        Don't have an account? <TypedLink<AppPaths> to='/register'>Register</TypedLink>
      </Text>
    </Card>
  );
}
