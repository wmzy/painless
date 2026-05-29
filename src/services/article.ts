import * as http from '@/util/http';
import {ArticleQuery, Comment} from '@/types/index';

export async function query(params?: ArticleQuery) {
  return http.get<{articles: unknown[]; articlesCount: number}>(
    'articles',
    params
  );
}

export async function findByTitle(title: string) {
  return http
    .get<{article: unknown}>(`articles/${title}`)
    .then(({article}) => article);
}

export function fetchCommentsByTitle(title: string) {
  return http
    .get<{comments: Comment[]}>(`articles/${title}/comments`)
    .then(({comments}) => comments);
}

export function fetchTags() {
  return http.get<{tags: string[]}>('tags').then(({tags}) => tags);
}
