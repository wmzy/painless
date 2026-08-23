import {useState} from 'react';
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
import {useRouter, Link} from '@native-router/react';
import {navigate} from '@native-router/core';

import * as auth from '@/services/auth';
import {
  required,
  email,
  minLength,
  compose,
  applyApiFieldErrors
} from '@/util/validators';
import FieldError from '@/components/FieldError';

export default function Register() {
  type RegisterValues = {username: string; email: string; password: string};
  const form = useForm<RegisterValues>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {username: string; email: string; password: string}) => {
    try {
      await auth.register(values.username, values.email, values.password);
      void navigate(router, '/');
    } catch (e: unknown) {
      // 422 字段错误回填到对应字段下方，顶部 Alert 只兜非字段错误
      setError(applyApiFieldErrors(form, e, ['username', 'email', 'password']));
    }
  };

  return (
    <Card>
      <Title>Register</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      <Form form={form} onSubmit={handleSubmit} aria-label='Register form'>
        <Field
          form={form}
          name='username'
          as={Input}
          placeholder='Username'
          validate={required('Username is required')}
        />
        <FieldError name='username' />
        <Field
          form={form}
          name='email'
          as={Input}
          type='email'
          placeholder='Email'
          validate={compose(required('Email is required'), email('Invalid email'))}
        />
        <FieldError name='email' />
        <Field
          form={form}
          name='password'
          as={Input}
          type='password'
          placeholder='Password'
          validate={compose(
            required('Password is required'),
            minLength(8, 'Password must be at least 8 characters')
          )}
        />
        <FieldError name='password' />
        <button type='submit'>Register</button>
      </Form>
      <Text>
        Already have an account? <Link to='/login'>Login</Link>
      </Text>
    </Card>
  );
}
