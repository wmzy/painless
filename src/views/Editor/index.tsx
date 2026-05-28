import {useState} from 'react';
import {Form, useForm, Field} from 'react-f0rm';
import {Card, Title, Input, Textarea, TagInput, Alert} from 'haze-ui';
import {useRouter, useData} from '@native-router/react';
import {navigate} from '@native-router/core';
import * as http from '@/util/http';
import type {Article} from '@/types';

export default function Editor() {
  const form = useForm();
  const router = useRouter();
  const article = useData() as Article | undefined;
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: any) => {
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
      <Form form={form} onValidSubmit={handleSubmit}>
        <Field
          name='title'
          as={Input}
          placeholder='Article Title'
          initialValue={article?.title}
          validate={(v: any) => (!v ? 'Title is required' : undefined)}
        />
        <Field
          name='description'
          as={Input}
          placeholder="What's this article about?"
          initialValue={article?.description}
          validate={(v: any) => (!v ? 'Description is required' : undefined)}
        />
        <Field
          name='body'
          as={Textarea}
          placeholder='Write your article...'
          initialValue={article?.body}
          validate={(v: any) => (!v ? 'Body is required' : undefined)}
        />
        <Field
          name='tagList'
          as={TagInput}
          placeholder='Add tags'
          initialValue={article?.tagList || []}
        />
        <button type='submit'>
          {article ? 'Update Article' : 'Publish Article'}
        </button>
      </Form>
    </Card>
  );
}
