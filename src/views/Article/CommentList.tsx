import {css} from '@linaria/core';
import * as articleService from '@/services/article';
import {
  createMemoryCacheProvider,
  useCache,
  useError,
  useInjectable,
  useLoading,
  useResult,
  useRun
} from 'react-toolroom/async';

type Props = {title: string};

const cache = createMemoryCacheProvider<any, any[]>({
  cacheTime: 10000,
  hash: (k: any[]) => JSON.stringify(k)
});

export default function CommentList({title}: Props) {
  const fetchCommentsByTitle = useInjectable(
    articleService.fetchCommentsByTitle
  );
  const isStale = useCache(fetchCommentsByTitle, cache, 2000);
  const comments = useResult(fetchCommentsByTitle, []);
  const loading = useLoading(fetchCommentsByTitle);
  const error = useError(fetchCommentsByTitle);

  useRun(fetchCommentsByTitle, [title]);

  if (loading) return <div>Loading...</div>;

  return (
    <ul>
      {comments.map((c) => (
        <li key={c.id}>{c.body}</li>
      ))}
    </ul>
  );
}
