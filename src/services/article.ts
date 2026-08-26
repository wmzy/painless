import type {
  Article,
  ArticlePage,
  ArticleQuery,
  Author,
  Comment
} from '@/types/index';

import {fillPath} from 'fetch-fun';

import * as http from '@/util/http';

// 只读查询统一接可选尾参 signal：useQuery 的 useRun({signal: true}) 在
// args 变化/卸载时 abort 上一次请求，透传到 fetch 取消旧响应。
export function query(
  params?: ArticleQuery,
  signal?: AbortSignal
): Promise<ArticlePage> {
  return http.get<ArticlePage>('articles', params, {signal});
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
      {signal}
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
      {signal}
    )
    .then(({comments}) => comments);
}

export function fetchTags(signal?: AbortSignal): Promise<string[]> {
  return http
    .get<{tags: string[]}>('tags', undefined, {signal})
    .then(({tags}) => tags);
}

// ---- mutations ------------------------------------------------------------
// RealWorld 契约：favorite / follow 都是 toggle 端点——POST 添加、DELETE
// 取消，响应分别为 {article} / {profile}。这里统一解包返回实体，调用方
// 拿服务端权威值校正乐观状态。POST 无请求体，传 {} 仅满足 JSON 头。
// 尾参 signal 同样透传：提交侧的取消以「放弃等待结果」为语义，服务端
// 是否已执行以 HTTP 语义为准（重试管道只放行幂等方法，POST 不会重放）。

export function favoriteArticle(
  slug: string,
  favorited: boolean,
  signal?: AbortSignal
): Promise<Article> {
  const url = fillPath('articles/{slug}/favorite', {slug});
  const request = favorited
    ? http.post<{article: Article}>(url, {}, {signal})
    : http.del<{article: Article}>(url, {signal});
  return request.then(({article}) => article);
}

export function followAuthor(
  username: string,
  following: boolean,
  signal?: AbortSignal
): Promise<Author> {
  const url = fillPath('profiles/{username}/follow', {username});
  const request = following
    ? http.post<{profile: Author}>(url, {}, {signal})
    : http.del<{profile: Author}>(url, {signal});
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
      {signal}
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
        {signal}
      )
    : http.post<{article: Article}>('articles', {article}, {signal});
  return request.then(({article: saved}) => saved);
}
