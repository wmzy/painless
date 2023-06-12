import type {
  Image,
  Paragraphs,
  PastDate,
  Sentence,
  Slug,
  Uint,
  Word
} from './base';

export type Author = {
  username: string;
  bio?: string;
  image: Image;
  following: boolean;
};

export type Comment = {
  createdAt: number;
  id: string;
  body: string;
  slug: Slug;
  author: Author;
  updatedAt: number;
};

export type Article = {
  tagList: Word[];
  author: Author;
  description: string;
  title: Sentence;
  body: Paragraphs;
  slug: Slug;
  createdAt: PastDate;
  updatedAt: PastDate;
  favoritesCount: Uint;
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
  /**
   * @minItems 10
   * @maxItems 10
   * @unique true
   */
  articles: Article[];
  articlesCount: Uint;
};

/**
 * @minItems 10
 * @maxItems 30
 */
export type TagList = Word[];

export type CommentList = Comment[];
