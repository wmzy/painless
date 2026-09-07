// 每实体 mutation 组合：favorite/follow 以 cache.mutation 声明成可组合管道
//（乐观 → 服务调用 → 字段选择 apply → 失败自动回滚）。Article 单用 article 层；
// Home 组合两层；Editor 保存走声明式失效（列表形状无法本地推导）。
import type {Article, ArticlePage} from '@/types';

import {articleCache, homeCache, profileCache, profileFeedCache} from '@/util/useQuery';

import * as api from './article';

// 页内按 slug 替换目标项（找不到 no-op）；泛型 P 保形，返回完整页类型。
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

// article 层（单实体）：key=[slug]；apply 字段选择只取 favorite 域——follow 域并发写穿幸存
//（响应 author 是请求时刻旧值，全量铺开会回滚它）。
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

// home 层（信息流投影，无 key）：mutate 委托 favoriteOnArticle，本层只叠投影。
// 失败两层各自回滚（内层先回滚，rejection 上抛）；页内无 slug 时 update 返回 undefined
//（miss-bail 静默跳过）。
export const favoriteOnHome = homeCache.mutation((slug: string, on: boolean) => ({
  mutate: () => favoriteOnArticle(slug, on),
  // key 省略：update/apply 对全部 settled 条目 miss-bail；签名显式标注（Args 延迟求值否则 any）
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

// follow 参数是 username 但 articleCache 按 slug 寻址（slug 由调用方传入）。
// apply 只取 author 域：follow 在飞期间 favorite 可能已写穿，其余字段以当前缓存值为准（peek-merge）。
export const followOnArticle = articleCache.mutation(
  (slug: string, username: string, on: boolean) => ({
    mutate: () => api.followAuthor(username, on),
    key: [slug],
    update: (old) => ({...old, author: {...old.author, following: on}}),
    apply: (old, resp) => ({...old, author: resp})
  })
);

// ---- follow：profile 层（Profile 页 banner）------------------------------

// Profile 页 follow 写穿档案实体：key=[username] 与 profileLoader 同寻址（bindRefresh 自动 refresh）。
// apply 只取 following（响应即全量 profile，字段选择避免整实体覆盖误伤并发写）。
export const followOnProfile = profileCache.mutation(
  (username: string, on: boolean) => ({
    mutate: () => api.followAuthor(username, on),
    key: [username],
    update: (old) => ({...old, following: on}),
    apply: (old, resp) => ({...old, following: resp.following})
  })
);

// ---- favorite：profile 列表投影层 ------------------------------------------

// Profile 列表收藏写穿：与 favoriteOnHome 同构——mutate 委托 favoriteOnArticle，
// 本层叠 profileFeed 投影（无 key，miss-bail 跳过）。失败两层各自回滚。
export const favoriteOnProfileFeed = profileFeedCache.mutation(
  (slug: string, on: boolean) => ({
    mutate: () => favoriteOnArticle(slug, on),
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
  })
);
