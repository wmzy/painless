import type {Comment} from '@/types';

import {useEffect, useState} from 'react';
import {formatDistanceToNow} from 'date-fns';
import {useMutation} from 'react-toolroom/async';
import {
  Avatar,
  AsyncSection,
  Button,
  ConfirmDialog,
  List,
  ListItem,
  Text
} from 'haze-ui';

import {getCurrentUser, onAuthChange, type User} from '@/services/auth';
import * as articleService from '@/services/article';
import {useCommentsQuery} from '@/services/dataloaders';
import {commentsCache} from '@/util/useQuery';
import {useToastError} from '@/util/toastError';

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
  const {data: comments, loading, error, dataUpdatedAt, refetch} =
    useCommentsQuery([title]);

  // 作者权（每条评论的删除入口可见性）：登录态订阅——401 自动登出/
  // 换账号登录时按钮态即时收敛
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  useEffect(() => onAuthChange(setUser), []);

  // 删评论 → 声明式前缀失效：commentsCache 的 key 就是精确的 [slug]，
  // 与发评论同一失效粒度——成功即失效本 slug 条目并重拉本订阅者（挂载
  // 中的 useCache 消费者经 provider 删除事件被动重拉），失败自动不失效。
  // 删除不可恢复：点击先弹 ConfirmDialog（pending 持有目标评论），确认
  // 才走 mutation；失败 toast（列表未动，错误上下文在 toast 足够）。
  // 进行中（isMutating）禁用删除入口：重复确认二发 DELETE，第二条 404
  // 的失败 toast 会与首条成功后触发的重拉竞速
  const [deleteComment, {isMutating: deleting}] = useMutation(
    articleService.deleteComment,
    {
      invalidates: [[commentsCache, title]]
    }
  );
  const toastError = useToastError();
  const [pending, setPending] = useState<Comment | null>(null);

  const handleDelete = async () => {
    const target = pending;
    setPending(null);
    if (!target) return;
    try {
      await deleteComment(title, target.id);
    } catch (e: unknown) {
      toastError(e, 'Delete failed');
    }
  };

  // 三分支收敛给 haze-ui AsyncSection（1.21）：loading 占位 / error
  // 错误框 + Retry / 正常态直渲染 children。Retry 调 refetch：删当前
  // args 的缓存条目后绕过缓存重拉——失败条目本就无 settled 值，重拉
  // 即从头再来；期间 loading 复归（初载语义），AsyncSection 的 loading
  // 优先级让重拉窗口回到占位。
  return (
    <AsyncSection
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      errorText='Failed to load comments'
    >
      {/* 数据新鲜度的可观测锚点：dataUpdatedAt 是本 args 最近一次成功
          settle 的时间戳（useArgsStatus 透出，见 useQuery.ts），发评论
          前缀失效重拉后自动刷新到新时刻。undefined（首载未成 / 另一组
          args 结果在展）不渲染。muted 小字刻意克制——列表正文的视觉
          重心仍在评论本身。 */}
      {dataUpdatedAt !== undefined && (
        <Text type='muted'>
          Updated {formatDistanceToNow(dataUpdatedAt, {addSuffix: true})}
        </Text>
      )}
      <List>
        {comments.map((c) => (
          <ListItem key={c.id}>
            <Avatar src={c.author.image ?? undefined} alt={c.author.username} />
            <Text>{c.body}</Text>
            {user?.username === c.author.username && (
              <Button
                variant='ghost'
                size='sm'
                aria-label='Delete comment'
                disabled={deleting}
                onClick={() => setPending(c)}
              >
                Delete
              </Button>
            )}
          </ListItem>
        ))}
      </List>
      {/* 删除确认（与 Article 的删除确认同款 ConfirmDialog）：条件挂载 +
          open 布尔，确认走 handleDelete（mutation + 失效重拉），取消/
          关闭只是关框留列表 */}
      {pending && (
        <ConfirmDialog
          open
          title='Delete comment?'
          confirmText='Delete'
          cancelText='Cancel'
          onConfirm={() => void handleDelete()}
          onCancel={() => setPending(null)}
          onClose={() => setPending(null)}
        >
          This will permanently delete the comment.
        </ConfirmDialog>
      )}
    </AsyncSection>
  );
}
