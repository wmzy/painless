import type {Article} from '@/types';

import {useState} from 'react';
import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {useData, useMatched} from '@native-router/react';
import {Form, useForm, reset, useIsSubmitting} from 'react-f0rm';
import {useMutation} from 'react-toolroom/async';
import {Card, Title, Text, Avatar, Divider, Textarea, Alert, Button, Badge, Flex, useToast, FormItem} from 'haze-ui';

import * as articleService from '@/services/article';
import {favoriteOnArticle, followOnArticle} from '@/services/mutations';
import {getCurrentUser} from '@/services/auth';
import {commentsCache} from '@/util/useQuery';

import CommentList from './CommentList';

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
  // favorite/follow 这类轻量写操作的失败反馈走 toast（乐观值已由管道
  // 自动回滚，无需页内 Alert 占位）；评论提交失败仍走页内 Alert（表单
  // 就在错误发生处，上下文更强）。
  const toast = useToast();

  // 乐观写穿管道全在 services/mutations.ts（cache.mutation 组合）：
  // 乐观首步 → 服务调用 → 字段选择式 apply → 失败自动回滚（并发写
  // 保护）。本视图只保留调用与错误提示——peek 合并/set/refresh 全部
  // 消失（refresh 由 loaderCache 的 set 事件订阅自动扇出），favorite
  // 同时写穿 home 投影缓存，返回列表页立即看到新计数。
  // scope 按 slug 串行同文章的连点（同 Home；follow 独立 scope 互不阻塞）
  const [favorite] = useMutation(favoriteOnArticle, {
    scope: (slug: string) => `favorite:${slug}`
  });
  const [follow] = useMutation(followOnArticle, {
    scope: (slug: string) => `follow:${slug}`
  });

  // 发评论 → 声明式失效：useMutation 成功后对 commentsCache 整实体失效
  //（前缀即全部条目），CommentList 挂载中的 useCache 消费者经 provider
  // 删除事件被动重拉。失败自动不失效。
  const [mutateAddComment] = useMutation(articleService.addComment, {
    invalidates: [commentsCache]
  });

  // 未登录（无 token）时写操作一律引导去登录页
  const requireAuth = (): boolean => {
    if (getCurrentUser()) return true;
    void navigate(router, '/login');
    return false;
  };

  const toggleFavorite = () => {
    if (!requireAuth()) return;
    void favorite(article.slug, !article.favorited).catch((e: unknown) =>
      toast(e instanceof Error ? e.message : 'Favorite failed', {
        variant: 'danger'
      })
    );
  };

  const toggleFollow = () => {
    if (!requireAuth()) return;
    void follow(article.slug, article.author.username, !article.author.following).catch(
      (e: unknown) =>
        toast(e instanceof Error ? e.message : 'Follow failed', {
          variant: 'danger'
        })
    );
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
          {article.author.following ? 'Unfollow' : 'Follow'}{' '}
          {article.author.username}
        </Button>
        <Button
          variant={article.favorited ? 'solid' : 'outline'}
          size='sm'
          aria-pressed={article.favorited}
          className={pushRight}
          onClick={toggleFavorite}
        >
          ❤{' '}
          <Badge variant={article.favorited ? 'success' : 'default'}>
            {article.favoritesCount}
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
