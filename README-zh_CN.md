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

模板不引入数据请求库，而是把 `react-toolroom/async` 的原语（`useInjectable`、`useCache`、`useRun`、`useResult`、`useLoading`、`useError`）组合成**一个**项目自有的 hook——示范「每个项目定制自己的查询层」这一理念：

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
  mock?: MockConfig;    // {schema, key} —— 接入 DevTool mock 面板
};

type QueryResult<T> = {
  data: T;
  loading: boolean;
  error: Error | undefined;
  stale: boolean;
  refetch: () => void;  // 删除当前 args 的缓存条目后重发（绕过缓存）
};
```

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

### 收藏 / 关注的乐观更新

变更先更新 UI，再与服务端对账：成功时用服务端权威响应覆盖本地 override，失败时回滚到点击前的值。同一模式驱动 `Home` 的收藏按钮与 `Article` 的收藏/关注：

```tsx
// src/views/Article/index.tsx
const [favOverride, setFavOverride] = useState<FavOverride | null>(null);
const favorited = favOverride?.favorited ?? article.favorited;

const toggleFavorite = () => {
  if (!requireAuth()) return;
  const prev = {favorited, favoritesCount};
  const next = {
    favorited: !favorited,
    favoritesCount: favorited ? favoritesCount - 1 : favoritesCount + 1
  };
  setFavOverride(next);
  articleService
    .favoriteArticle(article.slug, next.favorited)
    .then((a) =>
      setFavOverride({favorited: a.favorited, favoritesCount: a.favoritesCount})
    )
    .catch(() => setFavOverride(prev)); // 回滚 —— 服务端状态从未改变
};
```

发表评论后：重置表单并通过递增 `key` 重挂子树（清空非受控 `Textarea` 的可靠手段），同一计数器再驱动 `CommentList` 绕过缓存 `refetch`。

### 基于 `fetch-fun` 的类型化 HTTP 客户端

`src/util/http.ts` 构建可管道组合的客户端：base URL（可用 `VITE_API_URL` 覆盖，默认 `https://api.realworld.io/api/`）、JSON 头、认证注入，以及把 RealWorld 错误体摊平为可读文案的统一错误映射——优先取 `message`，否则把 `errors` 对象拼接成文本：

```ts
// src/util/http.ts
export function setTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

const client = ff
  .create({baseUrl: BASE_URL})
  .pipe(ff.header, 'content-type', 'application/json')
  .pipe(ff.header, 'accept', 'application/json')
  .pipe(ff.use, ff.withAuth(() => tokenGetter() ?? '', 'Token'))
  .pipe(ff.use, stripEmptyAuth) // 绝不发送空的 Authorization 头
  .pipe(
    ff.mapError,
    (e: unknown) => (e instanceof ff.HTTPError ? new Error(errorText(e.data)) : e)
  );
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

两者都会在 **DevTool** 面板（仅开发环境）注册，每个数据集可在 `empty`（仅当 API 出错或返回为空时 mock）与 `always`（始终 mock）之间切换。

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
