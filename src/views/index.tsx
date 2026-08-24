import type {HomeSearch} from '@/types/search';

import {View, HistoryRouter as Router, Route} from '@native-router/react';

import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {mockViewData} from '@/util/mock';
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

const routes = {
  component: () => import('./Layout'),
  children: [
    {
      path: '/',
      // search 变化即重跑 data（native-router 的视图缓存 key 含 search）；
      // schema 在 resolve 期解析+校验，loader 拿到的已是 coerce 后的值。
      // signal：导航被新导航取代/cancel/POP 取消时 abort，透传给 service
      // 停掉被丢弃导航的请求（mockViewData 包装层原样传 ctx，信号不丢）
      search: homeSearchSchema,
      data: mockViewData(
        ({search, signal}: {search: HomeSearch; signal: AbortSignal}) =>
          articleService.query(search, signal),
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
      // signal 同上：findByTitle 的请求随导航取消而取消
      data: ({params: {title}, signal}) =>
        articleService.findByTitle(title!, signal),
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
} as Route;

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
