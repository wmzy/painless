import {formatDistanceToNow} from 'date-fns';
import {zhCN} from 'date-fns/locale';
import {List, ListItem, Avatar, Text, Spinner, Alert} from 'haze-ui';

import {useCommentsQuery} from '@/services/dataloaders';

type Props = {
  title: string;
};

// 组件通道收敛为 useCommentsQuery（场景 hook，声明见
// services/dataloaders.ts）：fetch/cache/initData 全部在场景声明点闭合，
// 调用点只给 args（initData 空数组已把 data 收窄为非空，列表直接 .map）
// ——原「四连 hook + 手拼三件套」的注释历史见 useQuery/withCache 各自
// 文件头。发评论后的刷新由 Article 视图的前缀失效声明式负责（见其
// invalidates 注释）：成功即失效本 slug 条目并重拉本订阅者——组件自身
// 不需要 refreshKey/refetch。
// loading 为初载语义：重拉期间已有旧结果，loading 保持 false，列表
// 原样渲染，不闪 Spinner。
export default function CommentList({title}: Props) {
  const {data: comments, loading, error, dataUpdatedAt} = useCommentsQuery([title]);

  if (loading) return <Spinner />;
  if (error) return <Alert variant='danger'>Failed to load comments</Alert>;

  return (
    <>
      {/* 数据新鲜度的可观测锚点：dataUpdatedAt 是本 args 最近一次成功
          settle 的时间戳（useArgsStatus 透出，见 useQuery.ts），发评论
          前缀失效重拉后自动刷新到新时刻。undefined（首载未成 / 另一组
          args 结果在展）不渲染。muted 小字刻意克制——列表正文的视觉
          重心仍在评论本身。 */}
      {dataUpdatedAt !== undefined && (
        <Text type='muted'>
          更新于 {formatDistanceToNow(dataUpdatedAt, {addSuffix: true, locale: zhCN})}
        </Text>
      )}
      <List>
        {comments.map((c) => (
          <ListItem key={c.id}>
            <Avatar src={c.author.image} alt={c.author.username} />
            <Text>{c.body}</Text>
          </ListItem>
        ))}
      </List>
    </>
  );
}
