import {useState} from 'react';
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Text, Alert} from 'haze-ui';
import {useRouter} from '@native-router/react';
import {navigate} from '@native-router/core';
import * as auth from '@/services/auth';

export default function Register() {
  const form = useForm();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: any) => {
    try {
      await auth.register(values.username, values.email, values.password);
      navigate(router, '/');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Card>
      <Title>Register</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      <Form form={form} onValidSubmit={handleSubmit}>
        <Field
          name='username'
          as={Input}
          placeholder='Username'
          validate={(v: any) => (!v ? 'Username is required' : undefined)}
        />
        <Field
          name='email'
          as={Input}
          type='email'
          placeholder='Email'
          validate={(v: any) => {
            if (!v) return 'Email is required';
            if (!/\S+@\S+\.\S+/.test(v)) return 'Invalid email';
            return undefined;
          }}
        />
        <Field
          name='password'
          as={Input}
          type='password'
          placeholder='Password'
          validate={(v: any) => {
            if (!v) return 'Password is required';
            if (v.length < 8) return 'Password must be at least 8 characters';
            return undefined;
          }}
        />
        <button type='submit'>Register</button>
      </Form>
      <Text>
        Already have an account? <a href='/login'>Login</a>
      </Text>
    </Card>
  );
}
