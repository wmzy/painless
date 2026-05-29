import type {Article} from '@/types';

import {useState} from 'react';
import {useData} from '@native-router/react';
import {Form, useForm, Field, reset, useFormContext, useError} from 'react-f0rm';
import {Card, Title, Text, Avatar, Divider, Textarea, Alert} from 'haze-ui';
import {css} from '@linaria/core';

import * as http from '@/util/http';

import CommentList from './CommentList';

function FieldError({name}: {name: string}) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const form = useFormContext();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const error = useError(form, name);
  return error ? <Text className={css`color: red; font-size: 0.875em;`}>{error}</Text> : null;
}

export default function ArticleView() {
  const article = useData() as Article;
  const commentForm = useForm();
  const [error, setError] = useState<string | null>(null);

  const handleCommentSubmit = async (values: {body: string}) => {
    try {
      await http.post(`articles/${article.slug}/comments`, {
        comment: {body: values.body}
      });
      reset(commentForm);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card>
      <Title>{article.title}</Title>
      <Avatar src={article.author.image} alt={article.author.username} />
      <Text>{article.author.username}</Text>
      <Divider />
      <div>
        {article.body.split('\\n').map((p, i) => (
          <Text key={i}>{p}</Text>
        ))}
      </div>
      <Divider />
      <Title level={3}>Comments</Title>
      {error && <Alert variant='danger'>{error}</Alert>}
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <Form form={commentForm} onValidSubmit={handleCommentSubmit} aria-label='Comment form'>
        <Field
          name='body'
          as={Textarea}
          placeholder='Write a comment...'
          validate={(v: unknown) => (!v ? 'Comment is required' : undefined)}
        />
        <FieldError name='body' />
        <button type='submit'>Post Comment</button>
      </Form>
      <CommentList title={article.slug} />
    </Card>
  );
}
