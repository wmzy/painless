import type {
  Article,
  ArticlePage,
  ArticleQuery,
  Author,
  Comment,
  ProfileFeedQuery
} from '@/types/index';
import type {Uint} from '@/types/base';

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

// schema 静态烘焙进链（模块级一次，生产折叠后恒等于 api/toggleApi）；
// signal 是每请求瞬态，调用点经 withSignal 挂载。validate factory 在
// fetch 时从合并链读 url/method 合成 label——同一烘焙链可服务多个 URL
//（findByTitle/saveArticle/favoriteArticle 共用 article 两条）。
const clients = {
  list: http.withDevValidation(http.api, schemas?.list),
  article: http.withDevValidation(http.api, schemas?.article),
  comments: http.withDevValidation(http.api, schemas?.comments),
  tags: http.withDevValidation(http.api, schemas?.tags),
  comment: http.withDevValidation(http.api, schemas?.comment),
  toggleArticle: http.withDevValidation(http.toggleApi, schemas?.article),
  toggleProfile: http.withDevValidation(http.toggleApi, schemas?.profile)
};

export function query(
  params?: ArticleQuery,
  signal?: AbortSignal
): Promise<ArticlePage> {
  return http.get<ArticlePage>(
    'articles',
    params,
    http.withSignal(clients.list, signal)
  );
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
      http.withSignal(clients.article, signal)
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
      http.withSignal(clients.comments, signal)
    )
    .then(({comments}) => comments);
}

export function fetchTags(signal?: AbortSignal): Promise<string[]> {
  return http
    .get<{tags: string[]}>(
      'tags',
      undefined,
      http.withSignal(clients.tags, signal)
    )
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
        http.withSignal(clients.toggleArticle, signal)
      )
    : http.delRetryable<{article: Article}>(
        url,
        http.withSignal(clients.toggleArticle, signal)
      );
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
        http.withSignal(clients.toggleProfile, signal)
      )
    : http.delRetryable<{profile: Author}>(
        url,
        http.withSignal(clients.toggleProfile, signal)
      );
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
      http.withSignal(clients.comment, signal)
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
        http.withSignal(clients.article, signal)
      )
    : http.post<{article: Article}>(
        'articles',
        {article},
        http.withSignal(clients.article, signal)
      );
  return request.then(({article: saved}) => saved);
}

// ---- deletions ------------------------------------------------------------
// DELETE 在默认白名单内（幂等，二次 404 收敛），走主 client 默认重试。
// 删除不挂响应校验（无 envelope 契约，返回体即空）。
export function deleteArticle(
  slug: string,
  signal?: AbortSignal
): Promise<void> {
  return http
    .del(
      fillPath('articles/{slug}', {slug}),
      http.withSignal(http.api, signal)
    )
    .then(() => undefined);
}

export function deleteComment(
  slug: string,
  id: Uint,
  signal?: AbortSignal
): Promise<void> {
  return http
    .del(
      fillPath('articles/{slug}/comments/{id}', {slug, id}),
      http.withSignal(http.api, signal)
    )
    .then(() => undefined);
}
