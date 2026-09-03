import {navigate} from '@native-router/core';
import {useMatched} from '@native-router/react';
import {useMutation} from 'react-toolroom/async';

import {getCurrentUser} from '@/services/auth';
import {useToastError} from '@/util/toastError';

// 两条收藏管道的公共形状（BoundMutation）：favoriteOnHome（home 投影
// 组合 article 层，Home 视图用）与 favoriteOnArticle（article 单层，
// Article 视图用）都是 (slug, on) → Promise
type FavoriteMutate = (slug: string, on: boolean) => Promise<unknown>;

// 未登录写操作的登录跳转目标：原目的页（pathname + search，深链含 query
// 时整段回跳）整体 encodeURIComponent 进 redirect——与 requireLogin 守卫
//（views/index.tsx）同一约定，裸拼 '/' 与 '?' 会把原 query 混进 /login
// 自己的 search。Login 侧 sanitizeRedirect 白名单（站内绝对路径：以 '/'
// 开头、非 '//'、不含 '://'）对收藏发起路径（'/' 与 '/article/:title'）
// 原样放行，登录后回跳发起页。
export function loginRedirect(location: {
  pathname: string;
  search: string;
}): string {
  return `/login?redirect=${encodeURIComponent(
    location.pathname + location.search
  )}`;
}

// 未登录写操作的统一闸门（原 Article 视图手写的 requireAuth 与
// useFavorite 内联跳转的同构三步收敛）：已登录 true 放行；未登录
// navigate 到 loginRedirect（带原目的页）并返回 false。返回的回调按
// 渲染时的 location 取值——与原视图内写法语义一致。
export function useRequireAuth(): () => boolean {
  const {router, location} = useMatched();
  return () => {
    if (getCurrentUser()) return true;
    void navigate(router, loginRedirect(location));
    return false;
  };
}

// toggleFavorite 的共享收敛（原 Home / Article 两处近重复）：未登录跳
// 登录（useRequireAuth，带 redirect 原目的页），已登录走 cache.mutation
// 乐观管道（spec 由调用方注入——Home 组合 home 投影层、Article 单用
// article 层，见 services/mutations.ts），失败 toast 一条 danger 提示
// ——乐观回滚由管道自动负责，toast 只补「为什么没反应」（收敛点见
// util/toastError.ts）。
// scope 按 slug 串行同文章的连点：第二次点击排队等第一次 settle 后执行，
// 乐观翻转以服务端权威值为基线，不丢点击意图；两视图共用
// `favorite:${slug}` 键，跨视图对同一文章的连点同样串行。
// 参数刻意标量化（slug + 目标态）：回调无需 article 闭包，配合
// ArticlePreview 的 react-toolroom memo（on* props 自动稳定化）调用点免
// useCallback。
export function useFavorite(
  favorite: FavoriteMutate
): (slug: string, on: boolean) => void {
  const requireAuth = useRequireAuth();
  const toastError = useToastError();
  const [mutate] = useMutation(favorite, {
    scope: (slug: string) => `favorite:${slug}`
  });

  return (slug, on) => {
    if (!requireAuth()) return;
    void mutate(slug, on).catch((e: unknown) =>
      toastError(e, 'Favorite failed')
    );
  };
}
