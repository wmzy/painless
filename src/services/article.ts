/* eslint-disable no-underscore-dangle */
import * as http from '@/util/http';
import {ArticleQuery, Comment} from '@/types/index';

export async function query(params?: ArticleQuery) {
  return http.get('articles', params);
}

export async function findByTitle(title: string) {
  return http.get(`articles/${title}`).then(({article}) => article);
}

export function fetchCommentsByTitle(title: string) {
  return http
    .get(`articles/${title}/comments`)
    .then(({comments}) => comments as Comment[]);
}

export function fetchTags() {
  return http.get('tags').then(({tags}) => tags as string[]);
}
