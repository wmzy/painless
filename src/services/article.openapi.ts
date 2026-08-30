// OpenAPI 类型化客户端演示（docs/decisions.md 第 6 条的落地半）：与手写
// services/article.ts 并存，作「同一 API 的第二种打开方式」对照。
//
// 类型来源：openapi-typescript（devDependency，零运行时）从 RealWorld
// 官方 spec 生成纯类型——spec 随库提交在 openapi/realworld.yml（上游
// gothinkster/realworld 仓库 specs/api/openapi.yml，OpenAPI 3.1），
// `npm run openapi` 重新生成 src/types/openapi.d.ts。
//
// 嫁接方式：typed* helper 把生成的 paths 类型钉到 fetch-fun 的幽灵类型
// 上（配方源自 fetch-fun docs/openapi.md，本地化差异见各 helper 注释）。
// 此后路径/方法/请求体/2xx 响应全部编译期约束：
//   - 拼错路径（'/article'）→ 不是 paths 的键，类型错误；
//   - 该路径没有的方法（'/tags' + 'post'）→ 类型错误；
//   - 请求体字段拼错/类型不符 → 不满足 requestBody schema，类型错误；
//   - 返回值就是该 operation 的 2xx 响应类型，无需手写泛型参数。
// 本文件未被任何视图引用：不进生产 chunk；typed* 也只是 fetch-fun
// config 函数的薄包装，零新增运行时。运行时响应校验（真实数据回到
// schema 的最后一环）挂在手写 schema 链上，见 src/util/validate.ts。
import type {paths} from '@/types/openapi';

import * as ff from 'fetch-fun';

import {api} from '@/util/http';

/** OpenAPI operation 键（排除 openapi-typescript 生成的 parameters 键）。 */
type Op = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace';

/** operation 接受的 JSON 请求体（spec 未定义时为 unknown）。 */
type JsonBody<O> = O extends {
  requestBody?: {content: {'application/json': infer B}};
}
  ? B
  : unknown;

// 与配方文档的差异：RealWorld 的 CreateArticle 成功码是 201（其余演示
// 端点是 200），成功响应联合 200 | 201 才能覆盖全部端点。
type JsonOk<O> = O extends {
  responses: {200: {content: {'application/json': infer D}}};
}
  ? D
  : O extends {responses: {201: {content: {'application/json': infer D}}}}
    ? D
    : unknown;

/** 路径必须是生成 paths 类型的真实键。 */
function typedUrl<T extends ff.Options, U extends Extract<keyof paths, string>>(
  o: T,
  path: U
) {
  return ff.url<T, U>(o, path);
}

/**
 * 路径模板必须是 spec 真实键，占位参数集合由模板字面量推导（缺键/多键
 * 皆类型错误）。本地化：ff.path 会把 url 拓宽成 string，这里还原字面量
 * 类型——后续 method/reader 的约束都挂在它上面。
 */
function typedPath<T extends ff.Options, U extends Extract<keyof paths, string>>(
  o: T,
  template: U,
  params: ff.PlaceholderParams<U>
) {
  return ff.path(o, template, params) as Omit<T, 'url'> & {url: U};
}

/** 方法必须是该路径下真实存在的 operation。 */
function typedMethod<
  T extends ff.Options,
  U extends Extract<keyof paths, string>,
  M extends keyof paths[U] & Op
>(o: T & {url: U}, m: M) {
  return ff.method<T & {url: U}, Uppercase<M>>(
    o,
    m.toUpperCase() as Uppercase<M>
  );
}

/** 请求体必须满足该 operation 的 requestBody schema。 */
function typedJsonBody<
  T extends ff.Options,
  U extends Extract<keyof paths, string>,
  M extends keyof paths[U] & Op
>(o: T & {url: U; method: Uppercase<M>}, m: M, body: JsonBody<paths[U][M]>) {
  // m 仅参与类型推导（约束 body 与后续 reader），运行时不需要
  void m;
  return ff.jsonBody(o, body);
}

/** 按该 operation 的 2xx 响应 schema 读响应（返回类型随之收敛）。 */
function typedJson<
  T extends ff.Options,
  U extends Extract<keyof paths, string>,
  M extends keyof paths[U] & Op
>(o: T & {url: U; method: Uppercase<M>}, m: M) {
  // 同上：m 是纯类型参数
  void m;
  return ff.json<T & {url: U; method: Uppercase<M>}, JsonOk<paths[U][M]>>(o);
}

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

// ---- 演示端点（与手写 services/article.ts 对照） --------------------------
// 形态差异是演示的一部分：手写版解包返回实体（{article} → Article），
// 这里返回 spec 原始响应形状（SingleArticleResponse 等）——解包把契约
// 藏进函数签名，直返让 spec 类型一路可见。toggle 型端点（favorite）拆
// 成两个函数：布尔分支会让 method/reader 的字面量类型变成联合，约束就
// 松了；手写版用布尔切换，演示版优先保住编译期约束。

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
  );
}
