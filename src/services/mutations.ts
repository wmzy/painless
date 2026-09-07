// 每实体 mutation 组合：乐观 → 服务调用 → 字段选择 apply → 失败自动回滚；Editor 走声明式失效（列表形状无法本地推导）。
import type {Article, ArticlePage} from '@/types';

import {articleCache, homeCache, profileCache, profileFeedCache} from '@/util/useQuery';

import * as api from './article';

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

// apply 只取 favorite 域：follow 域并发写穿幸存（响应 author 是请求时刻旧值）。
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

// mutate 委托 favoriteOnArticle，本层只叠投影；失败两层各自回滚，页内无 slug 时 miss-bail。
export const favoriteOnHome = homeCache.mutation((slug: string, on: boolean) => ({
  mutate: () => favoriteOnArticle(slug, on),
  // 签名显式标注（Args 延迟求值否则 any）。
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

// articleCache 按 slug 寻址（slug 由调用方传入）；apply 只取 author 域（peek-merge）。
export const followOnArticle = articleCache.mutation(
  (slug: string, username: string, on: boolean) => ({
    mutate: () => api.followAuthor(username, on),
    key: [slug],
    update: (old) => ({...old, author: {...old.author, following: on}}),
    apply: (old, resp) => ({...old, author: resp})
  })
);

// ---- follow：profile 层（Profile 页 banner）------------------------------

// key=[username] 与 profileLoader 同寻址（bindRefresh 自动 refresh）；apply 只取 following，避免整实体覆盖误伤并发写。
export const followOnProfile = profileCache.mutation(
  (username: string, on: boolean) => ({
    mutate: () => api.followAuthor(username, on),
    key: [username],
    update: (old) => ({...old, following: on}),
    apply: (old, resp) => ({...old, following: resp.following})
  })
);

// ---- favorite：profile 列表投影层 ------------------------------------------

// 与 favoriteOnHome 同构：委托 favoriteOnArticle，本层叠 profileFeed 投影。
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
