import type {Article} from '@/types';

import {useState} from 'react';
import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {useData, useMatched} from '@native-router/react';
import {Form, useForm, reset, useIsSubmitting} from 'react-f0rm';
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
import {FormItem} from 'haze-ui/form';

import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {queryCache} from '@/util/useQuery';

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
  // useData 约定：本路由挂了 loader，进组件前数据必有值，用 ! 收窄；
  // 无 loader 的可选数据路由（如 Editor）则用 ?? undefined
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

  // 发评论 → 声明式失效：useMutation 成功后对共享 queryCache 做 [slug]
  // 前缀失效（provider 的 deleteWhere），CommentList 这类挂载中的 useCache
  // 消费者经 provider 删除事件被动重拉。0.7 起失效按 cache 寻址——cache
  // 是模块级常量，直接引用即可，不再需要跨组件稳定 injectable（useQueryOf）。
  // 失败自动不失效。
  const [mutateAddComment] = useMutation(articleService.addComment, {
    invalidates: [[queryCache, article.slug]]
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
      // 评论字段的 Textarea 经 FormItem 的 control 桥接后是受控语义
      //（control 每次渲染读取 useValueByPath 订阅的实时表单值），reset
      // 改写表单值即可同步清空显存文本——不再需要 key 递增重挂子树。
      // 评论列表刷新由 invalidates 声明式负责（见上）。
      reset(commentForm, {body: ''});
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
      {/* 同 Editor：FormItem 桥接字段与控件（control 受控 + aria 链路），
          首条错误由 FormItem 渲染为字段下方的 <span role='alert'> */}
      <Form form={commentForm} onSubmit={handleCommentSubmit} aria-label='Comment form'>
        <FormItem
          form={commentForm}
          name='body'
          validate={(v: unknown) => (!v ? 'Comment is required' : undefined)}
        >
          {({id, errorId, invalid, control}) => (
            <Textarea
              id={id}
              value={control}
              placeholder='Write a comment...'
              aria-describedby={invalid ? errorId : undefined}
              aria-invalid={invalid}
            />
          )}
        </FormItem>
        <button type='submit' disabled={commentSubmitting}>
          {commentSubmitting ? 'Posting...' : 'Post Comment'}
        </button>
      </Form>
      <CommentList title={article.slug} />
    </Card>
  );
}
