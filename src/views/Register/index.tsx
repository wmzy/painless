import {useState} from 'react';
import {Form, useForm, Field, useFormContext, useError} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
import {useRouter, Link} from '@native-router/react';
import {css} from '@linaria/core';
import {navigate} from '@native-router/core';

import * as auth from '@/services/auth';

function FieldError({name}: {name: string}) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const form = useFormContext();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const error = useError(form, name);
  return error ? <Text className={css`color: red; font-size: 0.875em;`}>{error}</Text> : null;
}

export default function Register() {
  const form = useForm();
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
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <Form form={form} onValidSubmit={handleSubmit} aria-label='Register form'>
        <Field
          name='username'
          as={Input}
          placeholder='Username'
          validate={(v: unknown) => (!v ? 'Username is required' : undefined)}
        />
        <FieldError name='username' />
        <Field
          name='email'
          as={Input}
          type='email'
          placeholder='Email'
          validate={(v: unknown) => {
            if (!v) return 'Email is required';
            if (!/\S+@\S+\.\S+/.test(v as string)) return 'Invalid email';
            return undefined;
          }}
        />
        <FieldError name='email' />
        <Field
          name='password'
          as={Input}
          type='password'
          placeholder='Password'
          validate={(v: unknown) => {
            if (!v) return 'Password is required';
            if ((v as string).length < 8) return 'Password must be at least 8 characters';
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
