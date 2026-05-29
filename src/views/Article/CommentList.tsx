import {
  createMemoryCacheProvider,
  useCache,
  useError,
  useInjectable,
  useLoading,
  useResult,
  useRun
} from 'react-toolroom/async';
import {List, ListItem, Avatar, Text, Spinner, Alert} from 'haze-ui';

import * as articleService from '@/services/article';

type Props = {title: string};

const cache = createMemoryCacheProvider<any, any[]>({
  cacheTime: 10000,
  hash: (k: any[]) => JSON.stringify(k)
});

export default function CommentList({title}: Props) {
  const fetchCommentsByTitle = useInjectable(
    articleService.fetchCommentsByTitle
  );
  useCache(fetchCommentsByTitle, cache, 2000);
  const comments = useResult(fetchCommentsByTitle, []);
  const loading = useLoading(fetchCommentsByTitle);
  const error = useError(fetchCommentsByTitle);

  useRun(fetchCommentsByTitle, [title]);

  if (loading) return <Spinner />;
  if (error) return <Alert variant='danger'>Failed to load comments</Alert>;

  return (
    <List>
      {comments.map((c) => (
        <ListItem key={c.id}>
          <Avatar src={c.author.image} alt={c.author.username} />
          <Text>{c.body}</Text>
        </ListItem>
      ))}
    </List>
  );
}
