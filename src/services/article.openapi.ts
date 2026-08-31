// OpenAPI 类型化客户端演示（docs/decisions.md 第 6 条，口径已收敛）：与
// 手写 services/article.ts 并存，作「同一 API 的第二种打开方式」对照。
//
// 类型来源：openapi-typescript（devDependency，零运行时）从 RealWorld
// 官方 spec 生成纯类型——spec 随库提交在 openapi/realworld.yml（上游
// gothinkster/realworld 仓库 specs/api/openapi.yml，OpenAPI 3.1），
// `npm run openapi` 重新生成 src/types/openapi.d.ts。
//
// 嫁接方式：fetch-fun 0.11 起官方提供 `fetch-fun/openapi` 子入口
//（createOpenapi<paths>() 工厂 + typedUrl/typedPath/typedMethod/
// typedJsonBody/typedJson，配方即原先本文件手写形态的官方化——JsonOk
// 的 200|201 链与 typedPath 模板字面量保留均已被吸收）。
// 此后路径/方法/请求体/2xx 响应全部编译期约束：
//   - 拼错路径（'/article'）→ 不是 paths 的键，类型错误；
//   - 该路径没有的方法（'/tags' + 'post'）→ 类型错误；
//   - 请求体字段拼错/类型不符 → 不满足 requestBody schema，类型错误；
//   - 返回值就是该 operation 的 2xx 响应类型，无需手写泛型参数。
//
// spec × validate 配对（openapi.md 的「Types are a promise」收尾）：
// spec 类型只声明服务器「应该」返回什么，运行时最后一环挂在与手写版
// 同一份生成 schema 链上（@/types/index.schema + envelope，DEV 折叠）
//——手写 schema 恰是 RealWorld 响应的 envelope 形状（{article}/{tags}/
// {articles,articlesCount}），与本通道「直返 spec 原始响应形状」的取数
// 形态天然对齐，逐端点复用即可。
//
// 本文件未被任何视图引用：不进生产 chunk；typed* 也只是 fetch-fun
// config 函数的薄包装，零新增运行时。
import type {paths} from '@/types/openapi';

import {createOpenapi, type JsonBody} from 'fetch-fun/openapi';

import * as ff from 'fetch-fun';

import {api} from '@/util/http';
import {envelope} from '@/util/jsonSchema';
// 虚拟模块（rollup-plugin-type-as-json-schema）：与手写版同一份生成
// schema——「类型→schema→mock→运行时校验」全链单点契约。
import {
  articlePageSchema,
  articleSchema,
  tagListSchema
} from '@/types/index.schema';

// ---- fetch-fun/openapi 官方子入口（0.11）-----------------------------------
// 本地同构过渡工厂已随 fetch-fun 0.11 升级删除：createOpenapi<paths>() 的
// 五个 typed* helper 与本文件原先手写的逐行同构（JsonOk 的 200|201 链、
// typedPath 的模板字面量保留均已被官方吸收），调用点零改动。
const {typedUrl, typedPath, typedMethod, typedJsonBody, typedJson} =
  createOpenapi<paths>();

// ---- dev-only 响应校验接线（与手写版同款 schema 链）------------------------
// schema 常量整组包在 import.meta.env.DEV 三元里，生产构建折叠后
// envelope/生成 schema 的引用一并被摇出；mock 口径注解（@minItems 等）
// 由校验侧剔除（util/jsonSchema.forResponse）。值型 unknown：虚拟模块的
// 导出是 any，unknown 槽位承接（校验侧自行收窄），与 article.ts 同款。
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

// config 透传包装：合并可选的 query 参数与 signal。必须经 config 函数
// 返回原类型——直接对象展开会把链上的幽灵类型（url/method 字面量、
// reader 槽位）洗成宽类型，fetchData 的返回类型推导就断了。
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

// dev-only 校验的管道挂点：与 http.ts 的 init.schema → withSchema 同款
// Standard Schema v1 鸭子适配（本通道直接组管道，不走 http 出口函数，
// 适配器在此就地内联一份孪生；校验实现与 ajv 动态加载在 util/validate，
// 只经这里的分支内动态 import 进入，生产构建整体折叠）。
function devValidate<T extends ff.Options>(schema: unknown, label: string) {
  return (o: T): T => {
    if (!import.meta.env.DEV || !schema) return o;
    const standard: ff.StandardSchema = {
      '~standard': {
        version: 1,
        vendor: 'painless/json-schema',
        validate: async (value: unknown) => {
          const {check} = await import('@/util/validate');
          return check(schema, value, label);
        }
      }
    };
    return ff.validate(o, standard) as unknown as T;
  };
}

// ---- 演示端点（与手写 services/article.ts 对照） --------------------------
// 形态差异是演示的一部分：手写版解包返回实体（{article} → Article），
// 这里返回 spec 原始响应形状（SingleArticleResponse 等）——解包把契约
// 藏进函数签名，直返让 spec 类型一路可见；校验 schema 也因此直接用
// envelope 形状（不解包的数据对不解包的 schema）。toggle 型端点
//（favorite）拆成两个函数：布尔分支会让 method/reader 的字面量类型变成
// 联合，约束就松了；手写版用布尔切换，演示版优先保住编译期约束。

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
      .pipe(devValidate(schemas?.list, 'GET /articles'))
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
      .pipe(devValidate(schemas?.article, 'GET /articles/{slug}'))
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
      .pipe(devValidate(schemas?.tags, 'GET /tags'))
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
      .pipe(devValidate(schemas?.article, 'POST /articles'))
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
      .pipe(devValidate(schemas?.article, 'POST /articles/{slug}/favorite'))
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
      .pipe(devValidate(schemas?.article, 'DELETE /articles/{slug}/favorite'))
  );
}
