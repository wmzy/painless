# Painless

> 轻量 React SPA 模板 —— 零 SSR、零运行时 CSS、类型安全。

[English](./README.md) | 简体中文

Painless 是一个以 [RealWorld](https://github.com/gothinkster/realworld) conduit demo 形态实现的**模板**：克隆下来、删掉不需要的部分，你就得到一个生产形态的纯客户端 React 应用——带数据加载与登录守卫的路由、HTTP 客户端、类型化 Mock 管线与测试套件——而无需引入任何框架运行时。

## 为什么选择 Painless？

现代前端开发过度复杂。Painless 在保留能力的同时剥离了这些复杂度。

- **零复杂概念** —— 没有 SSR、没有服务端运行时，只有纯客户端 React
- **零运行时 CSS** —— 使用 Linaria，样式在构建期提取
- **类型安全** —— TypeScript 全覆盖，零配置
- **即时反馈** —— HMR 热更新，即改即见
- **预取可感知** —— 悬停文章链接（`PreviewLink`）即在点击前看到目标视图的等比缩小实时预览

## 设计哲学

Painless 做出了刻意的取舍。以下是我们**选择不做**的东西，以及为什么。

### 不做 SSR / SSG —— 纯客户端

我们认为引入 SSR/SSG 带来的架构复杂度对多数应用并不划算。如果你需要搜索引擎 SEO，用无头浏览器给爬虫流量提供预渲染 HTML 即可——一个简单有效的方案，不会把服务端关注点污染进应用架构。

### 不做服务端能力

前端框架不应该试图成为后端。API Routes、Server Actions、服务端中间件属于专职的后端框架。Web 前端不是应用唯一的客户端——移动 App、桌面 App 以及其它客户端都需要同一个后端。把 Web 前端与后端耦合是一种只服务单一客户端的半吊子方案，其它客户端仍要单独对接。一个所有客户端都能消费的干净 API 层才是正确的边界。

### 扁平路由 —— 不做嵌套 / 并行路由

路由即页面，页面即状态。嵌套与并行路由试图把页面状态拆解成独立的 URL 驱动片段，在数据加载、错误边界和布局组合上引入不必要的复杂度。我们认为这是过度设计——如果 UI 的一部分需要独立状态，它应该是一个组件，而不是一个路由。

### 不用状态管理库

如果应用被合理地拆分为职责清晰的页面与组件，状态就活在它被使用的地方。状态管理库鼓励把本应局部的状态集中化，在应用中互不相关的部分之间制造耦合。使用 React 内建原语（`useState`、`useContext`、`useRef`），只在真正共享时才提升状态。

### 不做结构共享 —— 重渲染比深比较便宜

一些数据层库在重拉返回内容不变时保留旧对象引用（结构共享），让订阅者跳过重渲染。我们刻意不做：深相等比较要在每次成功 fetch 付出 O(payload) 的代价，而它省下的重渲染只是一次廉价的页级 reconcile，通常不产生任何 DOM 变更。重拉本身是低频的——`staleTime` 门槛拦住了后台重验证，新鲜期内连请求都不发。个别确实需要跳过更新的组件，用标量 props 配 `React.memo` 解决；不要为了省一个组件的渲染，向所有查询的每次 fetch 征税。

### 不内建图片优化

图片优化是服务关注点，不是框架关注点。专门的图片服务（基于 CDN 或自建）可以向所有客户端——Web、移动、桌面——提供优化后的图片，而不只是前端框架。把它耦合进框架会造成厂商锁定，且只服务单一客户端。

### localStorage 存 token —— 已声明的权衡

认证 token 存在 `localStorage`（`src/services/auth.ts`）——RealWorld 规范要求 `Token` 头认证，而 localStorage 在刷新后依然存活，登录态不因刷新丢失。代价同样摆在明面上：一次成功的 XSS 就能读到 token，而 httpOnly cookie 能把它挡在 JavaScript 可及范围之外。

我们刻意接受这笔交易。教科书式的替代方案——httpOnly 的 refresh cookie 配合内存中的 access token——需要后端配合，这不在纯客户端模板的预设之内，而且它让每次刷新都丢掉登录态：以更差的产品换取更窄的攻击面。XSS 的主要注入面已经封死——React 默认转义，模板从不使用 `dangerouslySetInnerHTML`——剩下的属于纵深防御（CSP 之类），与应用形态强相关，刻意留给应用自行配置。模板的职责是把权衡摆上台面，而不是替你决策。如果你的威胁模型不同，整套机制收敛在一个文件里：替换 `src/services/auth.ts` 中的存储即可。

### 平台无关的部署

Painless 产出标准静态资源。它不与任何特定部署平台耦合——没有专有中间件、没有平台 API、没有厂商锁定。部署到 GitHub Pages、Netlify、Vercel、Cloudflare Pages、你自己的 CDN，或者拷进 U 盘。产物是你的。

## 技术栈

- [React](https://react.dev) —— UI 库
- [@native-router/react](https://github.com/native-router/react) —— 轻量客户端路由，带数据加载与预取
- [react-toolroom](https://github.com/wmzy/react-toolroom) —— 异步数据 hooks（`react-toolroom/async`）
- [fetch-fun](https://github.com/wmzy/fetch-fun) —— 可管道组合的函数式 fetch 工具箱
- [react-f0rm](https://github.com/wmzy/react-f0rm) —— 事件驱动表单库
- [haze-ui](https://github.com/wmzy/haze-ui) —— 零运行时 CSS 组件库
- [react-use-control](https://github.com/wmzy/react-use-control) —— 一行代码统一受控/非受控状态
- [Linaria](https://github.com/callstack/linaria) —— 零运行时 CSS-in-JS
- [Vite](https://vitejs.dev) —— 构建工具
- TypeScript —— 类型安全
- [Vitest](https://vitest.dev) —— 测试框架

## 特性

以下所有示例均摘自（或按 `src/` 真实源码轻微改写）项目实际代码。

### 扁平的配置式路由

路由是一个普通的模块级对象：每条路由拥有 `path`、懒加载的 `component`，以及可选的、在视图渲染前执行的 async `data` 加载器。

```tsx
// src/views/index.tsx
import {View, HistoryRouter as Router} from '@native-router/react';

const routes = {
  component: () => import('./Layout'),
  children: [
    {
      path: '/',
      data: ({location}) => {
        const query = decode(location.search.slice(1));
        return articleService.query(query);
      },
      component: () => import('./Home')
    },
    {
      path: '/article/:title',
      data: ({params: {title}}) => articleService.findByTitle(title!),
      component: () => import('./Article')
    },
    // …… /help、/about、/login、/register
    {path: '/editor', beforeLoad: requireLogin, component: () => import('./Editor')},
    {path: '/editor/:slug', beforeLoad: requireLogin, component: () => import('./Editor')}
  ]
} as Route;

export default function App() {
  return (
    <Router routes={routes} errorHandler={(e) => <RouterError error={e} />}>
      <View />
      <Loading />
    </Router>
  );
}
```

视图用带类型的 `useData<T>()` 读取路由数据，用 `useMatched()` 响应 URL 变化。在 `Home` 中，tag 筛选与分页完全编码在查询串里——路由声明一个 `search` schema（任意 Standard Schema 实现：zod/valibot/……此处为手写），加载器收到 coerce 后的 `ctx.search`，search 变化会重新执行加载器，URL 即状态：

```tsx
// src/views/Home/index.tsx
import {useData, useSearch} from '@native-router/react';

export default function Home() {
  const {articles, articlesCount} = useData<ArticlePage>() ?? {articles: [], articlesCount: 0};
  const {tag, offset, limit} = useSearch(homeSearchSchema);
  // ...
}
```

### 用 `beforeLoad` 实现登录守卫

`@native-router` 自带路由守卫：`beforeLoad` 在视图 resolve 前执行——返回路径字符串，路由器就在导航提交前完成重定向（URL 不会落在受守卫路由上）：

```tsx
// src/views/index.tsx
const requireLogin: Route['beforeLoad'] = () => {
  if (!getCurrentUser()) return '/login';
};

// routes
{path: '/editor', beforeLoad: requireLogin, component: () => import('./Editor')},
{path: '/editor/:slug', beforeLoad: requireLogin, component: () => import('./Editor')}
```

预取也走同一守卫——未登录时 hover 指向受守卫路由的 `PrefetchLink`，只会 resolve 到重定向目标，无副作用。

### `PrefetchLink` hover 预取

`PrefetchLink` 在 hover（或 focus）时预取目标路由的 data **与** 视图 chunk。模板的 `PreviewLink` 在此之上还会渲染一个缩小的预取视图实时预览：

```tsx
// src/components/PreviewLink.tsx
import {PrefetchLink} from '@native-router/react';
import {useControl, type Control} from 'react-use-control';

type Props = ComponentProps<typeof PrefetchLink> & {
  visible?: Control<boolean> | boolean;
};

export default function PreviewLink({children, visible: visibleControl, ...props}: Props) {
  const [visible, setVisible] = useControl(visibleControl as Control<boolean>, false);
  return (
    <PrefetchLink {...props}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        tabIndex={0}
      >
        {children}
      </span>
      <Preview visible={visible} />
    </PrefetchLink>
  );
}
```

> 注意：预取同样会执行路由的 `beforeLoad` 守卫——未登录时 hover 指向受守卫路由的链接，只会 resolve 到重定向目标，无副作用。

### 一个 prop 统一受控/非受控（`react-use-control`）

组件暴露给宿主的状态——面板开合、预览显隐——遵循 **control 对象**约定，取代经典的 `value`/`defaultValue`/`onChange` 三件套。control 是 `useControl` 返回的不透明令牌：谁先创建状态谁拥有它，其余使用者直接复用。同一约定驱动所有 haze-ui 有状态组件与 `FormItem` 表单桥。

改造前——经典三件套，每次渲染与每次写入都要做双源仲裁：

```tsx
type Props = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function DevTool({open, defaultOpen = false, onOpenChange}: Props) {
  // 两份事实来源：外部 `open` 与内部 state
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  };
  // ...
}
```

改造后——`src/components/DevTool.tsx` 实际源码，一个 prop，默认非受控：

```tsx
import {useControl, type Control} from 'react-use-control';

function DevToolInner({open: openControl}: {open?: Control<boolean> | boolean}) {
  const [open, setOpen] = useControl(openControl as Control<boolean>, false);
  // ...
}

export default function DevTool({children, open}: Props) {
  return (
    <>
      {children}
      <DevToolInner open={open} />
    </>
  );
}
```

宿主按用法自行选模式——组件零改动：

```tsx
<DevTool />  // 非受控：内部状态，默认收起
<DevTool open />  // 非受控：普通值作为初始状态种子

// 受控：宿主持有状态——同一份共享状态，而非两份靠回调对账；
// 面板内 Close 按钮经同一 control 写回
const [open, setOpen, openCtrl] = useControl(false);
<DevTool open={openCtrl} />
<button onClick={() => setOpen(true)}>打开面板</button>  // 如快捷键、E2E
```

令牌相对三件套的收益：

- **一个 prop 取代三个** —— 不需要 `defaultOpen`/`onOpenChange` 管线；普通值天然表示“非受控种子”
- **零仲裁、零镜像** —— 不存在第二份事实来源需要对账：已持有状态的 control 被原样复用（无 `useEffect` 同步、无回调往返）
- **兄弟共享免费** —— 同一 control 传给多个子组件即共享同一状态；三件套要给每个子组件穿 `value`+`onChange`
- **全栈一套机制** —— `FormItem` render-prop 的 `control` 就是同一种令牌，react-f0rm 字段才能以 `value={control}` 零适配地绑定 haze-ui 输入控件

适用边界——该模式只用于宿主可能需要驾驭的状态。刻意不改造的：

- 只读接收方：`Preview` 保持 `visible: boolean`——它从不回写
- 已被其它库持有的状态：表单字段归 react-f0rm 所有
- 页面局部状态：视图级 `error` 消息维持 `useState`

一个注意点：control prop 跨渲染必须保持同一引用——开发构建下，同一挂载的 hook 收到不同 control 对象会直接抛错。

### 项目级查询 preset（`createQueryHook`）

模板不引入数据请求库，而是把 `react-toolroom/async` 的原语（`useInjectable`、`useCache`、`useRun`、`useResultSelect`、`useLoading`、`useArgsStatus`、`useFocusRevalidate`、`useReconnectRevalidate`、`useRefresh`）组合成**一个**项目自有的工厂——示范「每个项目定制自己的查询层」这一理念。`createQueryHook(config)` 把全部选项在**场景声明点**一次闭合（此后不可变），返回的 hook 在调用点只收 `args`——零 option、零管线：

```ts
// src/util/useQuery.ts（签名）
export function createQueryHook<C extends QueryHookConfig>(
  config: C
): (args: SceneArgs<C>) => QueryResult<SceneData<C>>;
// SceneArgs：queryFn 的参数元组（剥掉尾参可选 signal）；
// SceneData：其返回类型，未声明 initData 时叠加 undefined

type QueryHookConfig = {
  queryFn: QueryFn<any, any[]>;  // 必填 —— bindQueryFn(fetch, cache) 的产物
  staleTime?: number;            // 默认 2000ms
  initData?: unknown;            // 初始数据；声明后 data 类型收窄为非空
  mock?: MockConfig;             // {schema, key} —— 接入 DevTool mock 面板
};

type QueryResult<T> = {
  data: T;
  loading: boolean;     // 仅初载：首个结果产生前为 true
  fetching: boolean;    // 任意请求进行中（含后台重拉）
  error: Error | undefined;
  failureCount: number; // 本参数自上次成功以来的失败次数
  stale: boolean;
  dataUpdatedAt: number | undefined; // 本参数最近一次成功 settle 的时间戳（TanStack 同名物）
  refetch: () => void | Promise<unknown>; // 删除当前 args 的缓存条目后重发（绕过缓存）
};
```

注意配置里**没有** `cache`：fetch 函数与它的 cache 由 `bindQueryFn(fetch, cache)` 恰好配对一次，产出带幻影品牌的 `QueryFn`——普通 service 函数缺品牌，编译期就进不了 `createQueryHook`；loader、场景 hook、mutation 三条通道都从同一绑定解析 cache，组装点不重复配对。

缓存是**每实体**的（`articleCache` / `homeCache` / `commentsCache` / `tagsCache`，经 `createQueryCache(name, cacheTime?, {persist?})` 声明）：值类型与 key 元组类型都钉在 cache 上——`peek` 结果无需 `as` 收窄，key 写错形状是编译错误；`'article'` 式魔法字符串前缀消失了，因为身份*就是* cache 绑定。哈希做两层归一（剥 signal；递归剥掉值为 undefined 的键），`{tag: undefined}` 与 `{}` 是同一把 key——loader 侧 schema 输出的 key 与视图侧组件状态拼出的 key 永不漂移。`allCaches` 把每个实体 cache 登记进注册表（登出清场 + DevTool 面板遍历）；`tagsCache` 额外带 localStorage 镜像（启动 hydrate、登出擦盘）。

preset 开箱即接线了通常要项目自己手写的行为：同参数并发调用**在 provider 层去重**——`useCache` 的 miss/stale 重验证内部走 cache 的 `load`（原子 get-or-insert 在飞槽位），请求未决期间每个消费者、**每条通道**（另一组件、路由 loader——见下节）拿到同一 key 都共享同一个 promise；依赖变化时经尾参 `AbortSignal` **中止**上一次请求（`useRun({signal: true})`，signal 一路穿透服务层到 fetch）；缓存/load/refetch 的 key 统一为**结构化哈希**（剥除 signal 的 `stableHash`——键序无关）；窗口重新聚焦/可见、断网恢复时**后台重验证**（`useFocusRevalidate` / `useReconnectRevalidate`）——新鲜条目直接命中缓存不发请求，stale 条目静默换新。

真实声明与调用点，来自 tag 侧栏与评论列表：

```tsx
// src/services/dataloaders.ts —— 场景声明点
//（createDataLoader 三元组：loader / useData / queryFn —— 见下节）
export const [, , queryTags] = createDataLoader({
  fetch: articleService.fetchTags,
  cache: tagsCache,
  keyOf: (): [] => []
});
export const useTagsQuery = createQueryHook({
  queryFn: queryTags,
  initData: [],
  mock: {schema: tagListSchema, key: 'tagList'}
});
export const useCommentsQuery = createQueryHook({queryFn: queryComments, initData: []});

// src/views/Home/Tags.tsx —— 调用点零 option
const {data: tags, loading, error, stale} = useTagsQuery([]);

// src/views/Article/CommentList.tsx —— initData: [] 把 data 收窄为 Comment[]
const {data: comments, loading, error, dataUpdatedAt} = useCommentsQuery([title]);
```

#### 何时越过 preset 直取原语

preset 已接线多数项目需要的行为（去重、SWR、聚焦/联网重验证、依赖变化中止）。`react-toolroom/async` 还带了 preset 刻意**不**再导出的更多原语——当其中一件正合身，直接在同一 injectable/cache 上降级用库 hook，别撑大 preset：

- **轮询**（`usePolling` —— TanStack 的 `refetchInterval`）：实时仪表盘。调用慢时自动跳拍、页面隐藏时暂停；传 `args` 让轮询器与 `useRun` 寻址同一缓存 key。
- **无限列表**（`useInfinite` —— TanStack 的 `useInfiniteQuery`）：`fetchNextPage`/`fetchPreviousPage`、`maxPages` 窗口化。About 页的 feed（`src/services/feed.ts`）是仓库内的活例——偏移分页聚合成无限列表，首页与任何普通查询一样由 `useRun` 驱动、翻页由 IntersectionObserver 哨兵触发，且刻意不接缓存：「缓存什么、缓存多久」留给真正跨页面共享数据的场景，这正是按场景组装对一刀切 preset 的意义。
- **重试可观测**（`useRetry` + `useFailureCount`）：preset 已在结果里按参数报告 `failureCount`；要自动重试的场景降级 `useRetry`，配 `useFailureCount` 呈现「重试中 (2/3)……」的 UI。
- **变更串行化**（`useMutation` 的 `scope`，react-toolroom 0.11）：对同一实体的连发写入——模板的收藏按钮按 slug 排队（`scope: (slug) => \`favorite:${slug}\``），第二次点击在*已落定*的基线上执行，而不是赛跑。
- **更底层的存储**（`useResult`/`useLoading`/`useError` 共享同一 injectable 的广播域）：兄弟组件读同一查询免费同步；晚挂载者从最后结果起步，零请求。

经验法则：preset 是默认路径；旁边的库原语是*加法*不是分叉——两者对话的是同一批实体缓存。

### 路由 Loader 共享实体缓存（`withCache`）

两条数据通道——路由 `data` loader 与场景 hook（`createQueryHook` 产物）——刻意共用同一批**实体缓存**。二者差异在**触发时机**与是否阻塞（loader：导航 resolve 期，`pendingComponent` 骨架兜底；query：挂载后，loading/error 状态化），但缓存与失效是同一份。一条声明同时覆盖两条通道：`createDataLoader({fetch, cache, keyOf, mock?})`（`src/util/dataLoader.ts`）返回**三元组** `[loader, useData, queryFn]`——loader 挂到路由表，`useData()` 在视图里读类型化数据（`useData<T>()!` 的断言与泛型标注收拢进工厂；`{optional: true}` 服务「共用组件的路由可能不挂 data」的形态，dev 构建还会校验路由确实声明了本 loader），`queryFn` 喂给 `createQueryHook` 做组件通道。`keyOf(ctx)` 是实体 key 的**唯一定义点**——loader 把 `articleCache` 寻址为 `[title]`、`homeCache` 寻址为 `[search]`，mutation 经 cache 绑定寻址同一批元组，视图彻底不再手工拼 key（旧 `homeCacheArgs`「载荷必须与 schema 输出形状一致」的坑结构性消失——哈希剥掉 undefined 键）。全部声明集中在 `src/services/dataloaders.ts`——路由表与视图消费的应用绑定层。

底层由 `withCache(cache, keyOf, fn)`（`src/util/loaderCache.ts`）包装 loader，带 SWR 语义——新鲜命中直接返回缓存值零请求，stale 命中立即返回旧值并后台重验证，miss 照旧落骨架/错误路径。叠加路由的视图栈，一次导航落在四态之一：

| 落点 | 跑 loader？ | 用户看到 |
| --- | --- | --- |
| viewStack 快照（会话窗口内 POP） | 不跑——快照回放 | 立即呈现上一个视图，**零请求** |
| 缓存命中且新鲜（< `staleTime` 2s） | 跑——只读缓存 | 立即呈现缓存数据，**零请求** |
| 缓存命中但 stale | 跑——后台重验证 | 先见旧值，原地换新——不闪骨架、不闪屏 |
| 缓存 miss | 跑——走网络 | `pendingComponent` 骨架（冷启动） |

在飞请求跨通道共享（provider 层）：`PrefetchLink` 预热与正式导航 resolve 到**同一个**在飞 promise，先 hover 过的链接点击不会重复发请求。闲置条目按条目回收（`cacheTime` 从每条目的 `lastUsedAt` 起算——loader 直写的条目即使没有存活的消费者，闲置满窗口同样被回收，无「永不回收」特例）。

两个会话级新鲜度边界也有兜底：`logout()` 时 Layout 额外调用 `invalidate(router)`（native-router ≥1.6）——丢弃上一账号的视图栈快照，此后后退 POP 走守卫+loader 重解析，而不是回放旧账号的视图；`pageshow` 且 `persisted: true`（bfcache 恢复——SPA 收不到任何导航事件）触发 `refresh(router)`：loader 对缓存重跑，新鲜命中零成本，stale 静默换新。

### 可组合的乐观变更（`cache.mutation`）

写穿式收藏/关注曾经是每个调用点约 30 行手写管线（peek 基线 → set → `refresh(router)` → 成功合并 → 失败回滚）。react-toolroom 0.10 起，这条管线成为**绑定 cache 的声明式 API**——配方住在服务层（`src/services/mutations.ts`），按缓存投影逐层组合：

```ts
// src/services/mutations.ts
// article 层：单实体原语，可被任何视图/其它层复用
export const favoriteOnArticle = articleCache.mutation(
  (slug: string, on: boolean) => ({
    mutate: () => api.favoriteArticle(slug, on),
    key: [slug],
    update: (old) => ({...old, favorited: on,
      favoritesCount: old.favoritesCount + (on ? 1 : -1)}),
    // 字段选择式合并：只有 favorite 域两个权威字段——请求在飞期间
    // 写穿的 following 得以幸存
    apply: (old, resp) => ({...old, favorited: resp.favorited,
      favoritesCount: resp.favoritesCount})
  })
);

// home 层：信息流投影，组合在上一层之上（key 省略 = 补丁打到全部
// settled 条目；不含该 slug 的页 miss-bail 跳过）
export const favoriteOnHome = homeCache.mutation((slug: string, on: boolean) => ({
  mutate: () => favoriteOnArticle(slug, on), // 组合点
  update: (page, slug, on) => {
    const target = page.articles.find((x) => x.slug === slug);
    if (!target) return undefined;
    return patchArticleIn(page, slug, {...});
  },
  apply: (page, resp) => patchArticleIn(page, resp.slug, {...})
}));
```

管道为每次写入记账，失败时带身份守卫回滚——仅当条目仍持有恰好那个乐观值才复原，并发写者的更新状态不会被我们的回滚吞掉。视图收缩为一次调用加错误提示：

```tsx
// src/views/Home/index.tsx
const [favorite] = useMutation(favoriteOnHome, {
  // 同一文章连点串行；不同文章互不阻塞
  scope: (slug: string) => `favorite:${slug}`
});
const toast = useToast();
const toggleFavorite = (a: Article) => {
  if (!getCurrentUser()) return void navigate(router, '/login');
  // 回滚是自动的；toast 是仅剩的用户侧反馈
  void favorite(a.slug, !a.favorited).catch((e) =>
    toast(e instanceof Error ? e.message : 'Favorite failed', {variant: 'danger'})
  );
};
```

组合免费带来三个性质：

- **多投影一致性** —— 从 `Home` 收藏，一次调用同时写 `articleCache` 条目与所有含该 slug 的 `homeCache` 页；「返回列表看到旧计数」的缝隙消失。
- **刷新自动化** —— `withCache` 在 loader 首跑时订阅各 cache 的 `set` 事件，已见过的 key 值引用变化即 refresh 路由（微任务去抖）。写穿、回滚、`patchWhere` 批量补丁、后台重验证 settle 全部经此扇出；视图里零 `refresh` 调用。引用变化判据同时是结构共享的等价物：重验证以同一引用 settle 则什么也不触发。
- **失败隔离** —— 各层独立 miss-bail（不为缺失条目造数，乐观写不可能复活登出刚清掉的条目），一次 rejection 把组合的每一层全部退回。

发表评论仍是声明式失效，但钉到精确 key：`useMutation(articleService.addComment, {invalidates: [[commentsCache, article.slug]]})` 只清当前文章的评论条目（其它文章的缓存原样保留；挂载中的 `CommentList` 经 provider 删除事件被动重拉——追加后的列表形状无法本地推导，硬重拉才是正确工具）。`Editor` 保存则整实体失效（`invalidates: [homeCache, articleCache]`）——两种粒度是刻意的：评论写与 `[slug]` key 一一对应，而 home 投影的 key 是完整的 search 组合、编辑一篇文章影响哪些组合无法在写点本地推导。

### 基于 `fetch-fun` 的类型化 HTTP 客户端

`src/util/http.ts` 构建可管道组合的客户端：base URL（可用 `VITE_API_URL` 覆盖，默认 `https://api.realworld.io/api/`）、JSON 头、认证注入、仅幂等 GET/HEAD 的重试 + 每次尝试 10s 超时，以及把非 2xx 响应映射为 `ApiError` 的错误映射——保留 `status` 与字段结构的 `errors` 对象，`message` 摊平为可读文案（优先取 `message`，否则把 `errors` 拼接成文本）。401 会触发已注册的未授权处理器（auth 服务用它实现 token 过期自动登出）：

```ts
// src/util/http.ts（节选）
export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]>;
}

const client = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  .pipe(ff.use, stripEmptyAuth) // 绝不发送空的 Authorization 头
  .pipe(ff.use, ff.withRetry(2, {methods: ['GET', 'HEAD']}))
  .pipe(ff.use, ff.withTimeout(10_000)) // 每次尝试独立预算，位于 retry 内层
  .pipe(ff.use, mapToApiError); // HTTPError → ApiError（+ 401 钩子）
```

服务层是对 `get`/`post`/`put`/`del` 的薄封装：

```ts
// src/services/article.ts
export function fetchTags(): Promise<string[]> {
  return http.get<{tags: string[]}>('tags').then(({tags}) => tags);
}
```

### dev-only 运行时响应校验

类型声明了形状，线上的数据未必答应。dev 构建下，每个服务层调用同时携带
由同一份领域类型生成的 JSON Schema（与 mock 管道共用同一模块——单点
契约，三处消费：类型、mock、校验）。2xx 响应体失配时以 fetch-fun 的
`ValidationError` 拒绝，message 一行定位漂移——哪个请求、哪条 JSON
指针、期望什么、实际收到什么：

```text
GET articles: 响应失配于 /articles/0/title — must be string（实际值: 42）
```

```ts
// src/util/http.ts（节选）——init.schema 是 opt-in 挂点
function responseSchema(schema: unknown, label: string): ff.StandardSchema {
  return {
    '~standard': {
      version: 1,
      vendor: 'painless/json-schema',
      validate: async (value) => {
        const {check} = await import('./validate'); // ajv，动态加载
        return check(schema, value, label);
      }
    }
  };
}

// src/services/article.ts（节选）——schema 组在生产整体折叠
const schemas = import.meta.env.DEV
  ? {list: articlePageSchema, article: envelope('article', articleSchema), /* … */}
  : undefined;

export function query(params?: ArticleQuery, signal?: AbortSignal) {
  return http.get<ArticlePage>('articles', params, {signal, schema: schemas?.list});
}
```

非 2xx 响应跳过校验（`HTTPError` 语义不受影响）。造数口径注解
（`@minItems`/`@maxItems`/`@unique`/`@faker`——「每页 10 条」是生成指令，
真实 API 的最后一页可以更短）在校验前剔除。生产零成本：
`import.meta.env.DEV` 折叠分支，`ajv` 是 devDependency、只经分支内
动态 import 加载——构建产物已验证不含 ajv（与 faker 栈同款处理）。

mock 管道吃到同一套校验（`mock.ts` 对 always 模式产物按同一 schema
校验），但失败降级为带定位的 `console.error` 而非抛错——json-schema-
faker 0.6 的已知怪癖（深层 `$ref` 嵌套会丢 `@faker` 注解，如
`articles[].author.image` 生成 `null`）不该把 DevTool 的 mock 模式直接
打死；见 `docs/decisions.md` 第 7 条。

### OpenAPI 类型化客户端（演示）

后端发布 OpenAPI spec 时，openapi-typescript（devDependency，零运行时）
把它变成纯类型，一层薄嫁接让整条 `fetch-fun` 管道在编译期受约束——
路径、方法、请求体、2xx 响应。`src/services/article.openapi.ts` 是对
RealWorld 官方 spec 的可运行演示（spec 随库提交在
`openapi/realworld.yml`，`npm run openapi` 重新生成类型）：

```ts
// src/services/article.openapi.ts（节选）——全编译期约束
export function findBySlug(slug: string, signal?: AbortSignal) {
  return ff.fetchData(
    api
      .pipe(typedPath, '/articles/{slug}', {slug}) // 必须是 spec 真实路径 + 参数
      .pipe(typedMethod, 'get')                    // 必须是该路径下的方法
      .pipe(queryAndSignal(undefined, signal))
      .pipe(typedJson, 'get')                      // 响应类型由 spec 决定
  );
}
```

拼写错误立刻报错：`'/article'` 不是 `paths` 的键；`'/tags'` 下没有
`'post'`；`{nome: 'Ada'}` 不满足 `NewArticleRequest`；method 是 `'get'`
却用 `'post'` 的 reader 也是类型错误。演示与手写 `services/article.ts`
并存（刻意保持差异：手写版解包 `{article}` → `Article`，演示版返回
spec 原始响应形状）。它未被任何视图引用，不进生产 chunk。边界与已知的
spec/手写类型漂移记录在 `docs/decisions.md` 第 6 条。

### 带令牌注入的认证

`src/services/auth.ts` 把当前用户持久化到 `localStorage`（`painless.user`），加载时恢复，并向 HTTP 层注册 token 供应商——登录/登出无需重建客户端管道。`src/index.tsx` 以副作用方式导入 `@/services/auth`，保证冷刷新后第一个路由 `data` 请求也带 `Authorization`：

```ts
// src/services/auth.ts
let currentUser: User | null = readStoredUser();
http.setTokenGetter(() => currentUser?.token);

export function getCurrentUser(): User | null;
export function onAuthChange(handler: (user: User | null) => void): () => void;
export function login(email: string, password: string): Promise<User>;
export function register(username: string, email: string, password: string): Promise<User>;
export function logout(): void;
```

`Layout` 通过 `onAuthChange` 订阅，在 `Login / Register` 与 `username / New Article / Logout` 之间切换导航。

### 类型化 Mock 数据 + DevTool 面板

领域类型以 JSDoc 标签携带 JSON Schema 注解。构建期，`rollup-plugin-type-as-json-schema` 把它们编译成 `.schema` 文件；开发期，`src/util/faker.ts` 将其喂给 `json-schema-faker`，并按 json-schema-faker 0.6 的要求通过 `options.extensions` 传入 `@faker-js/faker` 实例：

```ts
// src/types/base.ts
/**
 * @faker {"lorem.sentence": [20]}
 */
export type Sentence = string;

/**
 * @faker {"lorem.paragraphs": [5]}
 */
export type Paragraphs = string;

// src/types/index.ts
export type Article = {
  title: Sentence;
  body: Paragraphs;
  slug: Slug;
  // ...
};
```

两个接入点：

- 路由加载器：`mockViewData(fn, schema, key)` 包装路由 `data` 函数。
- 组件查询：`useQuery` 的 `mock: {schema, key}` 选项。

两者都会在 **DevTool** 面板（仅开发环境）注册，每个数据集可在 `empty`（仅当 API 出错或返回为空时 mock）与 `always`（始终 mock）之间切换。切换模式或面板 Refresh 会清空全部每实体缓存（`clearAllCaches` 遍历 `allCaches` 注册表）——mock 优先于缓存：必须绕过 loader 侧 `withCache` 的新鲜命中，否则 mock 永远不生效（仅开发环境；生产无 mock 调用方）。

面板还托管另外两个开发期检查器：

- **缓存视图** —— `allCaches` 快照：逐条目年龄、在飞徽标与 set/delete 事件流，外加 Clear 按钮（这套栈需要的最接近 TanStack Query DevTools 的东西，运行时成本约等于零）。
- **请求日志** —— `src/util/http.ts` 中 dev-only 的 `withLogging` 中间件把每个 Request/Response/Error 事件推进环形缓冲（`src/util/requestLog.ts`）；面板按最新在前渲染并给状态码着色，「这次交互到底发请求没？」一眼可答。

### 根部主题 control 驱动暗色模式

`src/index.tsx` 在应用根创建唯一的 `useControl` 布尔值——初始跟随 `prefers-color-scheme`，此后归用户所有——并据此切换 `lightTheme`/`darkTheme`（haze-ui 的 `--haze-*` CSS 变量类）。control 经普通 context（`src/util/theme.tsx`）下发到导航栏的 `ThemeToggle`；开关本身是 haze-ui `Switch`，其 `checked` prop 原生接受 `Control<boolean>`——无需 `value`/`onChange` 管线。这也是跨远距组件*共享* control 的范本：根部创建一次，其余使用者复用同一枚令牌。

### 零运行时 CSS

Linaria 样式是标签模板字符串，由 `@wyw-in-js/vite` 在构建期提取——发到浏览器的只有 class 名：

```tsx
// src/views/Home/index.tsx
import {css} from '@linaria/core';

// 把收藏按钮推到卡片作者行的右端
const pushRight = css`
  margin-left: auto;
`;
```

### 错误上报扩展点

模板不携带错误上报 SDK——上报是它拒绝替你做的产品决策。它给的是三个挂载点，一层一个，各自看到失败的不同切片：

- **HTTP 层**（`src/util/http.ts`）——所有通道（路由 loader、`useQuery`、mutation）的每个请求都汇入同一条 fetch-fun 管道，末端的 `mapError` 阶段就是上报器的归属：捕获后原样返回错误，下游 `instanceof HTTPError`、`.status`、`.data` 的语义分毫不动。单个失败的信号最富（状态码、解析后的错误体、请求上下文）——但只覆盖请求失败，且要过滤噪音：被更新的导航取代而中止的请求（`AbortSignal` 透传）是常态，不是错误。
- **路由层**（`src/views/index.tsx`）——导航期失败按段分流：`params`/`search` 解析失败，以及未自带兜底的路由，落进全局 `errorHandler`（渲染 `RouterError`）；路由自己的 `errorComponent`（如 `/article/:title` 的 `NotFound`）只覆盖该路由 `data` 段的失败。分工是：`errorComponent` 管呈现——页面自己决定「文章不存在」长什么样——而 `errorHandler` 是看得到其余一切 loader 失败的唯一收口，也是上报它们的天然挂点。
- **渲染层**（`src/index.tsx`）——路由器兜住 resolve 期失败；视图*渲染中*抛出、或事件处理器里抛出的错误不在它的管道内。模板现状刻意未挂根级 `ErrorBoundary`——合适的挂点是 `src/index.tsx` 的 `Root`，包住 `<App />` 作最后防线，配崩溃兜底 UI 而非白屏。

接入一个（Sentry 伪代码——模板不携带该依赖）：

```tsx
// ① HTTP 层 —— src/util/http.ts 的 mapError 出口：上报后原样返回
.pipe(ff.mapError, (e) => {
  if (!isAbort(e)) Sentry.captureException(e); // 被新导航取代的 abort 不是错误
  return e;
})
// ② 路由层 —— src/views/index.tsx 全局 errorHandler（errorComponent 只管呈现）
errorHandler={(e) => {
  Sentry.captureException(e);
  return <RouterError error={e} />;
}}
// ③ 渲染层 —— src/index.tsx 根 ErrorBoundary（现状未挂；包住 <App />）
<ErrorBoundary onError={(e) => Sentry.captureException(e)} fallback={<Crash />}>
  <App />
</ErrorBoundary>
```

三层刻意重叠——loader 的一次 500 早已路过 HTTP 层——按产品所需的信号选取挂载点，去重交给 SDK（Sentry 一类按错误指纹去重）。

## 快速开始

```bash
# 克隆模板
git clone https://github.com/wmzy/painless.git my-app
cd my-app

# 安装依赖
pnpm install

# 启动开发服务器
pnpm start
```

## 项目结构

```
painless/
├── src/
│   ├── components/     # 可复用 UI：Loading、RouterError、
│   │                   # PreviewLink + Preview、Popover、DevTool（开发期 mock 面板）
│   ├── services/       # 基于 http 的 API 层：article.ts、auth.ts
│   ├── types/          # 领域类型；base.ts 携带 JSON Schema 注解
│   ├── typings/        # 环境声明（vite.d.ts、schema.d.ts）
│   ├── util/           # http.ts、useQuery.ts、faker.ts
│   ├── views/          # index.tsx（路由器与路由表）、Layout/、Home/、Article/、
│   │                   # Editor/、Login/、Register/、About/、Help/
│   └── index.tsx       # 入口
├── public/             # 静态资源
├── .github/workflows/  # CI（lint、test、build）与 Pages 部署
├── vite.config.mts     # Vite 配置（@ 别名、Linaria、schema 插件）
└── package.json
```

## 脚本

| 命令 | 说明 |
|------|------|
| `pnpm start` | 启动开发服务器（Vite） |
| `pnpm build` | 生产构建 |
| `pnpm serve` | 预览生产构建（`vite preview`） |
| `pnpm lint` | 运行 ESLint 并自动修复 |
| `pnpm lint:ci` | 运行 ESLint，不自动修复（CI 用） |
| `pnpm test` | 以 watch 模式运行测试（Vitest） |
| `pnpm test:run` | 单次运行测试（CI 模式） |
| `pnpm test:ui` | 在 Vitest UI 中运行测试 |
| `pnpm coverage` | 运行测试并输出覆盖率 |
| `pnpm openapi` | 从 `openapi/realworld.yml` 重新生成 `src/types/openapi.d.ts` |
| `pnpm deploy` | 构建 demo 并发布到 GitHub Pages |
| `pnpm commit` | 运行 lint-staged，随后进入 commitizen 交互式提交 |

CI 在每次 push/PR 到 `main` 时运行：`lint:ci` → `test:run` → `build`。

## 测试

测试基于 Vitest 与 Testing Library。组件测试（`Home`、`Editor`、`Article`、`PreviewLink`、`Loading`、`RouterError`）mock 服务层而非网络，因此验证的是真实视图逻辑；单元测试直接覆盖 `useQuery`、`http`、`faker` 与 `auth`。

```bash
pnpm test:run                      # 全部测试
pnpm test:run -- src/util          # 某个目录
```

## 相关项目

- [@native-router/react](https://github.com/native-router/react) —— 路由
- [react-toolroom](https://github.com/wmzy/react-toolroom) —— 异步数据 hooks
- [fetch-fun](https://github.com/wmzy/fetch-fun) —— 函数式 fetch 工具箱
- [react-f0rm](https://github.com/wmzy/react-f0rm) —— 事件驱动表单
- [haze-ui](https://github.com/wmzy/haze-ui) —— 组件库
- [react-use-control](https://github.com/wmzy/react-use-control) —— 受控/非受控状态

## 参与贡献

欢迎任何形式的贡献！请阅读[贡献指南](./CONTRIBUTING.md)。

## 版权声明

[ISC](https://choosealicense.com/licenses/isc/)
