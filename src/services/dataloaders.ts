// 应用级数据声明层：service × 实体 cache × keyOf × mock schema 绑定集中一处。
// 放 services/ 而非 util/（机制之上的应用绑定，decisions.md #2）。
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

// keyOf 的 ctx 按路由实际形状标注（params 类型闭合后 title 必有 string，非可选）；
// 精确形状经 Ctx 流进工厂接线，loader 公开类型保持宽松（decisions.md #16/#13）。

/** Home 路由（/）：query(search) → homeCache[[search]]，DevTool mock 'articlePage' */
export const [homeLoader, useHomeData] = createDataLoader({
  fetch: articleService.query,
  cache: homeCache,
  keyOf: ({search}: {search: HomeSearch}): [HomeSearch] => [search],
  mock: {schema: articlePageSchema, key: 'articlePage'}
});

/** Article 路由（/article/:title）：findByTitle(title) → articleCache[[title]] */
export const [articleLoader, useArticleData] = createDataLoader({
  fetch: articleService.findByTitle,
  cache: articleCache,
  keyOf: ({params}: {params: {title: string}}): [string] => [params.title]
});

/** Editor 编辑态（/editor/:slug）→ articleCache[[slug]]；与 Article 共用寻址，
 * 整实体失效对两通道同时生效。/editor（新建）不挂 data（useEditorData({optional: true})）。 */
export const [editorLoader, useEditorData] = createDataLoader({
  fetch: articleService.findByTitle,
  cache: articleCache,
  keyOf: ({params}: {params: {slug: string}}): [string] => [params.slug]
});

/** 组件通道（CommentList）→ commentsCache[[title]]：评论不挂路由 data（非阻塞），
 * 只消费 queryFn。initData 空数组声明点闭合（data 收窄非空）。发评论后由
 * Article 视图前缀失效 [[commentsCache, slug]]（key 精确，其它文章不误清）。 */
export const [, , queryComments] = createDataLoader({
  fetch: articleService.fetchCommentsByTitle,
  cache: commentsCache,
  keyOf: ({params}: {params: {title: string}}): [string] => [params.title]
});
export const useCommentsQuery = createQueryHook({
  queryFn: queryComments,
  initData: []
});

/** 组件通道（Home 侧栏 Tags）→ tagsCache[[]]（单例条目，唯一持久化实体）。
 * mock 从 Tags.tsx 移到此处声明（选项在场景声明点闭合）。 */
export const [, , queryTags] = createDataLoader({
  fetch: articleService.fetchTags,
  cache: tagsCache,
  keyOf: (): [] => []
});
export const useTagsQuery = createQueryHook({
  queryFn: queryTags,
  initData: [],
  // staleTime = tagsCache cacheTime（TAGS_CACHE_TIME，1h，decisions.md #29）：新鲜窗口=缓存生命周期
  staleTime: TAGS_CACHE_TIME,
  // tagListSchema 导出 any：显式收 unknown，防 any 沿 MockConfig 扩散
  mock: {schema: tagListSchema as unknown, key: 'tagList'}
});

/** Profile 路由（/profile/:username）→ profileCache[[username]]；匿名可查，404 → 路由级 errorComponent。
 * follow 乐观写穿（followOnProfile）与 loader 同 key。刻意不挂 DevTool mock（decisions.md #28）：
 * empty 模式会把 404 用 faker 掩掉，路由级错误组件不可达。 */
export const [profileLoader, useProfileData] = createDataLoader({
  fetch: profileService.fetchProfile,
  cache: profileCache,
  keyOf: ({params}: {params: {username: string}}): [string] => [params.username]
});

/** 组件通道（Profile 文章列表）→ profileFeedCache[[q]]：只消费 queryFn。
 * mock 走 'profileFeed' 独立数据集（与 homeLoader 的 'articlePage' 分家，
 * 刷新语义不同，面板条目不互相覆盖）。 */
export const [, , queryProfileFeed] = createDataLoader({
  fetch: articleService.queryProfileFeed,
  cache: profileFeedCache,
  keyOf: ({search}: {search: ProfileFeedQuery}): [ProfileFeedQuery] => [search],
  mock: {schema: articlePageSchema, key: 'profileFeed'}
});
export const useProfileFeedQuery = createQueryHook({
  queryFn: queryProfileFeed
});
