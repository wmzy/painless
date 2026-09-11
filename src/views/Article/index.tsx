import type {AppRoutes} from '@/views';

import {useEffect, useState} from 'react';
import {css} from '@linaria/core';
import {Form, useForm, reset, useIsSubmitting} from 'react-f0rm';
import {useMutation} from 'react-toolroom/async';
import {TypedLink, useRouter} from '@native-router/react';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  Divider,
  FormItem,
  MarkdownRenderer,
  TextareaCore,
  Title
} from 'haze-ui';

import {getCurrentUser, onAuthChange, type User} from '@/services/auth';
import * as articleService from '@/services/article';
import {favoriteOnArticle, followOnArticle} from '@/services/mutations';
import {useArticleData} from '@/services/dataloaders';
import {articleCache, commentsCache, homeCache, profileFeedCache} from '@/util/useQuery';
import {useToastError} from '@/util/toastError';
import {useTitle} from '@/util/useTitle';
import {sanitizeMarkdown} from '@/util/markdown';
import FavoriteButton from '@/components/FavoriteButton';
import SubmitButton from '@/components/SubmitButton';
import {useFavorite, useRequireAuth} from '@/views/_shared/useFavorite';
import {AuthorLine} from '@/views/_shared/AuthorLine';
import {navigateTo} from '@/views/navigateTo';

import CommentList from './CommentList';

// 文章页排版：卡片收敛到长文行宽（17px 正文 ≈ 75 字符/行），标题用
// 全站最大的衬线字阶——文章页是内容的重心页
const articleCard = css`
  max-width: 860px;
  margin-inline: auto;
`;

const articleTitle = css`
  font-size: 42px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin-bottom: var(--haze-space-5);
`;

const articleBody = css`
  padding-block: var(--haze-space-2) var(--haze-space-4);
`;

// 评论提交行：按钮右对齐（短表单行动区，非通栏主行动），与下方
// 评论列表之间留出呼吸位
const commentActions = css`
  display: flex;
  justify-content: flex-end;
  margin-top: var(--haze-space-3);
  margin-bottom: var(--haze-space-4);
`;

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

  // 作者权（Edit/Delete 入口的可见性）：登录态订阅（Profile 视图同款
  // 形态）——401 自动登出/换账号登录时按钮态即时收敛，不留「已登出仍
  // 可见编辑入口」的过期 UI
  const [user, setUser] = useState<User | null>(() => getCurrentUser());
  useEffect(() => onAuthChange(setUser), []);
  const isAuthor = user?.username === article.author.username;
  // 删除文章：deleteArticle(slug) 与缓存失效、跳转的声明式组装——
  // 成功后整实体失效 articleCache（当前文章条目）+ homeCache /
  // profileFeedCache（两处列表投影的 key 是完整查询组合，删除改变
  // 哪些组合无法在写点本地推导，整实体清是唯一声明的正确粒度，同
  // Editor 保存的论证）+ commentsCache 前缀（文章没了评论条目即成
  // 孤儿）；失败自动不失效。跳转在 await 之后：invalidates 已在 mutate
  // 的成功分支先于 await 返回执行，navigate 时缓存必已失效。进行中
  //（isMutating）门控 Delete 入口：重复确认会二发 DELETE，第二条 404
  // 的失败 toast 会与首条的跳转竞速
  const [deleteMutation, {isMutating: deleting}] = useMutation(
    articleService.deleteArticle,
    {
      invalidates: [
        articleCache,
        homeCache,
        profileFeedCache,
        [commentsCache, article.slug]
      ]
    }
  );
  // 确认框驱动状态：删除不可恢复，编辑按钮旁的 Delete 先弹 ConfirmDialog
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteMutation(article.slug);
      // NCE 吞除与 fire-and-forget 收敛在 navigateTo（「停在旧视图」
      // 语义）
      navigateTo(router, '/');
    } catch (e: unknown) {
      // 失败留在本页：乐观不存在（删除无乐观态），toast 只补「为什么
      // 没发生」
      toastError(e, 'Delete failed');
    }
  };

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
    // 新一轮提交即刻撤下上次顶部错误，避免提交窗口内显示过期错误误导
    setError(null);
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
    <Card className={articleCard}>
      <Title className={articleTitle}>{article.title}</Title>
      <AuthorLine author={article.author}>
        {/* 作者权入口：Edit 直达编辑路由（params 即 slug，编译期判别），
            Delete 先弹确认框（删除不可恢复）——非作者不渲染 */}
        {isAuthor && (
          <>
            <TypedLink<AppRoutes, typeof ButtonLink>
              as={ButtonLink}
              to='/editor/:slug'
              params={{slug: article.slug}}
              variant='outline'
              size='sm'
            >
              Edit Article
            </TypedLink>
            <Button
              variant='ghost'
              size='sm'
              disabled={deleting}
              onClick={() => setConfirmDelete(true)}
            >
              Delete Article
            </Button>
          </>
        )}
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
      {/* 正文经 MarkdownRenderer 渲染（haze-ui 正则子集解析：标题/强调/
          列表/引用/代码块），此前按行拆成 Text 会把 "##" 等语法字面量
          显示出来。渲染前过 sanitizeMarkdown（util/markdown.ts）：API
          正文是用户生成内容，非代码区的原始 HTML 标签剥除后再注入，
          围栏代码块由渲染器自行转义。 */}
      <div className={articleBody}>
        <MarkdownRenderer content={sanitizeMarkdown(article.body)} />
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
        <div className={commentActions}>
          <SubmitButton fullWidth={false} disabled={commentSubmitting}>
            {commentSubmitting ? 'Posting...' : 'Post Comment'}
          </SubmitButton>
        </div>
      </Form>
      <CommentList title={article.slug} />
      {/* 删除确认：与 Editor 未保存拦截同款 ConfirmDialog（条件挂载 +
          open 布尔）。确认走 handleDelete（mutation + 跳转），取消/关闭
          只是关框留页 */}
      {confirmDelete && (
        <ConfirmDialog
          open
          title='Delete article?'
          confirmText='Delete'
          cancelText='Cancel'
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
          onClose={() => setConfirmDelete(false)}
        >
          This will permanently delete the article. This action cannot be
          undone.
        </ConfirmDialog>
      )}
    </Card>
  );
}
