/* eslint-disable no-underscore-dangle */
import {withMock} from '@/core/faker';
import * as http from '@/util/http';
import {ArticleQuery, Comment} from '@/types/index';
import {
  articleListSchema,
  articleSchema,
  tagListSchema,
  commentListSchema
} from '@/types/index.schema';

async function _query(params?: ArticleQuery) {
  return http.get('articles', params);
}

export const query = import.meta.env.DEV
  ? withMock('query articles', _query, articleListSchema)
  : _query;

async function _findByTitle(title: string) {
  return http.get(`articles/${title}`).then(({article}) => article);
}

export const findByTitle = import.meta.env.DEV
  ? withMock('find articles by title', _findByTitle, articleSchema)
  : _findByTitle;

function _fetchCommentsByTitle(title: string) {
  return http
    .get(`articles/${title}/comments`)
    .then(({comments}) => comments as Comment[]);
}

export const fetchCommentsByTitle = import.meta.env.DEV
  ? withMock('find articles by title', _fetchCommentsByTitle, commentListSchema)
  : _fetchCommentsByTitle;

function _fetchTags() {
  return http.get('tags').then(({tags}) => tags as string[]);
}

export const fetchTags = import.meta.env.DEV
  ? withMock('find articles by title', _fetchTags, tagListSchema)
  : _fetchTags;
