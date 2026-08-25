import type {AppPaths} from '@/views';

import {useState} from 'react';
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

export default function Register() {
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断
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
        <FormItem
          form={form}
          name='username'
          validate={required('Username is required')}
        >
          {({id, errorId, invalid, control}) => (
            <Input
              id={id}
              value={control}
              placeholder='Username'
              aria-invalid={invalid}
              aria-describedby={invalid ? errorId : undefined}
            />
          )}
        </FormItem>
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
