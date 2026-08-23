import {View, HistoryRouter as Router, Route} from '@native-router/react';

import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import * as articleService from '@/services/article';
import {getCurrentUser} from '@/services/auth';
import {mockViewData} from '@/components/DevTool';
import {articlePageSchema} from '@/types/index.schema';
import {homeSearchSchema} from '@/types/search';

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
      // schema 在 resolve 期解析+校验，loader 拿到的已是 coerce 后的值
      search: homeSearchSchema,
      data: mockViewData(
        ({search}: {search: import('@/types/search').HomeSearch}) =>
          articleService.query(search),
        articlePageSchema,
        'articlePage'
      ),
      component: () => import('./Home')
    },
    {
      path: '/article/:title',
      component: () => import('./Article'),
      data: ({params: {title}}) => articleService.findByTitle(title!)
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
