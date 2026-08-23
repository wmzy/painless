import type {Article} from '@/types';

import {useState} from 'react';
import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {useData, useMatched} from '@native-router/react';
import {Form, useForm, Field, reset, useIsSubmitting} from 'react-f0rm';
import {useMutation} from 'react-toolroom/async';
import {
  Card,
  Title,
  Text,
  Avatar,
  Divider,
  Textarea,
  Alert,
  Button,
  Badge,
  Flex
} from 'haze-ui';

import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {useQueryOf} from '@/util/useQuery';
import FieldError from '@/components/FieldError';

import CommentList from './CommentList';

// 乐观更新的本地覆盖值；null 表示跟随 useData 的服务端值
type FavOverride = {favorited: boolean; favoritesCount: number};

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 把收藏按钮推到作者行的右端
const pushRight = css`
  margin-left: auto;
`;

export default function ArticleView() {
  const article = useData<Article>()!;
  const {router} = useMatched();
  const commentForm = useForm();
  // 同 Editor：react-f0rm ≥0.4 的 onSubmit 被 await，isSubmitting 覆盖整个异步提交
  const commentSubmitting = useIsSubmitting(commentForm);
  const [error, setError] = useState<string | null>(null);

  // favorite/follow 的乐观更新：article 数据来自路由 loader（非
  // useQuery injectable），useOptimistic 的 patch 目标不存在，本地
  // useState 覆盖即等价实现——点击先写，请求成功后以服务端返回校正，
  // 失败回滚到点击前的值（请求失败即服务端状态未变，回滚即权威值）。
  const [favOverride, setFavOverride] = useState<FavOverride | null>(null);
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  // 重挂评论表单子树（清空 Textarea 显存文本用），与列表刷新无关
  const [formRefresh, setFormRefresh] = useState(0);

  // 发评论 → 声明式失效：useMutation 的 invalidates 在成功后删除
  // fetchCommentsByTitle 的匹配缓存并重拉其活跃订阅者（CommentList）。
  // useQueryOf 保证拿到合法 injectable（即使 CommentList 尚未挂载），
  // 且与 CommentList 的 useQuery 复用同一实例；前缀 [fn, slug] 只清
  // 当前文章的评论。失败自动不失效。
  const commentsInjectable = useQueryOf(articleService.fetchCommentsByTitle);
  const [mutateAddComment] = useMutation(articleService.addComment, {
    invalidates: [[commentsInjectable, article.slug]]
  });

  const favorited = favOverride?.favorited ?? article.favorited;
  const favoritesCount =
    favOverride?.favoritesCount ?? article.favoritesCount;
  const following = followOverride ?? article.author.following;

  // 未登录（无 token）时写操作一律引导去登录页
  const requireAuth = (): boolean => {
    if (getCurrentUser()) return true;
    void navigate(router, '/login');
    return false;
  };

  const toggleFavorite = () => {
    if (!requireAuth()) return;
    const prev = {favorited, favoritesCount};
    const next = {
      favorited: !favorited,
      favoritesCount: favorited ? favoritesCount - 1 : favoritesCount + 1
    };
    setFavOverride(next);
    setError(null);
    articleService
      .favoriteArticle(article.slug, next.favorited)
      .then((a) =>
        setFavOverride({
          favorited: a.favorited,
          favoritesCount: a.favoritesCount
        })
      )
      .catch((e: unknown) => {
        setFavOverride(prev);
        setError(errText(e));
      });
  };

  const toggleFollow = () => {
    if (!requireAuth()) return;
    const prev = following;
    const next = !following;
    setFollowOverride(next);
    setError(null);
    articleService
      .followAuthor(article.author.username, next)
      .then((p) => setFollowOverride(p.following))
      .catch((e: unknown) => {
        setFollowOverride(prev);
        setError(errText(e));
      });
  };

  const handleCommentSubmit = async (values: {body: string}) => {
    try {
      await mutateAddComment(article.slug, values.body);
      // 两层清理：
      // 1) reset 清 form values/touched/errors（haze-ui 输入控件的 value
      //    仅播种其 useControl 内部态，prop 变化不会改显存的文本）；
      // 2) key 递增重挂表单子树，才是真正清空 Textarea 的机制。
      // 评论列表刷新由 invalidates 声明式负责（见上），不再手动重挂。
      reset(commentForm, {body: ''});
      setFormRefresh((k) => k + 1);
    } catch (e: unknown) {
      setError(errText(e));
    }
  };

  return (
    <Card>
      <Title>{article.title}</Title>
      <Flex align='center' gap='sm'>
        <Avatar src={article.author.image} alt={article.author.username} />
        <Text>{article.author.username}</Text>
        <Button variant='outline' size='sm' onClick={toggleFollow}>
          {following ? 'Unfollow' : 'Follow'} {article.author.username}
        </Button>
        <Button
          variant={favorited ? 'solid' : 'outline'}
          size='sm'
          aria-pressed={favorited}
          className={pushRight}
          onClick={toggleFavorite}
        >
          ❤{' '}
          <Badge variant={favorited ? 'success' : 'default'}>
            {favoritesCount}
          </Badge>
        </Button>
      </Flex>
      {error && <Alert variant='danger'>{error}</Alert>}
      <Divider />
      <div>
        {article.body.split('\n').map((p, i) => (
          <Text key={i}>{p}</Text>
        ))}
      </div>
      <Divider />
      <Title level={3}>Comments</Title>
      <Form
        key={formRefresh}
        form={commentForm}
        onSubmit={handleCommentSubmit}
        aria-label='Comment form'
      >
        <Field
          name='body'
          as={Textarea}
          placeholder='Write a comment...'
          validate={(v: unknown) => (!v ? 'Comment is required' : undefined)}
        />
        <FieldError name='body' />
        <button type='submit' disabled={commentSubmitting}>
          {commentSubmitting ? 'Posting...' : 'Post Comment'}
        </button>
      </Form>
      <CommentList title={article.slug} />
    </Card>
  );
}
