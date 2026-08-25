// 每实体 mutation 组合：favorite/follow 这类「响应是权威实体、缓存里是
// 实体或投影」的写操作，以 cache.mutation 声明成可组合的管道——
// 乐观首步 → 服务调用 → 字段选择式 apply → 失败自动回滚（带并发写
// 保护）。Article 视图单用 article 层；Home 视图组合两层（article 层
// 管实体缓存，home 层管信息流投影）；Editor 保存走声明式失效不变
//（发布/编辑后的列表形状无法本地推导，硬失效重拉才是正确工具）。
import type {Article, ArticlePage} from '@/types';

import {articleCache, homeCache} from '@/util/useQuery';

import * as api from './article';

// Article 投影补丁：页内按 slug 替换目标项（找不到则 no-op——其它页/
// 未含该文章的筛选页自然跳过）。泛型 P 保形：返回完整页类型（含
// articlesCount 等），不因窄参数类型丢失字段。
const patchArticleIn = <
  P extends {articles: {slug: string; favorited: boolean; favoritesCount: number}[]}
>(
  page: P,
  slug: string,
  patch: Partial<{favorited: boolean; favoritesCount: number}>
): P => ({
  ...page,
  articles: page.articles.map((x) =>
    x.slug === slug ? {...x, ...patch} : x
  )
});

// ---- favorite：两层组合 ----------------------------------------------------

// article 层：单实体。key=[slug] 由调用参数推导；update 即时翻转；
// apply 字段选择——只从响应取 favorite 域两个权威字段，follow 域的并发
// 写穿得以幸存（响应里的 author 是发出请求那一刻的旧值，全量铺开会
// 回滚它）。
export const favoriteOnArticle = articleCache.mutation(
  (slug: string, on: boolean) => ({
    mutate: () => api.favoriteArticle(slug, on),
    key: [slug],
    update: (old) => ({
      ...old,
      favorited: on,
      favoritesCount: old.favoritesCount + (on ? 1 : -1)
    }),
    apply: (old, resp) => ({
      ...old,
      favorited: resp.favorited,
      favoritesCount: resp.favoritesCount
    })
  })
);

// home 层：信息流投影，无 key（补丁打到所有含该 slug 的页）。组合点：
// mutate 委托 favoriteOnArticle——它自带 articleCache 的乐观管道，本层
// 只叠投影。失败时两层各自回滚（内层先回滚，rejection 原样上抛）。
// update 里先找到目标项再算增量——页内无该 slug 时跳过整页（undefined
// 经 mutation 的 miss-bail 语义静默跳过该条目）。
export const favoriteOnHome = homeCache.mutation((slug: string, on: boolean) => ({
  mutate: () => favoriteOnArticle(slug, on),
  // key 省略：update/apply 对全部 settled 条目逐条 miss-bail。签名显式
  // 标注：spec 回调的 Args 泛型延迟求值，依赖推断时参数落到 any
  update: (page: ArticlePage, slug: string, on: boolean) => {
    const target = page.articles.find((x) => x.slug === slug);
    if (!target) return undefined;
    return patchArticleIn(page, slug, {
      favorited: on,
      favoritesCount: target.favoritesCount + (on ? 1 : -1)
    });
  },
  apply: (page: ArticlePage, resp: Article) =>
    patchArticleIn(page, resp.slug, {
      favorited: resp.favorited,
      favoritesCount: resp.favoritesCount
    })
}));

// ---- follow：article 层单层 -----------------------------------------------

// follow 的 mutation 参数是 username，但 articleCache 按 slug 寻址——
// slug 由调用方一并传入（Article 视图两者都有）。apply 只取 author 域：
// follow 在飞期间 favorite 可能已写穿缓存，author 之外的字段以当前
// 缓存值为准（peek-merge 语义内建在「apply 收到 settle 时的当前值」里）。
export const followOnArticle = articleCache.mutation(
  (slug: string, username: string, on: boolean) => ({
    mutate: () => api.followAuthor(username, on),
    key: [slug],
    update: (old) => ({...old, author: {...old.author, following: on}}),
    apply: (old, resp) => ({...old, author: resp})
  })
);
