import {useState} from 'react';
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
import {useRouter, Link} from '@native-router/react';
import {navigate} from '@native-router/core';

import * as auth from '@/services/auth';
import FieldError from '@/components/FieldError';

export default function Login() {
  // 类型化表单：validate 参数与 handleSubmit 的 values 均由此推断
  type LoginValues = {email: string; password: string};
  const form = useForm<LoginValues>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {email: string; password: string}) => {
    try {
      await auth.login(values.email, values.password);
      void navigate(router, '/');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <Title>Login</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      {/* react-f0rm ≥0.4：onSubmit 被 await，isSubmitting 覆盖整个异步提交 */}
      <Form form={form} onSubmit={handleSubmit} aria-label='Login form'>
        <Field
          form={form}
          name='email'
          as={Input}
          type='email'
          placeholder='Email'
          validate={(v: string) => {
            if (!v) return 'Email is required';
            if (!/\S+@\S+\.\S+/.test(v)) return 'Invalid email';
            return undefined;
          }}
        />
        <FieldError name='email' />
        <Field
          form={form}
          name='password'
          as={Input}
          type='password'
          placeholder='Password'
          validate={(v: string) => (!v ? 'Password is required' : undefined)}
        />
        <FieldError name='password' />
        <button type='submit'>Login</button>
      </Form>
      <Text>
        Don't have an account? <Link to='/register'>Register</Link>
      </Text>
    </Card>
  );
}
