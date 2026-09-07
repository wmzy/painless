import type {
  Image,
  Paragraphs,
  PastDate,
  Sentence,
  Slug,
  Uint,
  Word
} from './base';

// bio/image 必填且可 null（对齐 spec，decisions.md #6）；视图消费 image 经 ?? undefined 收 null。
export type Author = {
  username: string;
  bio: string | null;
  image: Image | null;
  following: boolean;
};

export type Comment = {
  // 曾写成 number 与契约漂移（decisions.md #6）：RealWorld 返回 date-time 字符串。
  createdAt: PastDate;
  id: string;
  body: string;
  slug: Slug;
  author: Author;
  updatedAt: PastDate;
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

// GET /articles 的 author/favorited 维度；offset/limit 与 HomeSearch 同口径（key 经 hashArgs 归一）。
export type ProfileFeedQuery = {
  username: string;
  scope: 'author' | 'favorited';
  offset: number;
  limit: number;
};

/**
 * @minItems 10
 * @maxItems 30
 */
export type TagList = Word[];

export type CommentList = Comment[];
