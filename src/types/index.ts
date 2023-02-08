import { Uint } from "./base";

export type Author = {
  username: string;
  bio: string;
  image: string;
  following: boolean;
};

export type Comment = {
  createdAt: number;
  id: string;
  body: string;
  slug: string;
  author: Author;
  updatedAt: number;
};

export type Article = {
  tagList: string[];
  createdAt: number;
  author: Author;
  description: string;
  title: string;
  body: string;
  slug: string;
  updatedAt: number;
  favoritesCount: number;
  favorited: boolean;
};

export type ArticleList = Article[];

export type ArticleQuery = Partial<{
  offset: number;
  limit: number;
  favorited: string;
  author: string;
  tag: string;
}>;

export type ArticlePage = {
  articles: Article[];
  articlesCount: Uint;
};

export type TagList = string[];
export type CommentList = Comment[];
