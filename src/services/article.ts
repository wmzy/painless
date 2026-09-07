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
// 虚拟模块（rollup-plugin-type-as-json-schema）：mock 管道共用同一份生成 schema。
import {
  articlePageSchema,
  articleSchema,
  authorSchema,
  commentListSchema,
  commentSchema,
  tagListSchema
} from '@/types/index.schema';

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

export function query(
  params?: ArticleQuery,
  signal?: AbortSignal
): Promise<ArticlePage> {
  return http.get<ArticlePage>('articles', params, {
    signal,
    schema: schemas?.list
  });
}

// fillPath 编译期约束参数集合，运行时逐值 encodeURIComponent。
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
// 写重试边界：新增实体写永不重试；toggle 效果幂等走 postRetryable/delRetryable。

export function favoriteArticle(
  slug: string,
  favorited: boolean,
  signal?: AbortSignal
): Promise<Article> {
  const url = fillPath('articles/{slug}/favorite', {slug});
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

// slug 缺省新建（POST）否则更新（PUT）；返回权威值（含最终 slug）。
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
// DELETE 在默认白名单内（幂等，二次 404 收敛），走主 client 默认重试。
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
