// 应用级数据声明层：service 函数 × 实体 cache × keyOf × mock schema 的
// 绑定集中一处（createDataLoader 工厂见 src/util/dataLoader.ts，场景 hook
// 工厂 createQueryHook 见 src/util/useQuery.ts）。放 services/ 而非 util/
// 的理由：本文件是「机制之上的应用绑定」——与 article.ts 等 service 平级，
// 被路由表（views/index.tsx）与视图消费；util 侧保持零应用知识的机制层，
// 将来上移（decisions.md 第 2 条）时本文件留在模板侧继续做绑定点。
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

// ctx 注解约定：keyOf 的 ctx 按本路由的实际形状标注（native-router ≥1.13
// 的 params 类型闭合后，/article/:title 匹配段流入 data ctx 的
// params.title 是必有 string——非可选、无非空断言）；声明形状经工厂的
// Ctx 泛型流进内部接线（keyOf 返回元组对 cache 的 K、fetch 参数元组都是
// 编译期检查），loader 公开类型保持宽松（见 dataLoader.ts 的 DataLoader
// 注释——createRoutes 的宽松 Route 成员不接受窄 ctx）。运行时 params 必有
// 值由路由段保证（/article/:title 的匹配段、/editor/:slug 的 params schema
// coerce）。

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

/**
 * Editor 编辑态（/editor/:slug）：findByTitle(slug) → articleCache[[slug]]。
 * 与 Article 共用同一 cache 寻址——编辑提交后的整实体失效对两个通道同时
 * 生效。/editor（新建）不挂 data，视图用 useEditorData({optional: true})。
 */
export const [editorLoader, useEditorData] = createDataLoader({
  fetch: articleService.findByTitle,
  cache: articleCache,
  keyOf: ({params}: {params: {slug: string}}): [string] => [params.slug]
});

/**
 * 组件通道（CommentList）：fetchCommentsByTitle(title) →
 * commentsCache[[title]]。评论刻意不挂路由 data（与文章并行、非阻塞，
 * loading 态由列表自身渲染），只消费第三元素 queryFn——loader/useData
 * 元素当前无路由挂载，keyOf 按 /article/:title 的 ctx 形状预置，将来若
 * 要把评论提升为路由级 loader 可直接挂。场景 hook 在此组装：initData
 * 空数组在声明点闭合（data 类型随之收窄为非空，列表直接 .map），调用
 * 点（CommentList）零 option。发评论后的刷新由 Article 视图的前缀失效
 * useMutation({invalidates: [[commentsCache, slug]]}) 声明式负责——key
 * 即精确 [slug]，其它文章的评论缓存不被误清。
 */
export const [, , queryComments] = createDataLoader({
  fetch: articleService.fetchCommentsByTitle,
  cache: commentsCache,
  keyOf: ({params}: {params: {title: string}}): [string] => [params.title]
});
export const useCommentsQuery = createQueryHook({
  queryFn: queryComments,
  initData: []
});

/**
 * 组件通道（Home 侧栏 Tags）：fetchTags() → tagsCache[[]]（单例条目）。
 * 同上只消费 queryFn；tagsCache 是唯一持久化实体（localStorage 镜像，
 * cacheTime 1h，staleTime 同长——近乎静态，见下方声明）。mock（tagList
 * schema）从 Tags.tsx 调用点移到此处声明——选项在场景声明点闭合，
 * DevTool 面板的 tagList 条目行为不变。
 */
export const [, , queryTags] = createDataLoader({
  fetch: articleService.fetchTags,
  cache: tagsCache,
  keyOf: (): [] => []
});
export const useTagsQuery = createQueryHook({
  queryFn: queryTags,
  initData: [],
  // 近乎静态：staleTime 与 tagsCache 的 cacheTime 同长（TAGS_CACHE_TIME，
  // 1h）——2s 缺省下每次 focus>2s 都会后台重拉这套全局标签；同长后新鲜
  // 窗口 = 缓存生命周期，窗口内 focus/断网事件与挂载 SWR 零重拉（事件侧
  // 由 createQueryHook 的 revalidate 门控兜住），超窗照常补拉。
  staleTime: TAGS_CACHE_TIME,
  // tagListSchema 来自 .schema 虚拟模块（typings/schema.d.ts 通配声明，
  // 导出 any）：显式断 unknown 收口，避免 any 沿 MockConfig 字面量扩散
  //（article.ts 的 schemas 收纳同款先例）
  mock: {schema: tagListSchema as unknown, key: 'tagList'}
});

/**
 * Profile 路由（/profile/:username）：fetchProfile(username) →
 * profileCache[[username]]。匿名可查（无守卫）；用户不存在时 loader 404
 * → 路由级 errorComponent（Profile/NotFound）。follow 乐观写穿
 *（followOnProfile，见 mutations.ts）与 loader 共用同一 key：写穿后的
 * set 事件经 bindRefresh 自动 refresh，loader 纯本地命中。
 * 刻意不挂 DevTool mock（与 articleLoader/editorLoader 同款取舍）：mock
 * 管道的 'empty' 模式会在 API 错误时用 faker 造数兜底——404 被假档案
 * 掩掉，路由级错误组件（404 语义是规范要求的可观测行为）在 dev/e2e
 * 永不可达；档案实体本身也不是 DevTool 造数演示的数据集。
 */
export const [profileLoader, useProfileData] = createDataLoader({
  fetch: profileService.fetchProfile,
  cache: profileCache,
  keyOf: ({params}: {params: {username: string}}): [string] => [params.username]
});

/**
 * 组件通道（Profile 文章列表）：queryProfileFeed(q) →
 * profileFeedCache[[q]]。与 CommentList 同款「只消费 queryFn」三元组
 * ——loader/useData 元素当前无路由挂载，keyOf 的 ctx 按「若挂路由则
 * search 即完整查询」预置。文章列表由页面 tabs 驱动的场景 hook 取数
 *（见 useProfileFeedQuery），mock 走 'profileFeed' 独立数据集条目：
 * 与 homeLoader 的 'articlePage' 分家——两个通道各自刷新语义（loader
 * 清全场 vs 组件删单条），DevTool 面板条目不互相覆盖。
 */
export const [, , queryProfileFeed] = createDataLoader({
  fetch: articleService.queryProfileFeed,
  cache: profileFeedCache,
  keyOf: ({search}: {search: ProfileFeedQuery}): [ProfileFeedQuery] => [search],
  mock: {schema: articlePageSchema, key: 'profileFeed'}
});
export const useProfileFeedQuery = createQueryHook({
  queryFn: queryProfileFeed
});
