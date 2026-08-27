import {View, HistoryRouter as Router, createRoutes, type Route, type RoutePaths} from '@native-router/react';

import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {mockViewData} from '@/util/mock';
import {withCache} from '@/util/loaderCache';
import {articleCache, homeCache} from '@/util/useQuery';
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
      // withCache(homeCache)：与 useQuery 共享实体 cache（双通道，
      // 见 src/util/loaderCache.ts）——新鲜命中零请求，stale 旧值先行+
      // 后台重验证后 refresh 回写，miss 照旧走 pendingComponent 骨架；
      // PrefetchLink 预取与正式导航经 provider.load 共享同一 in-flight，
      // hover 过的链接点击不再重复发请求。mock 在外层：只有透传的真实
      // 数据才进缓存，faker 造数不污染缓存。
      search: homeSearchSchema,
      // ctx.search 不再手写注解：createRoutes 返回表按本层 search
      // schema（homeSearchSchema）推导 loader/守卫的 search 类型，
      // HomeSearch 只在 schema 处定义一次
      data: mockViewData(
        withCache(
          homeCache,
          // key 只此一处定义：[search]（schema coerce 后的形状，hash 侧
          // 剥 undefined 键归一），mutation 侧经 homeCache 寻址同一批条目
          ({search}) => [search],
          // ctx.search 作者期是 any：TS 无法用同级属性（本层 search
          // schema）做回调的上下文类型，精确类型在 createRoutes 返回表
          // 上闭环；值本身经 schema 校验/coerce，运行时形状有保证
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ({search, signal}) => articleService.query(search, signal)
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
      // (articleCache)：Article 视图的乐观写穿（favorite/follow 经
      // cache.mutation）与 loader 共用同一 key（[title]），写穿后
      // set 事件订阅自动 refresh，loader 纯本地更新（见
      // services/mutations.ts 与 src/views/Article/index.tsx）
      data: withCache(
        articleCache,
        ({params}: {params: {title?: string}}): [string] => [params.title!],
        ({params: {title}, signal}: {params: {title?: string}; signal: AbortSignal}) =>
          articleService.findByTitle(title!, signal)
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
