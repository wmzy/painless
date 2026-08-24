import type {Article} from '@/types';

import {useState} from 'react';
import {css} from '@linaria/core';
import {navigate, refresh} from '@native-router/core';
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
import {articleCacheArgs} from '@/util/loaderCache';
import {queryCache} from '@/util/useQuery';

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
  const {router, params} = useMatched();
  const commentForm = useForm();
  // 同 Editor：react-f0rm ≥0.4 的 onSubmit 被 await，isSubmitting 覆盖整个异步提交
  const commentSubmitting = useIsSubmitting(commentForm);
  const [error, setError] = useState<string | null>(null);

  // 写穿缓存：与路由 loader 同一 key（loader 侧 withCache(['article'])，
  // 见 views/index.tsx）。applyCache 把最新值直接 set 进共享 queryCache 再
  // refresh 当前视图——loader 重跑时新鲜命中缓存，纯本地更新（零请求、
  // 零骨架、零 loading），useData 换新后整视图重渲染。手写 useState
  // override 模式（0.7 前）作废：缓存写穿同时惠及 loader（回退/重进
  // 命中）与并发在飞的请求（代次守卫防旧响应覆盖）。
  const key = articleCacheArgs(params.title!);
  const applyCache = (next: Article) => {
    queryCache.set(key, next);
    void refresh(router);
  };

  // 发评论 → 声明式失效：useMutation 成功后对共享 queryCache 做 [slug]
  // 前缀失效（provider 的 deleteWhere），CommentList 这类挂载中的 useCache
  // 消费者经 provider 删除事件被动重拉。0.7 起失效按 cache 寻址——cache
  // 是模块级常量，直接引用即可，不再需要跨组件稳定 injectable（useQueryOf）。
  // 失败自动不失效。
  const [mutateAddComment] = useMutation(articleService.addComment, {
    invalidates: [[queryCache, article.slug]]
  });

  // 未登录（无 token）时写操作一律引导去登录页
  const requireAuth = (): boolean => {
    if (getCurrentUser()) return true;
    void navigate(router, '/login');
    return false;
  };

  const toggleFavorite = () => {
    if (!requireAuth()) return;
    // 点击时快照：请求失败即服务端状态未变，回滚到它就是回到权威值
    const snapshot = article;
    setError(null);
    applyCache({
      ...snapshot,
      favorited: !snapshot.favorited,
      favoritesCount: snapshot.favorited
        ? snapshot.favoritesCount - 1
        : snapshot.favoritesCount + 1
    });
    articleService
      .favoriteArticle(snapshot.slug, !snapshot.favorited)
      .then((a) => applyCache(a))
      .catch((e: unknown) => {
        applyCache(snapshot);
        setError(errText(e));
      });
  };

  const toggleFollow = () => {
    if (!requireAuth()) return;
    const snapshot = article;
    setError(null);
    applyCache({
      ...snapshot,
      author: {...snapshot.author, following: !snapshot.author.following}
    });
    articleService
      .followAuthor(snapshot.author.username, !snapshot.author.following)
      .then((p) => {
        // 成功回调用 peek 取当前值合并：follow 在飞期间 favorite 可能已
        // 写穿缓存，直接铺开闭包里的旧 snapshot 会把它覆盖掉
        const cur = (queryCache.peek!(key)?.value as Article | undefined) ?? snapshot;
        applyCache({...cur, author: p});
      })
      .catch((e: unknown) => {
        applyCache(snapshot);
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
