// service × cache × keyOf × mock schema 绑定集中一处；放 services/ 而非 util/（decisions.md #2）。
import type {HomeSearch} from '@/types/search';
import type {ProfileFeedQuery} from '@/types';

import {articlePageSchema, tagListSchema} from '@/types/index.schema';

import {
  articleCache,
  commentsCache,
  createQueryHook,
  homeCache,
  profileCache,
  profileFeedCache,
  tagsCache,
  TAGS_CACHE_TIME
} from '@/util/useQuery';
import {createDataLoader} from '@/util/dataLoader';

import * as articleService from './article';
import * as profileService from './profile';

// keyOf 的 ctx 按路由实际形状标注；loader 公开类型保持宽松（decisions.md #16/#13）。

export const [homeLoader, useHomeData] = createDataLoader({
  fetch: articleService.query,
  cache: homeCache,
  keyOf: ({search}: {search: HomeSearch}): [HomeSearch] => [search],
  mock: {schema: articlePageSchema, key: 'articlePage'}
});

export const [articleLoader, useArticleData] = createDataLoader({
  fetch: articleService.findByTitle,
  cache: articleCache,
  keyOf: ({params}: {params: {title: string}}): [string] => [params.title]
});

/** 与 Article 共用 articleCache[[slug]]，整实体失效对两通道同时生效；/editor（新建）不挂 data。 */
export const [editorLoader, useEditorData] = createDataLoader({
  fetch: articleService.findByTitle,
  cache: articleCache,
  keyOf: ({params}: {params: {slug: string}}): [string] => [params.slug]
});

/** 评论不挂路由 data（非阻塞）；发评论后由 Article 视图前缀失效 [[commentsCache, slug]]。 */
export const [, , queryComments] = createDataLoader({
  fetch: articleService.fetchCommentsByTitle,
  cache: commentsCache,
  keyOf: ({params}: {params: {title: string}}): [string] => [params.title]
});
export const useCommentsQuery = createQueryHook({
  queryFn: queryComments,
  initData: []
});

/** mock 声明从 Tags.tsx 移到此场景声明点闭合。 */
export const [, , queryTags] = createDataLoader({
  fetch: articleService.fetchTags,
  cache: tagsCache,
  keyOf: (): [] => []
});
export const useTagsQuery = createQueryHook({
  queryFn: queryTags,
  initData: [],
  // staleTime = tagsCache cacheTime（1h，decisions.md #29）。
  staleTime: TAGS_CACHE_TIME,
  // tagListSchema 导出 any：显式收 unknown，防 any 沿 MockConfig 扩散。
  mock: {schema: tagListSchema as unknown, key: 'tagList'}
});

/** 刻意不挂 DevTool mock（decisions.md #28）：empty 模式会把 404 掩掉，路由级错误组件不可达。 */
export const [profileLoader, useProfileData] = createDataLoader({
  fetch: profileService.fetchProfile,
  cache: profileCache,
  keyOf: ({params}: {params: {username: string}}): [string] => [params.username]
});

/** mock 走 'profileFeed' 独立数据集，与 homeLoader 的 'articlePage' 分家（面板条目不互相覆盖）。 */
export const [, , queryProfileFeed] = createDataLoader({
  fetch: articleService.queryProfileFeed,
  cache: profileFeedCache,
  keyOf: ({search}: {search: ProfileFeedQuery}): [ProfileFeedQuery] => [search],
  mock: {schema: articlePageSchema, key: 'profileFeed'}
});
export const useProfileFeedQuery = createQueryHook({
  queryFn: queryProfileFeed
});
