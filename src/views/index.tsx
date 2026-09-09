import {useEffect} from 'react';
import {
  View,
  HistoryRouter as Router,
  createRoutes,
  useRouter,
  type Route,
  type RoutePaths
} from '@native-router/react';
import {initHistoryStack} from '@native-router/core';

import Loading from '@/components/Loading';
import RouterError from '@/components/RouterError';
import {bindUnauthorizedRedirect, getCurrentUser, type User} from '@/services/auth';
import {
  articleLoader,
  editorLoader,
  homeLoader,
  profileLoader
} from '@/services/dataloaders';
import {homeSearchSchema} from '@/types/search';
import {editorParamsSchema, profileParamsSchema} from '@/types/params';
import {publishRouter, unpublishRouter} from '@/util/routerHost';

import ArticleNotFound from './Article/NotFound';
import HomeSkeleton from './Home/Skeleton';
import NotFound from './NotFound';
import ProfileNotFound from './Profile/NotFound';

// 应用级 router context（@native-router ≥1.10）：守卫/loader 经
// ctx.context 取用户。只包 getter：auth 仍是事实源；测试守卫换一份
// context 即可驱动（无需重置模块单例），同页多 router 不串数据。
// 值是创建时快照、非响应式——守卫每次导航重新求值，天然拿到最新用户。
export type RouterContext = {getUser: () => User | null};
const routerContext: RouterContext = {getUser: getCurrentUser};

// beforeLoad 守卫：返回路径即 resolve 期重定向（URL 不落守卫路由）；
// undefined 放行。preload/PrefetchLink 走同一守卫，无副作用。用户经
// ctx.context 取（Route 第三泛型类型化）。NonNullable 收掉可选成员：
// const 本体恒为已定义函数，测试直接调用不报警。
export const requireLogin: NonNullable<
  Route<string, any, RouterContext>['beforeLoad']
> = ({context, location}) => {
  // 带上原目的页（pathname + search，深链含 query 时整段回跳）：redirect
  // 值必须整体 encodeURIComponent——裸拼 '/' 与 '?' 会把原 query 混进
  // /login 自己的 search（?a=1&redirect=/x?b=2 解析出 b=2）。Login 侧
  // 经 loginSearchSchema 读回（已解码）并白名单校验后导航回去
  if (!context.getUser())
    return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
};

// satisfies 语义：表按 Route 检查，path 保留字面量类型——`as Route` 会
// 拓宽成 string，AppPaths 联合就提不出来。
const routes = createRoutes({
  component: () => import('./Layout'),
  // searchDeps 快路径（@native-router ≥1.12）的链覆盖要求：匹配链
  // 「每一层」都声明才生效，任一层未声明即整链退回现状（任何 search
  // 变化都重解析）。布局层不消费任何 search 键，声明 []（本层对 search
  // 变化全不敏感）；Home 叶子层声明其 schema 严格校验的全量键（见下）。
  // 收益：布局+Home 全声明链上，无关 search 键变化 / 同 search 重复
  // 导航 / 纯 hash 变化 → 快照复用零重跑（守卫/loader/懒加载全跳，
  // 同 POP 落 viewStack 的路径）。其余路由的叶子层刻意不声明——
  // 见 decisions.md 第 15 条的保守取舍。
  searchDeps: [],
  children: [
    {
      path: '/',
      // search 变化即重跑 data（native-router 的视图缓存 key 含 search，
      // searchDeps 声明后收窄为「声明的键变化」才重跑，见下）；schema 在
      // resolve 期解析+校验，loader 拿到的已是 coerce 后的值。
      // data 管道已收敛为 createDataLoader 三元组（声明见
      // services/dataloaders.ts 的 homeLoader）：withCache(homeCache) 双
      // 通道缓存 + DevTool mock + 视图侧 useHomeData 的 DEV 来源校验——
      // 新鲜命中零请求，stale 旧值先行+后台重验证后 refresh 回写，miss
      // 照旧走 pendingComponent 骨架；PrefetchLink 预取与正式导航经
      // provider.load 共享同一 in-flight；signal 透传给 service，被新
      // 导航取代/cancel/POP 取消的请求随 ctx.signal abort。
      search: homeSearchSchema,
      // 本层消费的 search 键 = HomeSearch 全量（tag/offset/limit）：loader
      // 经 keyOf 读完整 search（缓存 key 即整个组合），且 schema 对这三个
      // 键做严格校验（coerce/补缺省）——快路径跳过 resolve 期 schema，
      // 严格校验的键不声明就会让非法值落 URL 无人检查，故必须全量。
      // 声明后：翻页/切 tag（投影变化）照常整链重解析、loader 读到新
      // search；无关键变化/同 search 重复导航/纯 hash 变化零重跑。
      // 视图侧 useSearch(homeSearchSchema) 订阅的是 live location，快照
      // 复用下仍读到新 search（保留视图的 matched ctx 才是 resolve 期
      // 的旧值——不这么读）。
      searchDeps: ['tag', 'offset', 'limit'],
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
      errorComponent: ArticleNotFound
    },
    {
      path: '/profile/:username',
      // params schema（profileParamsSchema）：resolve 期 trim/校验
      // username（同 /editor/:slug 的 editorParamsSchema），loader 拿到
      // 的已是 coerce 后的值；非法值走 ParamsError → 全局 RouterError。
      // 匿名可查（无守卫）——档案是公开实体。
      params: profileParamsSchema,
      // withCache(profileCache) 双通道见 profileLoader（dataloaders.ts）：
      // Profile 视图的 follow 乐观写穿（followOnProfile）与 loader 共用
      // 同一 key（[username]），写穿后 set 事件自动 refresh
      data: profileLoader,
      // 用户不存在（loader 404）/加载失败渲染页面级提示——与
      // /article/:title 同款路由级错误通道
      errorComponent: ProfileNotFound,
      component: () => import('./Profile')
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
      path: '/settings',
      // 设置页：纯登录态视图（更新当前用户），无路由 data——表单初值
      // 由视图从 getCurrentUser() 读（守卫已保证非空）
      beforeLoad: requireLogin,
      component: () => import('./Settings')
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
      errorComponent: ArticleNotFound,
      component: () => import('./Editor')
    }
  ]
});

// 全部路由 path 的字面量联合：TypedLink<AppPaths> 的 to 以此收窄，
// 路径拼写错误在编译期暴露（动态段路由同时要求 params 完整）
export type AppPaths = RoutePaths<typeof routes>;

// StackWarmer 的窗口判定：从路由表推导（children 里带 beforeLoad 的
// 子路由 path），新增守卫路由自动入选。动态段截到首个参数段前
// （/editor/:slug → /editor），匹配按段边界前缀——宁可多跳过（预热只是
// 优化），'/editorfoo' 撞车由段边界排除。导出供测试钉推导契约。
const guardedPrefixes = (routes.children ?? [])
  .filter((r) => 'beforeLoad' in r)
  .map((r) => {
    const p = r.path;
    const dynamic = p.indexOf(':');
    // '/:x' 类全动态模式截完只剩根：回落 '/'（段边界匹配下等价整窗
    // 保守跳过，符合宁多跳过）
    return dynamic > 0 ? p.slice(0, dynamic).replace(/\/$/, '') || '/' : p;
  });
export const isGuardedPath = (pathname: string) =>
  guardedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

// TypedLink<AppRoutes> 的判别源：to 按模式收窄，search 按各层 schema
// 的 input 侧判别。只导出类型：import type 引用零运行时依赖，路由表
// （惰性加载视图）与视图间不产生真实模块环。
export type AppRoutes = typeof routes;

// 刷新后的 viewStack 预热（initHistoryStack）：会话栈序列化进
// history.state，刷新恢复 locationStack 但快照全空——不预热则窗内
// back/forward 每次都惰性重解析。挂载时一次性重解析窗内全部可达条目。
// effect 先于 Router 首次 refresh：当前条目被预热与冷启动各解析一次，
// withCache 的 in-flight 共享并成同一请求。分层（外层命中即短路内层）：
// bfcache > viewStack > queryCache。
// 已知边界：预热经 resolve 直取快照、不经 beforeLoad 守卫（库语义，
// 守卫重定向会破坏窗口形状）。缓解：未登录且窗口含守卫路由时整窗
// 跳过预热，POP 落回惰性重解析、守卫照常重跑。残余边界：跨 tab 登出
// 后 POP 仍可能落登录期快照——loader 数据公开、提交侧有 401 兜底
//（bindUnauthorizedRedirect）。
export function StackWarmer() {
  const router = useRouter();
  useEffect(() => {
    // 守卫缓解判定：登录态读 Router 注入的 context（decisions 第 3 条
    // 的每实例形态，测试换 context 驱动；App 恒注入 routerContext），
    // 窗口枚举走 core 公开面 RouterInstance.locationStack。整窗跳过——
    // 不逐条摘守卫条目：快照槽位与守卫语义耦合（POP 落点的守卫重跑
    // 依赖整窗重解析），保守跳过宁可全退
    const getUser = (router.context as RouterContext | undefined)?.getUser;
    const loggedOut = !getUser?.();
    const windowHasGuarded = router.locationStack.some((l) =>
      isGuardedPath(l.pathname)
    );
    if (loggedOut && windowHasGuarded) return;
    // 各条目的 resolve 失败已被 errorHandler 兜成错误视图，Promise.all
    // 实际不会拒绝；万一 errorHandler 自身抛错，吞掉避免 unhandled
    // rejection——预热失败的代价只是窗内回退退回惰性重解析，无需上抛。
    // DEV 下 console.warn 留定位线索（同 mock 侧 console.error 的先例，
    // 见 util/mock.ts——告警不抛）；生产保持静默
    initHistoryStack(router).catch((e: unknown) => {
      if (import.meta.env.DEV) {
        console.warn('[StackWarmer] initHistoryStack 预热失败', e);
      }
    });
  }, [router]);
  return null;
}

// 401 处置注册挂在 Router 树内（bindUnauthorizedRedirect 需 router
// 实例）。时序同 StackWarmer：effect 先于 Router 首次 refresh，冷刷新
// 首个 data 请求的 401 也有人接——注册晚了退化成纯错误页。
function UnauthorizedRedirect() {
  const router = useRouter();
  useEffect(() => {
    bindUnauthorizedRedirect(router);
  }, [router]);
  return null;
}

// DevTool 面板渲染在 Router 树外，useRouter() 到不了；本探针挂载时把
// 树内实例登记给 core 的 onDebug/getDebugInfo，卸载即撤。DEV 门控：
// 生产折叠（routerHost 模块随之摇掉）。
function RouterHost() {
  const router = useRouter();
  useEffect(() => {
    publishRouter(router);
    return () => unpublishRouter(router);
  }, [router]);
  return null;
}

// 路由 baseUrl 与 vite base 同一事实源：绝对 base（/painless/）→ 剥尾
// 斜杠作前缀；相对 base（dev/可移植部署）→ 空串原样匹配。不接时子路径
// 部署的 SPA 全路径失配 → notFound（线上 demo 首页渲染 Page not found
// 的根因，e2e 跑 dev 根路径拦不住）。BASE_URL 生产构建被 vite 内联。
const routerBaseUrl = import.meta.env.BASE_URL.startsWith('/')
  ? import.meta.env.BASE_URL.slice(0, -1)
  : '';

export default function App() {
  return (
    <Router
      routes={routes}
      context={routerContext}
      baseUrl={routerBaseUrl}
      errorHandler={(e) => <RouterError error={e} />}
      // 未匹配路径 → 页面级 404（@native-router/react ≥1.14 notFound
      // prop：解析以 core 的 NotFoundError 拒绝时渲染，优先于
      // errorHandler；组件类型以无参渲染，back/forward 重放该条目同样
      // 落 404）。与 errorComponent 的分工不变：/article/:title 的 data
      // 段失败仍走路由级 Article/NotFound，这里只接路径不存在
      notFound={NotFound}
      // 视图过渡（@native-router/react ≥1.10）：push/pop 双向开（库默认
      // 仅 push——pop 走 viewStack 快照恢复，动画会拖慢返回；这里显式
      // 双开展示方向感，replace/守卫重定向不动画）。动画范围由
      // view-transition.css 决定（整页模式：root 快照 + 方向感位移）。
      viewTransition={(info) => info.action !== 'replace'}
    >
      <View />
      <Loading />
      {/* 刷新预热挂在 Router 内（useRouter 经 context 取实例），子组件
          effect 先于 Router 的 listen 执行——时序论证见组件注释。
          401 处置注册同款挂法（见 UnauthorizedRedirect 注释） */}
      <StackWarmer />
      <UnauthorizedRedirect />
      {import.meta.env.DEV && <RouterHost />}
    </Router>
  );
}
