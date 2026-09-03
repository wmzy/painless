import {useState} from 'react';
import {Form, useForm, reset, useIsSubmitting} from 'react-f0rm';
import {useMutation} from 'react-toolroom/async';
import {Card, Title, Text, Divider, TextareaCore, Alert, Button, FormItem} from 'haze-ui';

import * as articleService from '@/services/article';
import {favoriteOnArticle, followOnArticle} from '@/services/mutations';
import {useArticleData} from '@/services/dataloaders';
import {commentsCache} from '@/util/useQuery';
import {useTitle} from '@/util/useTitle';
import {useToastError} from '@/util/toastError';
import FavoriteButton from '@/components/FavoriteButton';
import {useFavorite, useRequireAuth} from '@/views/_shared/useFavorite';
import {AuthorLine} from '@/views/_shared/AuthorLine';

import CommentList from './CommentList';

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function ArticleView() {
  // useArticleData（createDataLoader 第二元素）：路由声明了 articleLoader
  //（见 views/index.tsx / dataloaders.ts），进组件前数据必已 resolve——
  // 原 useData<Article>()! 的泛型与断言都收敛进工厂；共用组件的路由若
  // 可能不挂 data（如 Editor 的新建态）则用 {optional: true} 形态
  const article = useArticleData();
  // 文章标题进 document.title：loader 已保证进组件前 resolve，title
  // 首帧即有，无「先默认后换」的闪烁；离开恢复入口默认
  useTitle(`${article.title} · Painless`);
  // 表单值形状：handleCommentSubmit 的 values 与此泛型一致
  const commentForm = useForm<{body: string}>();
  // 同 Editor：react-f0rm ≥0.4 的 onSubmit 被 await，isSubmitting 覆盖整个异步提交
  const commentSubmitting = useIsSubmitting(commentForm);
  const [error, setError] = useState<string | null>(null);
  // favorite/follow 这类轻量写操作的失败反馈走 toast（乐观值已由管道
  // 自动回滚，无需页内 Alert 占位，收敛点见 src/util/toastError.ts）；
  // 评论提交失败仍走页内 Alert（表单就在错误发生处，上下文更强）。
  const toastError = useToastError();

  // 乐观写穿管道全在 services/mutations.ts（cache.mutation 组合）：
  // 乐观首步 → 服务调用 → 字段选择式 apply → 失败自动回滚（并发写
  // 保护）。favorite 已收敛进 useFavorite（views/_shared/useFavorite.ts，
  // 与 Home 共用）：article 单层 spec 注入，scope 按 slug 串行连点、
  // 未登录跳登录与 toast 失败提示都在 hook 内——本视图只保留调用。
  // follow 留在视图：独立 scope（与 favorite 互不阻塞）。
  const onFavorite = useFavorite(favoriteOnArticle);
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

  // 未登录（无 token）时写操作一律引导去登录页：requireAuth 闸门已与
  // favorite 收敛进 views/_shared/useFavorite.ts（useRequireAuth——
  // pathname+search 整体 encode 进 redirect，登录后回跳本页）
  const requireAuth = useRequireAuth();

  const toggleFavorite = () => onFavorite(article.slug, !article.favorited);

  const toggleFollow = () => {
    if (!requireAuth()) return;
    void follow(article.slug, article.author.username, !article.author.following).catch(
      (e: unknown) => toastError(e, 'Follow failed')
    );
  };

  const handleCommentSubmit = async (values: {body: string}) => {
    try {
      await mutateAddComment(article.slug, values.body);
      // 评论字段的 TextareaCore 经 FormItem value 直出后是受控语义
      //（value 每次渲染读取 useValueByPath 订阅的实时表单值），reset
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
      <AuthorLine author={article.author}>
        <Button variant='outline' size='sm' onClick={toggleFollow}>
          {article.author.following ? 'Unfollow' : 'Follow'}{' '}
          {article.author.username}
        </Button>
        <FavoriteButton
          favorited={article.favorited}
          favoritesCount={article.favoritesCount}
          onToggle={toggleFavorite}
        />
      </AuthorLine>
      {error && <Alert variant='danger'>{error}</Alert>}
      <Divider />
      <div>
        {article.body.split('\n').map((p, i) => (
          <Text key={i}>{p}</Text>
        ))}
      </div>
      <Divider />
      <Title level={3}>Comments</Title>
      {/* 同 Editor：FormItem input 声明式桥接字段与受控核心（接线 +
          aria 链路全由 FormItem 负责），首条错误由 FormItem 渲染为字段
          下方的 <span role='alert'> */}
      <Form form={commentForm} onSubmit={handleCommentSubmit} aria-label='Comment form'>
        <FormItem
          form={commentForm}
          name='body'
          validate={(v: unknown) => (!v ? 'Comment is required' : undefined)}
          input={TextareaCore}
          placeholder='Write a comment...'
        />
        <button type='submit' disabled={commentSubmitting}>
          {commentSubmitting ? 'Posting...' : 'Post Comment'}
        </button>
      </Form>
      <CommentList title={article.slug} />
    </Card>
  );
}
