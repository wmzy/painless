// 应用级 dataloader 声明：service 函数 × 实体 cache × keyOf × mock schema
// 的绑定集中一处（createDataLoader 工厂见 src/util/dataLoader.ts）。放
// services/ 而非 util/ 的理由：本文件是「机制之上的应用绑定」——与
// article.ts 等 service 平级，被路由表（views/index.tsx）与视图消费；
// util/dataLoader.ts 保持零应用知识的机制层，将来上移（decisions.md
// 第 2 条）时本文件留在模板侧继续做绑定点。
import type {HomeSearch} from '@/types/search';

import {articlePageSchema} from '@/types/index.schema';

import {articleCache, commentsCache, homeCache, tagsCache} from '@/util/useQuery';
import {createDataLoader} from '@/util/dataLoader';

import * as articleService from './article';

// ctx 注解约定（沿收敛前路由表的写法）：literal 内回调的 ctx 按宽松
// Route 检查，精确类型在 createRoutes 返回表上闭环；params 运行时必有
// 值由路由段保证（/article/:title 的匹配段、/editor/:slug 的 params
// schema coerce），可选属性 + ! 收窄兼容宽松检查。

/** Home 路由（/）：query(search) → homeCache[[search]]，DevTool mock 'articlePage' */
export const [homeLoader, useHomeData, useHomeQuery] = createDataLoader({
  fetch: articleService.query,
  cache: homeCache,
  keyOf: ({search}: {search: HomeSearch}): [HomeSearch] => [search],
  mock: {schema: articlePageSchema, key: 'articlePage'}
});

/** Article 路由（/article/:title）：findByTitle(title) → articleCache[[title]] */
export const [articleLoader, useArticleData] = createDataLoader({
  fetch: articleService.findByTitle,
  cache: articleCache,
  keyOf: ({params}: {params: {title?: string}}): [string] => [params.title!]
});

/**
 * Editor 编辑态（/editor/:slug）：findByTitle(slug) → articleCache[[slug]]。
 * 与 Article 共用同一 cache 寻址——编辑提交后的整实体失效对两个通道同时
 * 生效。/editor（新建）不挂 data，视图用 useEditorData({optional: true})。
 */
export const [editorLoader, useEditorData] = createDataLoader({
  fetch: articleService.findByTitle,
  cache: articleCache,
  keyOf: ({params}: {params: {slug?: string}}): [string] => [params.slug!]
});

/**
 * 组件通道（CommentList）：fetchCommentsByTitle(title) →
 * commentsCache[[title]]。评论刻意不挂路由 data（与文章并行、非阻塞，
 * loading 态由列表自身渲染），故只消费第三元素 preset——loader/useData
 * 元素当前无路由挂载，keyOf 按 /article/:title 的 ctx 形状预置，将来若
 * 要把评论提升为路由级 loader 可直接挂。
 */
export const [, , useCommentsQuery] = createDataLoader({
  fetch: articleService.fetchCommentsByTitle,
  cache: commentsCache,
  keyOf: ({params}: {params: {title?: string}}): [string] => [params.title!]
});

/**
 * 组件通道（Home 侧栏 Tags）：fetchTags() → tagsCache[[]]（单例条目）。
 * 同上只消费 preset；tagsCache 是唯一持久化实体（localStorage 镜像，
 * cacheTime 1h），绑定关系在此声明后调用点零三件套。mock 经 preset 的
 * opts 透传（useQuery 的 mock 配置项），DevTool 面板行为不变。
 */
export const [, , useTagsQuery] = createDataLoader({
  fetch: articleService.fetchTags,
  cache: tagsCache,
  keyOf: (): [] => []
});
