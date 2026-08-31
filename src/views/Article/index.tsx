import {useState} from 'react';
import {css} from '@linaria/core';
import {navigate} from '@native-router/core';
import {useMatched} from '@native-router/react';
import {Form, useForm, reset, useIsSubmitting} from 'react-f0rm';
import {useMutation} from 'react-toolroom/async';
import {Card, Title, Text, Avatar, Divider, Textarea, Alert, Button, Badge, Flex, useToast, FormItem} from 'haze-ui';

import * as articleService from '@/services/article';
import {favoriteOnArticle, followOnArticle} from '@/services/mutations';
import {getCurrentUser} from '@/services/auth';
import {useArticleData} from '@/services/dataloaders';
import {commentsCache} from '@/util/useQuery';
import {useTitle} from '@/util/useTitle';

import CommentList from './CommentList';

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// 把收藏按钮推到作者行的右端
const pushRight = css`
  margin-left: auto;
`;

export default function ArticleView() {
  // useArticleData（createDataLoader 第二元素）：路由声明了 articleLoader
  //（见 views/index.tsx / dataloaders.ts），进组件前数据必已 resolve——
  // 原 useData<Article>()! 的泛型与断言都收敛进工厂；共用组件的路由若
  // 可能不挂 data（如 Editor 的新建态）则用 {optional: true} 形态
  const article = useArticleData();
  // 文章标题进 document.title：loader 已保证进组件前 resolve，title
  // 首帧即有，无「先默认后换」的闪烁；离开恢复入口默认
  useTitle(`${article.title} · Painless`);
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

  // 发评论 → 声明式前缀失效：commentsCache 的 key 就是精确的 [slug]
  //（见 dataloaders.ts 的 commentsCache 声明），[commentsCache, article.slug]
  // 只清当前文章的评论条目——其它 slug 的缓存原样保留，多文章互访回来
  // 不必重拉。CommentList 挂载中的 useCache 消费者经 provider 删除事件
  // 被动重拉。失败自动不失效。前缀里的 slug 经 useMutation 的 ref funnel
  // 取每次 mutate 调用时最新渲染的值（invalidates 读 optionsRef.current，
  // react-toolroom 源码 src/async/index.ts useMutation），路由参数变化
  // 不重挂也不会失效到旧 slug。与 Editor 对 homeCache 的整实体失效是
  // 刻意两种粒度：home 投影的 key 是 HomeSearch 对象（feed 过滤/分页的
  // 完整组合），编辑一篇文章影响哪些组合无法在写点本地推导，只能整实体
  // 清；评论的写（addComment(slug, body)）与缓存 key 一一对应，前缀即
  // 全量精确集。
  const [mutateAddComment] = useMutation(articleService.addComment, {
    invalidates: [[commentsCache, article.slug]]
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
