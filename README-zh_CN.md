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

export default function PreviewLink({children, ...props}) {
  const [visible, setVisible] = useControl<boolean>(undefined, false);
  return (
    <PrefetchLink {...props}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      >
        {children}
      </span>
      <Preview visible={visible} />
    </PrefetchLink>
  );
}
```

> 注意：预取同样会执行路由的 `beforeLoad` 守卫——未登录时 hover 指向受守卫路由的链接，只会 resolve 到重定向目标，无副作用。

### 项目级 `useQuery` preset

模板不引入数据请求库，而是把 `react-toolroom/async` 的原语（`useInjectable`、`useCache`、`useRun`、`useResult`、`useLoading`、`useInitialLoading`、`useError`、`useRetry`、`useFocusRevalidate`）组合成**一个**项目自有的 hook——示范「每个项目定制自己的查询层」这一理念：

```ts
// src/util/useQuery.ts（签名）
function useQuery<F extends AsyncFunc>(
  fn: F,
  args?: Parameters<F>,
  opts?: QueryOptions<R<F>>
): QueryResult<R<F> | undefined>;

type QueryOptions<T> = {
  cache?: QueryCache;   // 默认模块级共享 queryCache（cacheTime 10s）
  staleTime?: number;   // 默认 2000ms
  initData?: T;         // 初始数据，避免首屏取到 undefined
  retry?: {             // 接 useRetry，默认禁用
    retries?: number;
    backoff?: 'exponential' | 'linear' | ((attempt: number) => number);
  };
  mock?: MockConfig;    // {schema, key} —— 接入 DevTool mock 面板
};

type QueryResult<T> = {
  data: T;
  loading: boolean;     // 仅初载：首个结果产生前为 true
  fetching: boolean;    // 任意请求进行中（含后台重拉）
  error: Error | undefined;
  stale: boolean;
  refetch: () => void;  // 删除当前 args 的缓存条目后重发（绕过缓存）
};
```

preset 开箱即接线了通常要项目自己手写的行为：同参数并发调用**在 provider 层去重**——react-toolroom 0.8 起 `useCache` 的 miss/stale 重验证内部走 `queryCache.load`（原子 get-or-insert 在飞槽位），请求未决期间每个消费者、**每条通道**（另一组件、路由 loader——见下节）拿到同一 key 都共享同一个 promise；依赖变化时经尾参 `AbortSignal` **中止**上一次请求（`useRun({signal: true})`，signal 一路穿透服务层到 fetch）；缓存/load/refetch 的 key 统一为**结构化哈希**（剥除 signal 的 `stableHash`——键序无关）；窗口重新聚焦/可见时**后台重验证**（`useFocusRevalidate`）——新鲜条目直接命中缓存不发请求，stale 条目静默换新。

真实用法，来自 tag 侧栏与评论列表：

```tsx
// src/views/Home/Tags.tsx
const {data: tags, loading, error, stale} = useQuery(articleService.fetchTags, [], {
  initData: [],
  mock: {schema: tagListSchema, key: 'tagList'}
});

// src/views/Article/CommentList.tsx
const {data: comments, loading, error, refetch} = useQuery(
  articleService.fetchCommentsByTitle,
  [title]
);
```

### 路由 Loader 与 query 共享缓存（`withCache`）

两条数据通道——路由 `data` loader 与 `useQuery`——刻意共用同一份模块级 `queryCache`。二者差异在**触发时机**与是否阻塞（loader：导航 resolve 期，`pendingComponent` 骨架兜底；query：挂载后，loading/error 状态化），但缓存与失效是同一份。`withCache(fn, prefix)`（`src/util/loaderCache.ts`）包装 loader，按 `[...prefix, ctx.search ?? ctx.params ?? {}]` 寻址缓存；视图侧用 `homeCacheArgs(search)` / `articleCacheArgs(title)` 生成同形 key（Home 的载荷必须与 `homeSearchSchema` 输出**形状**一致——无 tag 时键不存在）。正是这把共享 key 让 mutation 能写穿缓存（见下节）。

`withCache` 给 loader 带来 SWR 语义——新鲜命中直接返回缓存值零请求，stale 命中立即返回旧值并后台重验证（仅成功才 `refresh(router)`），miss 照旧落骨架/错误路径。叠加路由的视图栈，一次导航落在四态之一：

| 落点 | 跑 loader？ | 用户看到 |
| --- | --- | --- |
| viewStack 快照（会话窗口内 POP） | 不跑——快照回放 | 立即呈现上一个视图，**零请求** |
| 缓存命中且新鲜（< `staleTime` 2s） | 跑——只读缓存 | 立即呈现缓存数据，**零请求** |
| 缓存命中但 stale | 跑——后台重验证 | 先见旧值，原地换新——不闪骨架、不闪屏 |
| 缓存 miss | 跑——走网络 | `pendingComponent` 骨架（冷启动） |

在飞请求跨通道共享（provider 层）：`PrefetchLink` 预热与正式导航 resolve 到**同一个**在飞 promise，先 hover 过的链接点击不会重复发请求。

两个会话级新鲜度边界也有兜底：`logout()` 时 Layout 额外调用 `invalidate(router)`（native-router ≥1.6）——丢弃上一账号的视图栈快照，此后后退 POP 走守卫+loader 重解析，而不是回放旧账号的视图；`pageshow` 且 `persisted: true`（bfcache 恢复——SPA 收不到任何导航事件）触发 `refresh(router)`：loader 对缓存重跑，新鲜命中零成本，stale 静默换新。

### 收藏 / 关注的写穿更新

变更先写穿共享缓存，再与服务端对账——同一模式驱动 `Home` 的收藏按钮与 `Article` 的收藏/关注。`applyCache(next)` 把值按 loader 的 key 写进 `queryCache` 并 `refresh(router)`：loader 重跑是*新鲜缓存命中*，视图零请求、零骨架换新（手写本地 override `useState` 的时代结束——缓存写穿同时惠及后退导航命中，provider 的代次计数也保护它不被在飞的旧响应覆盖）：

```tsx
// src/views/Article/index.tsx
const key = articleCacheArgs(params.title!); // 正是 loader 寻址的那把 key
const applyCache = (next: Article) => {
  queryCache.set(key, next);
  void refresh(router); // loader 重跑 = 新鲜命中 → 视图换新
};

const toggleFavorite = () => {
  const snapshot = article; // 失败时的权威值
  applyCache({
    ...snapshot,
    favorited: !snapshot.favorited,
    favoritesCount: snapshot.favorited ? snapshot.favoritesCount - 1 : snapshot.favoritesCount + 1
  });
  articleService
    .favoriteArticle(snapshot.slug, !snapshot.favorited)
    .then((a) => applyCache(a)) // 服务端权威值校正
    .catch(() => applyCache(snapshot)); // 回滚 —— 服务端状态从未改变
};
```

`Home` 不整体替换而是**补丁**页条目——`queryCache.set(homeCacheArgs({...}), updater(page))` 只换缓存列表里的目标文章（无条目可补丁时放弃，如登出 `clear()` 之后；下一次导航自然重拉）。follow 成功时用 `queryCache.peek(key)` 的**当前值**合并而非闭包快照，follow 在飞期间写穿的 favorite 不会被合并覆盖。

发表评论后：`reset(commentForm, {body: ''})` 重置表单——评论 `Textarea` 经 haze-ui `FormItem` 的 control 桥全受控绑定，reset 直接同步显存文本、无需重挂子树——mutation 的 `invalidates` 再声明式驱动 `CommentList` 绕过缓存刷新。

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

两者都会在 **DevTool** 面板（仅开发环境）注册，每个数据集可在 `empty`（仅当 API 出错或返回为空时 mock）与 `always`（始终 mock）之间切换。任何 mock 配置写入（`setMockConfig`）都会清空共享 `queryCache`——mock 优先于缓存：切换模式或面板 Refresh 必须绕过 loader 侧 `withCache` 的新鲜命中，否则 mock 永远不生效（仅开发环境；生产无 `setMockConfig` 调用方）。

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
│   ├── components/     # 可复用 UI：FieldError、Loading、RouterError、
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
