// OpenAPI 类型化客户端演示（decisions.md #6）：与手写 article.ts 并存，
// 作「同一 API 的第二种打开方式」对照。类型来自 openapi-typescript
//（devDep，零运行时）对 openapi/realworld.yml 的生成——`npm run openapi`
// 重新生成 src/types/openapi.d.ts。经 fetch-fun/openapi 的 typed* 组合
// 管道，路径/方法/请求体/2xx 响应全部编译期约束；返回值即该 operation
// 的 2xx 响应类型，直返 spec 原始形状（不学手写版解包）。
//
// 运行时最后一环挂与手写版同一份生成 schema（@/types/index.schema +
// envelope，DEV 折叠）：手写 schema 恰是 envelope 形状，与直返形态对齐。
// 本文件无视图引用：不进生产 chunk。
import type {paths} from '@/types/openapi';

import {createOpenapi, type JsonBody} from 'fetch-fun/openapi';

import * as ff from 'fetch-fun';

import {api, withSchema} from '@/util/http';
import {envelope} from '@/util/jsonSchema';
// 虚拟模块（rollup-plugin-type-as-json-schema）：与手写版同一份生成
// schema——「类型→schema→mock→运行时校验」全链单点契约。
import {
  articlePageSchema,
  articleSchema,
  tagListSchema
} from '@/types/index.schema';

const {typedUrl, typedPath, typedMethod, typedJsonBody, typedJson} =
  createOpenapi<paths>();

// schema 常量整组包在 DEV 三元里：生产折叠摇出；mock 口径注解由校验侧
// 剔除（util/jsonSchema.forResponse）。虚拟模块导出 any，unknown 槽位承接。
const schemas: Record<string, unknown> | undefined = import.meta.env.DEV
  ? {
      // spec 原始响应形状 ↔ 生成 schema 的对应：MultipleArticlesResponse
      // 即 {articles, articlesCount}（articlePageSchema 本体）；单实体/
      // tags 是 envelope 一层。favorite 响应同 SingleArticleResponse。
      list: articlePageSchema,
      article: envelope('article', articleSchema),
      tags: envelope('tags', tagListSchema)
    }
  : undefined;

// 必须经 config 函数返回原类型：对象展开会洗掉幽灵类型（url/method/
// reader），fetchData 的返回类型推导就断。
function queryAndSignal<T extends ff.Options>(
  params: Record<string, string | number | boolean | undefined> | undefined,
  signal: AbortSignal | undefined
) {
  return (o: T): T => {
    let result = o;
    if (params) {
      // 与 http.get 同语义：undefined 值跳过序列化（QueryInput 也不收）
      const defined = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined)
      ) as Record<string, string | number | boolean>;
      // 双重断言：泛型 T 与 ff.query 的 Omit 结果互不可证（保幽灵类型必须
      // 经 config 函数返回 T），经 unknown 中转让 tsc/eslint 同时接受。
      result = ff.query(result, defined) as unknown as T;
    }
    if (signal) result = {...result, signal};
    return result;
  };
}

// dev-only 校验复用 http.ts 的 withSchema（机制见该处）；本通道直接组
// 管道、不走 http 出口函数，链派生 helper 照常可用。

// 形态差异即演示：手写版解包（{article} → Article），这里直返 spec 响应
// 形状让类型一路可见，校验 schema 因而用 envelope。favorite 拆两个函数：
// 布尔分支会把 method/reader 字面量变成联合，约束就松了。

/** GET /articles —— 对应手写版 article.query。 */
export function query(
  params?: paths['/articles']['get']['parameters']['query'],
  signal?: AbortSignal
) {
  return ff.fetchData(
    api
      .pipe(typedUrl, '/articles')
      .pipe(typedMethod, 'get')
      .pipe(queryAndSignal(params, signal))
      .pipe(typedJson, 'get')
      .pipe(withSchema, schemas?.list)
  );
}

/** GET /articles/{slug} —— 对应手写版 article.findByTitle（typedPath 演示）。 */
export function findBySlug(slug: string, signal?: AbortSignal) {
  return ff.fetchData(
    api
      .pipe(typedPath, '/articles/{slug}', {slug})
      .pipe(typedMethod, 'get')
      .pipe(queryAndSignal(undefined, signal))
      .pipe(typedJson, 'get')
      .pipe(withSchema, schemas?.article)
  );
}

/** GET /tags —— 对应手写版 article.fetchTags。 */
export function fetchTags(signal?: AbortSignal) {
  return ff.fetchData(
    api
      .pipe(typedUrl, '/tags')
      .pipe(typedMethod, 'get')
      .pipe(queryAndSignal(undefined, signal))
      .pipe(typedJson, 'get')
      .pipe(withSchema, schemas?.tags)
  );
}

/** POST /articles —— 对应手写版 article.saveArticle 的新建分支（typedJsonBody 演示）。 */
export function createArticle(
  article: JsonBody<paths['/articles']['post']>['article'],
  signal?: AbortSignal
) {
  return ff.fetchData(
    api
      .pipe(typedUrl, '/articles')
      .pipe(typedMethod, 'post')
      .pipe(typedJsonBody, 'post', {article})
      .pipe(typedJson, 'post')
      .pipe(queryAndSignal(undefined, signal))
      .pipe(withSchema, schemas?.article)
  );
}

/** POST /articles/{slug}/favorite —— 对应手写版 article.favoriteArticle 的收藏分支。 */
export function favoriteArticle(slug: string, signal?: AbortSignal) {
  return ff.fetchData(
    api
      .pipe(typedPath, '/articles/{slug}/favorite', {slug})
      .pipe(typedMethod, 'post')
      .pipe(queryAndSignal(undefined, signal))
      .pipe(typedJson, 'post')
      .pipe(withSchema, schemas?.article)
  );
}

/** DELETE /articles/{slug}/favorite —— 对应手写版 article.favoriteArticle 的取消收藏分支。 */
export function unfavoriteArticle(slug: string, signal?: AbortSignal) {
  return ff.fetchData(
    api
      .pipe(typedPath, '/articles/{slug}/favorite', {slug})
      .pipe(typedMethod, 'delete')
      .pipe(queryAndSignal(undefined, signal))
      .pipe(typedJson, 'delete')
      .pipe(withSchema, schemas?.article)
  );
}
