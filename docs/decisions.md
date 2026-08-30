# 架构决策记录

自研库生态（fetch-fun / react-toolroom / react-f0rm / haze-ui / native-router）与
painless 模板之间的集成决策，逐条记录背景与决定；状态变化时在条目内更新，不删历史。

## 1. workspace 化：不做

- **背景**：painless 与六个自研库是平级独立仓库，各库独立发版（semantic-release）、
  独立消费方。monorepo/workspace 化可简化跨库联调，但会绑死发版节奏与仓库权限。
- **决定**：**明确不做**。保持每个库的独立性；跨库集成走
  「库侧 commit 推 main → semantic-release 发版 → painless 按显式版本升级」
  的常规 npm 流程，不用 link/file: 协议。

## 2. useQuery / loaderCache 胶水层上移：暂缓

- **背景**：`src/util/useQuery.ts`（useQuery preset + 每实体缓存注册表 + localStorage
  持久化挂载）与 `src/util/loaderCache.ts`（withCache / bindRefresh 双通道共享缓存）
  是 painless 对 react-toolroom/async 的项目级组合。形态还在随视图需求演化
  （cacheTime 语义、失效扇出、持久化边界），现在固化成库 API 为时过早。
- **决定**：**暂缓**，等 API 形态稳定后再考虑抽独立包。两文件顶部已加
  「上移计划」注释指向本文件。
- **补记（2026-08-30）**：`src/util/dataLoader.ts` 的 `createDataLoader` 工厂已把
  路由 data 三层管道（withCache → mockViewData → 路由 data）收敛为一次声明，
  返回 `[loader, useData, useQueryPreset]` 三元组——视图层手写
  `useData<T>()! / ?? undefined` 断言与组件通道三件套全部消失。工厂已在模板内
  落地验证（三路由 + CommentList 迁移，`src/services/dataloaders.ts` 为应用绑定点，
  机制层零应用知识），**上移形态的预演完成**：将来抽包时 API 面即这个三元组，
  应用侧只保留 dataloaders.ts 的绑定声明。

## 3. native-router beforeLoad context 注入：已解决

- **背景**：路由守卫需要当前用户；native-router 的 beforeLoad 没有官方的
  context 注入点，painless 此前用模块级单例 `getCurrentUser()` 绕过。
  痛点：多 router 实例（微前端/同页多 app）共享单例会串数据；测试里每个用例
  都要重置模块级状态，隔离性差。
- **决定**：**已解决**（@native-router/core 1.10 / react 1.8 的 Router
  context 发版配合）。落地形态是**值注入 + getter**：Router 组件传
  `context={{getUser: getCurrentUser}}`——auth 模块仍是登录态事实源，
  context 只包读取函数；`requireLogin` 守卫改为
  `({context}) => (context.getUser() ? undefined : '/login')`，不再直接
  import auth 模块。要点：
  - 每 router 实例一份 context（创建时的同步快照，非响应式源）——微前端
    同页多实例天然隔离，不再共享单例。
  - 测试守卫只需换一份 context（见 `src/views/index.test.tsx`），无需
    重置 auth 模块状态；当初「context 工厂」方向的担忧（注入边界、类型
    推导）由库侧 `Route` 第三泛型收口：`Route<string, any, RouterContext>`
    让守卫的 `ctx.context` 类型化，与 search 泛型同套路。

## 4. cache 持久化官方化：稳定后再考虑

- **背景**：`useQuery.ts` 里的 `attachPersistence`（localStorage 单键镜像 +
  登出擦盘）目前是模板侧实现，直接依赖 createMemoryCacheProvider 的事件订阅面。
  是否上移为 react-toolroom 官方能力（如 `persist(cache, key, opts)`），
  取决于持久化语义（序列化策略、配额、多标签页）是否已收敛。
- **决定**：**稳定后再考虑**。模板侧实现先行验证语义，避免库侧过早固化
  错误抽象。

## 5. haze-ui 通用/业务分域：暂不考虑

- **背景**：haze-ui 同时含通用组件（Button/Card）与偏业务形态的组件
  （approval-card、tool-call-card、chat-* 等），是否拆成两个包（core / biz）
  有过讨论。拆包成本：发版管线 ×2、peer 依赖矩阵复杂化、按需 CSS 的家族
  映射要跨包。
- **决定**：**暂不考虑**。单包 + 按需 CSS（painless 侧由
  `vite-plugin-haze-css.mts` 自动收集）已控制住体积；等业务组件数量显著
  膨胀再评估。

## 6. View Transition × fetch-fun OpenAPI 嫁接演示：OpenAPI 半已落地，VT 待方案设计

- **背景**：两个候选方向——native-router 的视图切换接 View Transition API
  （浏览器侧平滑过渡），fetch-fun 接 OpenAPI schema 生成类型化客户端。
  「嫁接演示」指在 painless 里用 OpenAPI schema 驱动 fetch-fun 管道，
  同时路由切换走 View Transition，展示组合效果。
- **决定**：**OpenAPI 半已落地为演示**（`src/services/article.openapi.ts`，
  与手写 `src/services/article.ts` 并存对照），View Transition 半仍待方案设计。
  方案与边界：
  - 类型来源：openapi-typescript（devDependency，零运行时）从 RealWorld
    官方 spec 生成纯类型。spec 随库提交在 `openapi/realworld.yml`（上游
    gothinkster/realworld 仓库 `specs/api/openapi.yml`，OpenAPI 3.1——
    注意官方路径已从旧的 `spec/openapi.json` 迁移），`npm run openapi`
    重新生成 `src/types/openapi.d.ts`，离线可复现。
  - 嫁接方式：照 fetch-fun `docs/openapi.md` 的 typed helper 配方
    （typedUrl/typedMethod/typedJsonBody/typedJson），路径/方法/请求体/
    2xx 响应全部编译期约束。两处本地化：JsonOk 联合 200|201（RealWorld
    建 article 返回 201）；补 typedPath 用 `ff.path` 把路径模板约束到
    spec 真实键（占位参数集合模板字面量推导）。演示端点刻意与手写版
    同名对照，但返回 spec 原始响应形状（不解包），toggle 型端点拆成
    两个函数保住字面量类型。
  - 边界：纯类型演示、未被视图引用，不进生产 chunk。spec 类型与手写
    领域类型存在已知漂移（spec 的 bio/image 是 `string | null` 且必填，
    手写是 `string?`；spec Comment.createdAt 是 date-time 字符串，手写
    是 number）——运行时校验（第 7 条）只挂在手写 schema 链上，
    openapi.md 建议的「spec 类型 × validate 配对」留待两套口径统一后
    再做，避免双 schema 打架。

## 7. dev-only 运行时响应校验：ajv 动态 import，失配即抛

- **背景**：模板已有「手写类型 → JSON schema → faker mock」链
  （rollup-plugin-type-as-json-schema），缺最后一环——响应回到 schema
  的运行时校验。fetch-fun 0.10 的 validate 中间件接收 Standard Schema
  v1（鸭子探测），而我们的 schema 是 JSON Schema，需要一个适配层。
- **决定**：**已落地**。`src/util/validate.ts`（ajv，devDependency，
  只经 DEV 分支内动态 import 加载，与 faker 同款生产隔离）+
  `src/util/jsonSchema.ts`（纯函数：envelope 包裹、forResponse 剔除
  mock 口径注解）+ http 出口 opt-in（`init.schema`）+ 服务层逐函数挂
  对应 schema（`src/services/article.ts`，schema 常量整组 DEV 折叠）。
  要点：
  - 适配：http.ts 内联 Standard Schema v1 鸭子对象，validate 函数里
    动态 import 校验器；非 2xx 跳过校验（HTTPError 语义不变）。
  - 报错：抛 `ff.ValidationError`，message 一行定位「请求 + 实例指针 +
    期望 + 实际值」，issues 结构化携带 label/path/schemaPath。
  - mock 口径剔除：`@minItems/@maxItems/@unique/@faker` 是造数注解
    （「每页 10 条」），不该约束真实响应（最后一页可短），校验前剔除。
  - dev 抛错即挡（Zod `.parse` 语义）：类型与后端契约漂移在 dev 立即
    可见，是特性不是误报——第一个会被抓到的已知漂移是官方 spec 的
    bio/image 可为 null 而手写类型是 `string?`。
  - 生产零成本：`import.meta.env.DEV` 折叠 + 分支内动态 import，
    构建产物已验证不含 ajv（同法验证过 faker）。
  - 已知边界：json-schema-faker 0.6 在 $ref 深层嵌套下丢 `@faker`
    注解（如 `ArticlePage.articles[].author.image` 生成 null、username
    生成空串）——mock 侧（`mock.ts` 的 always 分支）校验因此降级为
    console.error 告警并照常返回数据，避免 DevTool always 模式被
    pre-existing 漂移直接打死；修生成侧漂移（换 faker 注解挂载点或
    后处理）是独立后续项。

## 8. createDataLoader 的 DEV 来源校验：声明身份，不做结果指纹

- **背景**：`createDataLoader`（见第 2 条补记）的第二元素 `useXxxData` 取代视图层
  手写 `useData<T>()!` 断言后，需要一个开发期防护拦住「视图读的值不是本 loader
  resolve 的值」——这类错配（复制视图忘换 loader、路由表挂错 loader）此前只会
  表现成渲染出错误实体的静默 bug。候选方案两个：
  - **声明身份**：DEV 下校验 `matched[index]?.route.data === loader`
    （optional 时 `=== undefined` 亦合法），失配 throw 教学式错误。
  - **结果指纹**：`WeakMap<loader, result>` 记录 loader 最近一次 resolve 的值，
    校验 `useData()` 读到的值 === 指纹。
- **决定**：**声明身份**。结果指纹方案被否决，三个场景全部误报：
  1. **同 loader 不同参数的 POP 交叉**：viewStack 回放的是「当时的」值，而
     WeakMap 里是 loader「最近一次」的值——/a → /b（同 loader 不同 key）→
     back 回 /a 时指纹已是 b 的结果，校验必炸；
  2. **乐观写穿**：favorite/follow 经 `cache.mutation` 写穿后 `refresh` 重跑
     loader 纯本地命中，视图读到的（新）值 !== loader 最近 fetch 的（旧）值；
  3. **SWR 旧值先行**：stale 命中先回旧值、后台重验证 settle 后回新值，两阶段
     都可能与指纹错位。
  根因：指纹把「值相等」当「来源正确」的代理，而本仓库的双通道缓存写路径
  （mutation 写穿 / 后台重验证 / 快照回放）合法地绕过 loader 直接改缓存值。
  声明身份校验的是「路由表挂的就是这个 loader」——值怎么进缓存它不管，恰好
  与错配的真实成因（声明处写错）对齐。可行性依据：native-router 的
  resolve-view 直接调用 `route.data(ctx)` 无包装（loader 引用原样保存在
  matched 上），viewStack 的 POP 回放保留原快照的 MatchedContext——往返后
  校验依然成立（`src/util/dataLoader.test.tsx` 有专项用例）。
- **边界**：校验块整体包 `import.meta.env.DEV`（vite define 常量折叠 + 摇树，
  与 DevTool/faker/mock 同款先例），生产产物不含比较逻辑与报错文案；已被
  否决的还有「错误信息增强」等弱用法，首版只留教学式文案点名两种常见
  case（复制视图忘换 loader / 把 loader 再包一层箭头）。
