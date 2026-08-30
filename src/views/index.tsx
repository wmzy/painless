import {View, HistoryRouter as Router, createRoutes, type Route, type RoutePaths} from '@native-router/react';

import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import {getCurrentUser, type User} from '@/services/auth';
import {articleLoader, editorLoader, homeLoader} from '@/services/dataloaders';
import {homeSearchSchema} from '@/types/search';
import {editorParamsSchema} from '@/types/params';

import NotFound from './Article/NotFound';
import HomeSkeleton from './Home/Skeleton';

// 应用级 router context（@native-router ≥1.10）：一个同步值随 router
// 实例注入，data loader 与 beforeLoad 守卫经 ctx.context 取用。auth
// 模块仍是登录态的事实源，context 只包 getter——守卫不再直接 import
// auth 模块状态：测试守卫换一份 context 即可驱动（每实例独立，无需
// 重置模块单例），微前端同页多 router 也不串数据。值是创建时的快照，
// 不是响应式源——登录态变化由 auth 的 change 事件驱动 UI，守卫每次
// 导航重新求值，天然拿到最新用户。
export type RouterContext = {getUser: () => User | null};
const routerContext: RouterContext = {getUser: getCurrentUser};

// 路由守卫：@native-router ≥1.2 的 beforeLoad。返回路径即由路由器在
// resolve 期重定向（导航提交前生效，URL 不落守卫路由）；返回 undefined
// 放行。preload/PrefetchLink 预取也走同一守卫，预取受守卫路由只会解析
// 到重定向目标的视图，无副作用。当前用户经 ctx.context（Router 的
// context prop）取——Route 第三泛型（同 search 泛型的套路）让守卫的
// ctx.context 类型化，无需手写注解。NonNullable 收掉可选成员的
// undefined：const 本体恒为已定义函数，直接调用（测试）不报警。
export const requireLogin: NonNullable<
  Route<string, any, RouterContext>['beforeLoad']
> = ({context}) => {
  if (!context.getUser()) return '/login';
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
      // data 管道已收敛为 createDataLoader 三元组（声明见
      // services/dataloaders.ts 的 homeLoader）：withCache(homeCache) 双
      // 通道缓存 + DevTool mock + 视图侧 useHomeData 的 DEV 来源校验——
      // 新鲜命中零请求，stale 旧值先行+后台重验证后 refresh 回写，miss
      // 照旧走 pendingComponent 骨架；PrefetchLink 预取与正式导航经
      // provider.load 共享同一 in-flight；signal 透传给 service，被新
      // 导航取代/cancel/POP 取消的请求随 ctx.signal abort。
      search: homeSearchSchema,
      data: homeLoader,
      // 冷启动/刷新（无前视图可保留）时渲染文章卡片骨架；应用内导航
      // 保持旧视图 + 全局 Loading，不进这里
      pendingComponent: HomeSkeleton,
      component: () => import('./Home')
    },
    {
      path: '/article/:title',
      component: () => import('./Article'),
      // withCache(articleCache) 双通道见 articleLoader（dataloaders.ts）：
      // Article 视图的乐观写穿（favorite/follow 经 cache.mutation）与
      // loader 共用同一 key（[title]），写穿后 set 事件订阅自动 refresh，
      // loader 纯本地更新（见 services/mutations.ts 与 Article 视图）
      data: articleLoader,
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
      // params schema（@native-router ≥1.9）：resolve 期匹配后、beforeLoad
      // 前经 editorParamsSchema 解析——loader 拿到的 ctx.params 已是
      // coerce（trim）后的 EditorParams。非法 slug（空/纯空白）以
      // ParamsError 失败本次 resolve：params/search 段的失败经路由器
      // errorHandler（全局 RouterError）呈现，下方 errorComponent 只
      // 覆盖 data 段失败（文章不存在/加载失败 → NotFound），与
      // /article/:title 的既有通道分工一致。无参的 /editor（新建）不
      // 声明 params，schema 只作用于本层，行为不变。
      params: editorParamsSchema,
      // 编辑既有文章的取数：与 /article/:title 同构的 withCache 管道
      //（editorLoader，dataloaders.ts；findByTitle 的路径参数即 slug），
      // Editor 经 useEditorData({optional: true}) 读到文章后进
      // 「Edit Article」态（PUT articles/{slug}）。与 Article 视图共用
      // articleCache 的 [slug] 寻址：编辑提交后的整实体失效对两个通道
      // 同时生效。无参的 /editor（新建）不声明 params、不挂 data，本
      // schema 只作用于本层，行为不变。
      data: editorLoader,
      errorComponent: NotFound,
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
      context={routerContext}
      // baseUrl={import.meta.env.BASE_URL.slice(0, -1)}
      errorHandler={(e) => <RouterError error={e} />}
    >
      <View />
      <Loading />
    </Router>
  );
}
