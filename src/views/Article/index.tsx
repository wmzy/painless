import {useData} from '@native-router/react';
import {Form, useForm, Field, reset} from 'react-f0rm';
import {Card, Title, Text, Avatar, Divider, Textarea} from 'haze-ui';
import type {Article} from '@/types';
import * as http from '@/util/http';
import CommentList from './CommentList';

export default function ArticleView() {
  const article = useData() as Article;
  const commentForm = useForm();

  const handleCommentSubmit = async (values: any) => {
    await http.post(`articles/${article.slug}/comments`, {
      comment: {body: values.body}
    });
    reset(commentForm);
  };

  return (
    <Card>
      <Title>{article.title}</Title>
      <Avatar src={article.author.image} alt={article.author.username} />
      <Text>{article.author.username}</Text>
      <Divider />
      <div>
        {article.body.split('\\n').map((p, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={i}>{p}</Text>
        ))}
      </div>
      <Divider />
      <Title level={3}>Comments</Title>
      <Form form={commentForm} onValidSubmit={handleCommentSubmit}>
        <Field
          name='body'
          as={Textarea}
          placeholder='Write a comment...'
          validate={(v: any) => (!v ? 'Comment is required' : undefined)}
        />
        <button type='submit'>Post Comment</button>
      </Form>
      <CommentList title={article.slug} />
    </Card>
  );
}
