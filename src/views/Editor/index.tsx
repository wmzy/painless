import {useState} from 'react';
import {Form, useForm, Field, useFormContext, useError} from 'react-f0rm';
import {Card, Title, Input, Textarea, TagInput, Text, Alert} from 'haze-ui';
import {css} from '@linaria/core';
import {useRouter, useData} from '@native-router/react';
import {navigate} from '@native-router/core';
import * as http from '@/util/http';
import type {Article} from '@/types';

function FieldError({name}: {name: string}) {
  const form = useFormContext();
  const error = useError(form, name);
  return error ? <Text className={css`color: red; font-size: 0.875em;`}>{error}</Text> : null;
}

export default function Editor() {
  const form = useForm();
  const router = useRouter();
  const article = useData() as Article | undefined;
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: {title: string; description: string; body: string; tagList: string[]}) => {
    try {
      const payload = {
        article: {
          title: values.title,
          description: values.description,
          body: values.body,
          tagList: values.tagList || []
        }
      };

      if (article) {
        await http.put(`articles/${article.slug}`, payload);
      } else {
        await http.post('articles', payload);
      }
      navigate(router, '/');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Card>
      <Title>{article ? 'Edit Article' : 'New Article'}</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      <Form form={form} onValidSubmit={handleSubmit} aria-label='Article editor form'>
        <Field
          name='title'
          as={Input}
          placeholder='Article Title'
          initialValue={article?.title}
          validate={(v: unknown) => (!v ? 'Title is required' : undefined)}
        />
        <FieldError name='title' />
        <Field
          name='description'
          as={Input}
          placeholder="What's this article about?"
          initialValue={article?.description}
          validate={(v: unknown) => (!v ? 'Description is required' : undefined)}
        />
        <FieldError name='description' />
        <Field
          name='body'
          as={Textarea}
          placeholder='Write your article...'
          initialValue={article?.body}
          validate={(v: unknown) => (!v ? 'Body is required' : undefined)}
        />
        <FieldError name='body' />
        <Field
          name='tagList'
          as={TagInput}
          placeholder='Add tags'
          initialValue={article?.tagList}
        />
        <button type='submit'>
          {article ? 'Update Article' : 'Publish Article'}
        </button>
      </Form>
    </Card>
  );
}
