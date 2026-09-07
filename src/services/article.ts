import type {
  Article,
  ArticlePage,
  ArticleQuery,
  Author,
  Comment,
  ProfileFeedQuery
} from '@/types/index';

import {fillPath} from 'fetch-fun';

import * as http from '@/util/http';
import {envelope} from '@/util/jsonSchema';
// 虚拟模块（rollup-plugin-type-as-json-schema）：mock 管道共用的同一份生成 schema。
import {
  articlePageSchema,
  articleSchema,
  authorSchema,
  commentListSchema,
  commentSchema,
  tagListSchema
} from '@/types/index.schema';

// dev-only 校验 schema：整组包 DEV 三元，生产折叠摇出（decisions.md #7）。
// 值收 unknown：虚拟模块导出 any，防 any 沿对象字面量扩散。
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

// 只读查询统一接可选尾参 signal（useRun abort 透传到 fetch）。
export function query(
  params?: ArticleQuery,
  signal?: AbortSignal
): Promise<ArticlePage> {
  return http.get<ArticlePage>('articles', params, {
    signal,
    schema: schemas?.list
  });
}

// 路径参数统一经 fillPath：编译期约束参数集合，运行时逐值 encodeURIComponent。
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

// GET /articles 的 author/favorited 维度；复用 query 管道，只把 ProfileFeedQuery 投影成 ArticleQuery。
export function queryProfileFeed(
  q: ProfileFeedQuery,
  signal?: AbortSignal
): Promise<ArticlePage> {
  const {username, scope, offset, limit} = q;
  return query(
    scope === 'author'
      ? {author: username, offset, limit}
      : {favorited: username, offset, limit},
    signal
  );
}

// ---- mutations ------------------------------------------------------------
// favorite/follow 是 toggle 端点（POST 添加/DELETE 取消），统一解包返回实体校正乐观状态。
// 写重试边界：新增实体的写（addComment/saveArticle 新建）永不重试（POST 默认白名单外）；
// toggle 效果幂等走 postRetryable/delRetryable（白名单放宽 POST+DELETE，重放无害）。

export function favoriteArticle(
  slug: string,
  favorited: boolean,
  signal?: AbortSignal
): Promise<Article> {
  const url = fillPath('articles/{slug}/favorite', {slug});
  // 两个方向同走 retryable 出口（该端点效果幂等，边界见上方 mutations 头注释）。
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

// slug 缺省新建（POST），否则更新（PUT）；请求/响应均 {article}，解包返回权威值（含最终 slug）。
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

// ---- deletions ------------------------------------------------------------
// DELETE 在默认白名单内（幂等，二次 404 收敛），走主 client 默认重试；响应空体 200。
export function deleteArticle(
  slug: string,
  signal?: AbortSignal
): Promise<void> {
  return http
    .del(fillPath('articles/{slug}', {slug}), {signal})
    .then(() => undefined);
}

export function deleteComment(
  slug: string,
  id: string,
  signal?: AbortSignal
): Promise<void> {
  return http
    .del(fillPath('articles/{slug}/comments/{id}', {slug, id}), {
      signal
    })
    .then(() => undefined);
}
