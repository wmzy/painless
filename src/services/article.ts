import type {
  Article,
  ArticlePage,
  ArticleQuery,
  Author,
  Comment
} from '@/types/index';

import * as http from '@/util/http';

export function query(params?: ArticleQuery): Promise<ArticlePage> {
  return http.get<ArticlePage>('articles', params);
}

export function findByTitle(title: string): Promise<Article> {
  return http
    .get<{article: Article}>(`articles/${title}`)
    .then(({article}) => article);
}

export function fetchCommentsByTitle(title: string): Promise<Comment[]> {
  return http
    .get<{comments: Comment[]}>(`articles/${title}/comments`)
    .then(({comments}) => comments);
}

export function fetchTags(): Promise<string[]> {
  return http.get<{tags: string[]}>('tags').then(({tags}) => tags);
}

// ---- mutations ------------------------------------------------------------
// RealWorld 契约：favorite / follow 都是 toggle 端点——POST 添加、DELETE
// 取消，响应分别为 {article} / {profile}。这里统一解包返回实体，调用方
// 拿服务端权威值校正乐观状态。POST 无请求体，传 {} 仅满足 JSON 头。

export function favoriteArticle(
  slug: string,
  favorited: boolean
): Promise<Article> {
  const request = favorited
    ? http.post<{article: Article}>(`articles/${slug}/favorite`, {})
    : http.del<{article: Article}>(`articles/${slug}/favorite`);
  return request.then(({article}) => article);
}

export function followAuthor(
  username: string,
  following: boolean
): Promise<Author> {
  const request = following
    ? http.post<{profile: Author}>(`profiles/${username}/follow`, {})
    : http.del<{profile: Author}>(`profiles/${username}/follow`);
  return request.then(({profile}) => profile);
}

export function addComment(slug: string, body: string): Promise<Comment> {
  return http
    .post<{comment: Comment}>(`articles/${slug}/comments`, {
      comment: {body}
    })
    .then(({comment}) => comment);
}
