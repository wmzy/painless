import type {HomeSearch} from '@/types/search';

import {View, HistoryRouter as Router, createRoutes, type Route, type RoutePaths} from '@native-router/react';

import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {mockViewData} from '@/util/mock';
import {withCache} from '@/util/loaderCache';
import {articlePageSchema} from '@/types/index.schema';
import {homeSearchSchema} from '@/types/search';

import NotFound from './Article/NotFound';
import HomeSkeleton from './Home/Skeleton';

// 路由守卫：@native-router ≥1.2 的 beforeLoad。返回路径即由路由器在
// resolve 期重定向（导航提交前生效，URL 不落守卫路由）；返回 undefined
// 放行。preload/PrefetchLink 预取也走同一守卫，预取受守卫路由只会解析
// 到重定向目标的视图，无副作用。
const requireLogin: Route['beforeLoad'] = () => {
  if (!getCurrentUser()) return '/login';
};

// createRoutes（satisfies 语义）：表按 Route 检查，同时每个 path 保留
// 字面量类型——`as Route` 会把 path 拓宽成 string，TypedLink 的路径联合
// （AppPaths）就提不出来了
const routes = createRoutes({
  component: () => import('./Layout'),
  children: [
    {
      path: '/',
      // search 变化即重跑 data（native-router 的视图缓存 key 含 search）；
      // schema 在 resolve 期解析+校验，loader 拿到的已是 coerce 后的值。
      // signal：导航被新导航取代/cancel/POP 取消时 abort，透传给 service
      // 停掉被丢弃导航的请求（mockViewData 包装层原样传 ctx，信号不丢）。
      // withCache(['home'])：与 useQuery 共享模块级 queryCache（双通道，
      // 见 src/util/loaderCache.ts）——新鲜命中零请求，stale 旧值先行+
      // 后台重验证后 refresh 回写，miss 照旧走 pendingComponent 骨架；
      // PrefetchLink 预取与正式导航经 provider.load 共享同一 in-flight，
      // hover 过的链接点击不再重复发请求。mock 在外层：只有透传的真实
      // 数据才进缓存，faker 造数不污染缓存。
      search: homeSearchSchema,
      data: mockViewData(
        withCache(
          ({search, signal}: {search: HomeSearch; signal: AbortSignal}) =>
            articleService.query(search, signal),
          ['home']
        ),
        articlePageSchema,
        'articlePage'
      ),
      // 冷启动/刷新（无前视图可保留）时渲染文章卡片骨架；应用内导航
      // 保持旧视图 + 全局 Loading，不进这里
      pendingComponent: HomeSkeleton,
      component: () => import('./Home')
    },
    {
      path: '/article/:title',
      component: () => import('./Article'),
      // signal 同上：findByTitle 的请求随导航取消而取消。withCache
      // (['article'])：Article 视图的写穿（favorite/follow）与 loader 共
      // 用同一 key（articleCacheArgs），mutation 写缓存后 refresh 使
      // loader 纯本地更新（见 src/views/Article/index.tsx）
      data: withCache(
        ({params: {title}, signal}: {params: {title?: string}; signal: AbortSignal}) =>
          articleService.findByTitle(title!, signal),
        ['article']
      ),
      // 路由级错误组件：文章不存在/加载失败渲染页面级提示（含返回首页），
      // 其它路由仍走全局 errorHandler → RouterError
      errorComponent: NotFound
    },
    {
      path: '/help',
      component: () => import('./Help')
    },
    {
      path: '/about',
      component: () => import('./About')
    },
    {
      path: '/login',
      component: () => import('./Login')
    },
    {
      path: '/register',
      component: () => import('./Register')
    },
    {
      path: '/editor',
      beforeLoad: requireLogin,
      component: () => import('./Editor')
    },
    {
      path: '/editor/:slug',
      beforeLoad: requireLogin,
      component: () => import('./Editor')
    }
  ]
});

// 全部路由 path 的字面量联合：TypedLink<AppPaths> 的 to 以此收窄，
// 路径拼写错误在编译期暴露（动态段路由同时要求 params 完整）
export type AppPaths = RoutePaths<typeof routes>;

export default function App() {
  return (
    <Router
      routes={routes}
      // baseUrl={import.meta.env.BASE_URL.slice(0, -1)}
      errorHandler={(e) => <RouterError error={e} />}
    >
      <View />
      <Loading />
    </Router>
  );
}
