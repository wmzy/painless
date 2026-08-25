import {List, ListItem, Avatar, Text, Spinner, Alert} from 'haze-ui';

import {commentsCache, useQuery} from '@/util/useQuery';
import * as articleService from '@/services/article';

type Props = {
  title: string;
};

// 四连 hook（useInjectable/useCache/useRun/useResult + useLoading/useError）
// 已收敛为项目级 useQuery preset。发评论后的刷新由 Article 视图的
// useMutation({invalidates: [commentsCache]}) 声明式负责：成功即整实体
// 失效并重拉本订阅者——组件自身不再需要 refreshKey/refetch。
// loading 为初载语义：重拉期间已有旧结果，loading 保持 false，列表
// 原样渲染，不闪 Spinner。
export default function CommentList({title}: Props) {
  const {data: comments, loading, error} = useQuery(
    articleService.fetchCommentsByTitle,
    [title],
    {cache: commentsCache, initData: []}
  );

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
