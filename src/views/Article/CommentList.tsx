import {List, ListItem, Avatar, Text, Spinner, Alert} from 'haze-ui';

import {useCommentsQuery} from '@/services/dataloaders';

type Props = {
  title: string;
};

// 组件通道收敛为 useCommentsQuery（场景 hook，声明见
// services/dataloaders.ts）：fetch/cache/initData 全部在场景声明点闭合，
// 调用点只给 args（initData 空数组已把 data 收窄为非空，列表直接 .map）
// ——原「四连 hook + 手拼三件套」的注释历史见 useQuery/withCache 各自
// 文件头。发评论后的刷新由 Article 视图的
// useMutation({invalidates: [commentsCache]}) 声明式负责：成功即整实体
// 失效并重拉本订阅者——组件自身不需要 refreshKey/refetch。
// loading 为初载语义：重拉期间已有旧结果，loading 保持 false，列表
// 原样渲染，不闪 Spinner。
export default function CommentList({title}: Props) {
  const {data: comments, loading, error} = useCommentsQuery([title]);

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
