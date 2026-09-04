import type {
  Article,
  ArticlePage,
  ArticleQuery,
  Author,
  Comment
} from '@/types/index';

import {fillPath} from 'fetch-fun';

import * as http from '@/util/http';
import {envelope} from '@/util/jsonSchema';
// 虚拟模块（rollup-plugin-type-as-json-schema）：与 mock 管道共用的同一
// 份生成 schema——「类型→schema→mock→运行时校验」全链单点契约。
import {
  articlePageSchema,
  articleSchema,
  authorSchema,
  commentListSchema,
  commentSchema,
  tagListSchema
} from '@/types/index.schema';

// dev-only 响应校验 schema：整组包在 import.meta.env.DEV 三元里，生产
// 构建折叠后 envelope/生成 schema 的引用一并被摇出——服务层零新增生产
// 成本；http 侧（init.schema → withSchema）同样只在 DEV 生效。列表/
// 单实体的 mock 口径注解（@minItems 等）由校验侧剔除，见 util/validate。
// 值类型 unknown：虚拟模块的导出是 any，unknown 槽位承接（校验侧自行
// 收窄），避免 any 沿着对象字面量扩散。
const schemas: Record<string, unknown> | undefined = import.meta.env.DEV
  ? {
      list: articlePageSchema,
      article: envelope('article', articleSchema),
      comments: envelope('comments', commentListSchema),
      tags: envelope('tags', tagListSchema),
      profile: envelope('profile', authorSchema),
      comment: envelope('comment', commentSchema)
    }
  : undefined;

// 只读查询统一接可选尾参 signal：createQueryHook 场景 hook 的
// useRun({signal: true}) 在 args 变化/卸载时 abort 上一次请求，透传到
// fetch 取消旧响应。
export function query(
  params?: ArticleQuery,
  signal?: AbortSignal
): Promise<ArticlePage> {
  return http.get<ArticlePage>('articles', params, {
    signal,
    schema: schemas?.list
  });
}

// 路径参数统一经 fillPath（fetch-fun 0.10）：模板 `{name}` 占位符在编译
// 期约束参数集合（缺键/多键都是类型错误），运行时逐值 encodeURIComponent
// ——标题/用户名里的空格、斜杠、中文不再依赖手拼模板字符串的裸插值。
export function findByTitle(
  title: string,
  signal?: AbortSignal
): Promise<Article> {
  return http
    .get<{article: Article}>(
      fillPath('articles/{title}', {title}),
      undefined,
      {signal, schema: schemas?.article}
    )
    .then(({article}) => article);
}

export function fetchCommentsByTitle(
  title: string,
  signal?: AbortSignal
): Promise<Comment[]> {
  return http
    .get<{comments: Comment[]}>(
      fillPath('articles/{title}/comments', {title}),
      undefined,
      {signal, schema: schemas?.comments}
    )
    .then(({comments}) => comments);
}

export function fetchTags(signal?: AbortSignal): Promise<string[]> {
  return http
    .get<{tags: string[]}>('tags', undefined, {signal, schema: schemas?.tags})
    .then(({tags}) => tags);
}

// ---- mutations ------------------------------------------------------------
// RealWorld 契约：favorite / follow 都是 toggle 端点——POST 添加、DELETE
// 取消，响应分别为 {article} / {profile}。这里统一解包返回实体，调用方
// 拿服务端权威值校正乐观状态。POST 无请求体，传 {} 仅满足 JSON 头。
// 尾参 signal 同样透传：提交侧的取消以「放弃等待结果」为语义，服务端
// 是否已执行以 HTTP 语义为准。
//
// 写操作重试边界：发评论（addComment）/ 新建文章（saveArticle 无 slug
// 方向）这类「每次调用都新增实体」的写永不重试——POST 在默认 retry
// 白名单外，重放等于重复提交。favorite/follow 例外：同端点 POST 添加 /
// DELETE 取消的 toggle，两个方向重复施加都收敛到同一终态（效果幂等），
// 瞬时失败（408/425/429/5xx/网络错误/超时）重放无害，统一走
// http.postRetryable/delRetryable——retry 白名单放宽为 POST+DELETE 的
// 兄弟 client，其余中间件与主 client 同源；重试拿回的也是服务端权威
// 值，乐观状态按 settle 校正，不会被重试放大。

export function favoriteArticle(
  slug: string,
  favorited: boolean,
  signal?: AbortSignal
): Promise<Article> {
  const url = fillPath('articles/{slug}/favorite', {slug});
  // toggle 两个方向同走 retryable 出口：添加方向（POST）在默认白名单
  // 外，此处显式声明该端点效果幂等；取消方向（DELETE）本就幂等，与
  // 添加方向共用同一份放宽后的重试策略（边界见上方 mutations 头注释）。
  const request = favorited
    ? http.postRetryable<{article: Article}>(
        url,
        {},
        {signal, schema: schemas?.article}
      )
    : http.delRetryable<{article: Article}>(url, {
        signal,
        schema: schemas?.article
      });
  return request.then(({article}) => article);
}

export function followAuthor(
  username: string,
  following: boolean,
  signal?: AbortSignal
): Promise<Author> {
  const url = fillPath('profiles/{username}/follow', {username});
  // 同 favoriteArticle：follow toggle 的两个方向都是效果幂等写。
  const request = following
    ? http.postRetryable<{profile: Author}>(
        url,
        {},
        {signal, schema: schemas?.profile}
      )
    : http.delRetryable<{profile: Author}>(url, {
        signal,
        schema: schemas?.profile
      });
  return request.then(({profile}) => profile);
}

export function addComment(
  slug: string,
  body: string,
  signal?: AbortSignal
): Promise<Comment> {
  return http
    .post<{comment: Comment}>(
      fillPath('articles/{slug}/comments', {slug}),
      {comment: {body}},
      {signal, schema: schemas?.comment}
    )
    .then(({comment}) => comment);
}

// 发布/编辑文章：slug 缺省走新建（POST articles），否则更新指定文章
//（PUT articles/{slug}）。RealWorld 契约请求体 {article}、响应 {article}，
// 统一解包返回实体，调用方拿服务端权威值（含最终 slug）做后续跳转/失效。
export function saveArticle(
  slug: string | undefined,
  article: Pick<Article, 'title' | 'description' | 'body' | 'tagList'>,
  signal?: AbortSignal
): Promise<Article> {
  const request = slug
    ? http.put<{article: Article}>(
        fillPath('articles/{slug}', {slug}),
        {article},
        {signal, schema: schemas?.article}
      )
    : http.post<{article: Article}>('articles', {article}, {signal, schema: schemas?.article});
  return request.then(({article: saved}) => saved);
}
