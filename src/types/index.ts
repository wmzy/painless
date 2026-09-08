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
  // id 是后端整数（spec 2.0 integer）；createdAt/updatedAt 是 date-time
  // 字符串（曾写成 number 与契约漂移，decisions.md #6）。
  createdAt: PastDate;
  id: Uint;
  body: string;
  author: Author;
  updatedAt: PastDate;
};

// 列表投影条目：spec 2.0 的列表响应（GET /articles、?author=、?favorited=）
// 不含 body（仅 detail 返回）。与 Article 字段重复是刻意的——schema 生成
// 插件不支持交叉类型/Omit，两型各自完整声明。
export type ArticleSummary = {
  tagList: Word[];
  author: Author;
  description: string;
  title: Sentence;
  slug: Slug;
  createdAt: PastDate;
  updatedAt: PastDate;
  favoritesCount: Uint;
  favorited: boolean;
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
  articles: ArticleSummary[];
  articlesCount: Uint;
};

// offset/limit 与 HomeSearch 同口径（key 经 hashArgs 归一）。
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
