import type {
  Image,
  Paragraphs,
  PastDate,
  Sentence,
  Slug,
  Uint,
  Word
} from './base';

// bio/image 对齐 spec（openapi.d.ts 的 Profile/User）：必填且可 null——
// RealWorld 后端对无头像/无简介的作者返回 null 而非缺字段。手写口径曾为
// `bio?` / `image: Image`（不可 null），与 spec 漂移会在 dev 校验抛错。
// 视图消费 image 必须经 `?? undefined` 收 null（Avatar src 不收 null）。
export type Author = {
  username: string;
  bio: string | null;
  image: Image | null;
  following: boolean;
};

export type Comment = {
  // createdAt/updatedAt 曾写成 number，与真实契约漂移：RealWorld API 返回
  // date-time 字符串（见 openapi.d.ts 的 Comment schema），Article 同款
  // 字段也早已是 PastDate——同文件两种口径自相矛盾。类型经
  // rollup-plugin-type-as-json-schema 自动生成 schema，驱动 dev 运行时
  // 校验与 faker mock：number 型会让模板指向真实后端时 dev 校验必抛
  // ValidationError（真实响应的 ISO 字符串失配于 type:number）。
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

/**
 * @minItems 10
 * @maxItems 30
 */
export type TagList = Word[];

export type CommentList = Comment[];
