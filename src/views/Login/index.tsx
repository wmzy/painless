import {useState} from 'react';
import {Form, useForm} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
// FormItem（haze-ui/form 1.8.0）：接管字段 id/错误 span/aria 链路——首条
// 错误渲染为 <span role='alert'>，control 桥直接驱动 haze-ui 控件，取代
// Field + FieldError 的手工挂接（FieldError 组件随之删除）
import {FormItem} from 'haze-ui/form';
import {useRouter, Link} from '@native-router/react';
import {navigate} from '@native-router/core';

import * as auth from '@/services/auth';
import {required, email, compose, applyApiFieldErrors} from '@/util/validators';

export default function Login() {
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断。
  // 空字符串 initialValues 让字段从首帧就是受控输入（undefined 起始会
  // 触发 React 的 uncontrolled→controlled 警告）
  type LoginValues = {email: string; password: string};
  const form = useForm<LoginValues>({initialValues: {email: '', password: ''}});
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
        <FormItem
          form={form}
          name='email'
          validate={compose(required('Email is required'), email('Invalid email'))}
        >
          {({id, errorId, invalid, control}) => (
            <Input
              id={id}
              value={control}
              type='email'
              placeholder='Email'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
            />
          )}
        </FormItem>
        <FormItem
          form={form}
          name='password'
          validate={required('Password is required')}
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
        <button type='submit'>Login</button>
      </Form>
      <Text>
        Don't have an account? <Link to='/register'>Register</Link>
      </Text>
    </Card>
  );
}
