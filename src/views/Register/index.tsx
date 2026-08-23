import {useState} from 'react';
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
import {useRouter, Link} from '@native-router/react';
import {navigate} from '@native-router/core';

import * as auth from '@/services/auth';
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
      setError(e instanceof Error ? e.message : String(e));
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
          validate={(v: string) => (!v ? 'Username is required' : undefined)}
        />
        <FieldError name='username' />
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
          validate={(v: string) => {
            if (!v) return 'Password is required';
            if (v.length < 8) return 'Password must be at least 8 characters';
            return undefined;
          }}
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
