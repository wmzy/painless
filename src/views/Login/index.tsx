import {useState} from 'react';
import {Form, useForm, Field, useFormContext, useError} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
import {useRouter, Link} from '@native-router/react';
import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import * as auth from '@/services/auth';

function FieldError({name}: {name: string}) {
  const form = useFormContext();
  const error = useError(form, name);
  return error ? <Text className={css`color: red; font-size: 0.875em;`}>{error}</Text> : null;
}

export default function Login() {
  const form = useForm();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {email: string; password: string}) => {
    try {
      await auth.login(values.email, values.password);
      navigate(router, '/');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Card>
      <Title>Login</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      <Form form={form} onValidSubmit={handleSubmit} aria-label='Login form'>
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
          validate={(v: unknown) => (!v ? 'Password is required' : undefined)}
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
