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

- **背景**：`src/util/useQuery.ts`（场景 hook 工厂 createQueryHook + 每实体缓存注册表 + localStorage
  持久化挂载）与 `src/util/loaderCache.ts`（withCache / bindRefresh 双通道共享缓存）
  是 painless 对 react-toolroom/async 的项目级组合。形态还在随视图需求演化
  （cacheTime 语义、失效扇出、持久化边界），现在固化成库 API 为时过早。
- **决定**：**暂缓**，等 API 形态稳定后再考虑抽独立包。两文件顶部已加
  「上移计划」注释指向本文件。
- **补记（2026-08-30）**：`src/util/dataLoader.ts` 的 `createDataLoader` 工厂把
  路由 data 三层管道（withCache → mockViewData → 路由 data）收敛为一次声明；
  同批把「统一 useQuery + option 对象」重构为「场景化 hook」。当前形态：
  - 三元组 **`[loader, useData, queryFn]`**：第三元素 queryFn 是**绑定 cache
    的取数函数**（`bindQueryFn(fetch, cache)`：service 函数与其实体 cache 的
    配对存模块级 WeakMap，函数本身零改动，见第 9 条）——loader/组件双通道
    共享同一 cache 寻址，mutation 写穿同源。
  - 场景 hook 组装移到应用绑定层 `src/services/dataloaders.ts`：
    `createQueryHook(config)`（`src/util/useQuery.ts`，机制部分——每实体
    缓存注册表 + 持久化挂载——原样保留）把 queryFn/staleTime/initData/mock
    全量在创建时闭合，**运行时调用点只收 args、零 option 零重载**；声明了
    initData 的场景 data 类型经条件类型收窄为非空。
  - 设计哲学：机制/库层不预测用户场景，选项在场景声明点闭合。select/retry
    等未被调用点使用的 option 按 YAGNI 裁剪未实现（传输层重试归 http 的
    withRetry）。
  - **上移形态的预演完成**：将来抽包时 API 面即「createDataLoader 三元组 +
    createQueryHook 工厂」，应用侧只保留 dataloaders.ts 的绑定声明。
  - **补记（2026-09-01）**：@native-router/react 1.11 起 README 的
    「Data loading recipe」节官方化了本配方——以 painless 的
    createDataLoader 三元组为蓝本（文中点名 "extracted from painless，
    the reference SPA template"），并给出裸 useData 消费者的对应类型工具
    `RouteDataOf<S>`。库文档与模板实现自此互为镜像；等价性论证与
    「不接 RouteDataOf」的取舍见第 15 条。

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

## 6. View Transition × fetch-fun OpenAPI 嫁接演示：OpenAPI 已收敛（VT 见第 14 条）

- **背景**：两个候选方向——native-router 的视图切换接 View Transition API
  （浏览器侧平滑过渡），fetch-fun 接 OpenAPI schema 生成类型化客户端。
  「嫁接演示」指在 painless 里用 OpenAPI schema 驱动 fetch-fun 管道，
  同时路由切换走 View Transition，展示组合效果。
- **决定**：**OpenAPI 已收敛**（2026-08-31，原「半已落地」状态收口）。
  View Transition 半仍待方案设计。演进与现状：
  - 类型来源：openapi-typescript（devDependency，零运行时）从 RealWorld
    官方 spec 生成纯类型。spec 随库提交在 `openapi/realworld.yml`（上游
    gothinkster/realworld 仓库 `specs/api/openapi.yml`，OpenAPI 3.1——
    注意官方路径已从旧的 `spec/openapi.json` 迁移），`npm run openapi`
    重新生成 `src/types/openapi.d.ts`，离线可复现。
  - 嫁接方式：typed helper 配方（typedUrl/typedPath/typedMethod/
    typedJsonBody/typedJson）把路径/方法/请求体/2xx 响应全部编译期约束。
    fetch-fun 0.11 起官方化为 `fetch-fun/openapi` 子入口
    （`createOpenapi<paths>()` 工厂；JsonOk 的 200|201 联合已吸收本地化
    差异）。过渡形态（本地依赖 0.10 时按官方形态手写逐行同构工厂）
    已随 0.11 升级删除（de84fee）：`article.openapi.ts` 改
    `import {createOpenapi} from 'fetch-fun/openapi'`，预演的
    「调用点零改动」兑现——五个演示端点函数一行未动。
  - **双口径统一**（收敛的主件）：手写领域类型与 spec 的已知漂移修平
    ——Author/User 的 `bio`/`image` 对齐 spec（必填、`string | null`；
    原 `bio?` / 不可 null 的 `Image`），Comment.createdAt 的 number→string
    漂移此前已修。视图 4 处 Avatar 消费经 `?? undefined` 收 null。
    两套类型自此描述同一份响应契约。
  - **spec × validate 配对**：口径统一后，「双 schema 打架」顾虑消失，
    openapi 通道补上运行时校验接线——复用手写 schema 链（生成 schema
    + envelope），逐端点挂 DEV 校验（`import.meta.env.DEV` 折叠 + 分支内
    动态 import ajv，与手写版同款生产零成本）。形态天然对齐：openapi
    通道直返 spec 原始响应形状（{article}/{tags}/{articles,articlesCount}），
    手写 schema 恰是同一 envelope 形状。
  - 边界：纯类型演示、未被视图引用，不进生产 chunk。

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
    bio/image 可为 null 而手写类型是 `string?`（已随第 6 条收敛批修平）。
  - 生产零成本：`import.meta.env.DEV` 折叠 + 分支内动态 import，
    构建产物已验证不含 ajv（同法验证过 faker）。
- **已知边界（原记录的深层 $ref 丢注解，2026-08-31 已修）**：原症状
  「json-schema-faker 0.6 在 $ref 深层嵌套下丢 `@faker` 注解
  （`ArticlePage.articles[].author.image` 生成 null、username 空串）」
  根因查明：jsf 默认 `maxDepth=5`，超深节点被替换成 `{type:'null'}`
  生成默认值——与 $ref 无关，纯深度截断。修复在 `util/faker` 的
  options：`maxDepth: 16`（覆盖本项目最深形状）+ `minLength: 1`（纯
  string 节点的随机长度可含 0，username 等无注解字段会零星空串）。
  修复后深层 @faker 注解恢复采样、生成数据整体通过 dev 校验
  （faker.test.ts 有 ArticlePage 回归用例）。mock 侧（`mock.ts` 的
  always 分支）校验**保持 console.error 告警不抛**——理由从
  「pre-existing 漂移打死 always 模式」改为防御性：生成器是第三方
  黑盒，未来任何造数缺陷不该让 DevTool 的 always 模式直接不可用。
  残留形态差异（记录备查、均不影响校验）：date.past 注解产出
  Date.toString() 文案（合法 string、非 ISO 形态）；nullable 的
  bio/image 经 anyOf 随机取 null（恰好覆盖新契约的 null 分支）；
  ts-json-schema-generator 对**类型别名**上的 @minItems/@maxItems 不
  生效（TagList 的 10-30 条从未进 schema，属性级注解如 ArticlePage
  的每页 10 条则正常）。

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

## 9. useQuery 语义细则与 bindQueryFn 绑定机制

- **背景**：`createQueryHook` 收敛为场景 hook 工厂（第 2 条补记）时定下的
  几条语义取舍长期只存在于 useQuery.ts 的注释里；2026-08-30 注释按「复述
  代码的不留、库 README 已表达的不留、决策论证入本文件、只留代码读不出
  的坑与不变量」大幅删减后，论证移到这里。同批 bindQueryFn 的绑定存储从
  「Object.assign 往函数上挂 cache 属性」改为模块级 WeakMap。
- **决定**：
  - **loading 仅指初载**（per-args 观测 + SWR 语义重建）：后台重拉不置
    true，已渲染内容不闪整屏 Spinner；任意 in-flight 见 fetching。
  - **结构共享（structural sharing）刻意不做**：重验证低频（staleTime
    门槛拦截，新鲜期内连请求都不发）、页级重渲染廉价（reconcile 后通常
    无 DOM 变更），而 deep-equal 要在每次成功 fetch 付 O(payload)；热点
    组件用标量 props + React.memo 局部解决（settle 后对象 prop 恒为新
    引用，memo 边界上比较标量才有效，比较对象等于手写 deep-equal）。
  - **select 恒等投影是唯一投影**：useResultSelect 只要结果存在就会调
    select，传 undefined 会在首个结果到达时抛「select is not a
    function」；模块级常量保证 select 身份稳定（「结果 + select」双重
    身份的 memo 桶不随渲染击穿），恒等投影下输出即输入。
  - **bindQueryFn 用 WeakMap 存配对 + phantom brand**：`WeakMap<fn,
    cache>` 模块级单表，函数本身零改动（不再挂属性，身份/fn.name/可枚
    举属性都不变，也不会再被枚举出多余成员）；`QueryFn` 类型以模块私有
    unique symbol 打纯类型品牌（`declare const bound: unique symbol`，
    零运行时），普通 service 函数缺品牌、编译期就进不了
    `createQueryHook`。品牌值收 `EntityCache<T, K>`（2026-08-31 从
    `unknown` 收回）：旧版 CacheProvider 成员为属性签名、K 上严格逆变，
    具体 QueryFn 对 `QueryFn<any, any[]>`（`QueryHookConfig.queryFn`
    的字段类型）不可赋值，被迫收 unknown；react-toolroom 0.18.3 起全
    成员改方法简写（双变，库侧同步加 types.test.ts 回归），配合模板侧
    `EntityCache.mutation` 同步方法简写化，具体元组 cache 可赋给
    `any[]` 槽位——注册表 `CacheRegistryEntry.cache` 与 `getCache`
    返回值随之从 `any` 收紧为 `any[]`。读取走导出的
    `getCache(queryFn)`；未绑定（品牌约束被 any 断链绕过时——JS 调用
    方、测试替身）**抛错**而非返回 undefined：早抛比 react-toolroom 深
    处的「cache.get is not a function」更快指向「service 函数忘经
    bindQueryFn 配对」。

## 10. 体积预算：自定义脚本口径 + CI 守门（2026-08-31 review 批）

- **背景**：模板以轻量为核心卖点（按需 CSS 90.2→22.7kB 是关键数据），但 CI
  此前只 build 不守体积，回归无门禁。业界常用 size-limit，但其 preset 对
  vite 多 chunk SPA 的量法（webpack 重新打包 entry）与本仓库真实产物脱节。
- **决定**：自写 `scripts/size-budget.mjs`（零 npm 依赖），口径名
  **「dist JS+CSS gzip 总和（zlib level 9，含懒加载 chunk）」**：逐文件
  `gzipSync(buf, {level: 9})` 求和——zlib gzip 头 MTIME 恒 0，同输入同
  Node 版本逐字节可复现；逐文件而非合并流（静态服务器按文件独立 gzip，
  合并吃到跨文件字典红利、数字失真）；含懒加载 chunk（回归藏在懒加载里
  也是回归）。CI（test job）Build 步骤后接 `pnpm run size`。阈值是棘轮：
  基线 +10% 余量只为吸收小幅正当增长，超限要么回退要么同一 commit 更新
  基线并给理由（脚本头注释承载口径与基线快照）。
- **教训承接**：体积数字报告必须挂可复现口径名（react-toolroom 曾出现无
  任何口径能复现的「+94B brotli」）。

## 11. review 批杂项决策（2026-08-31）

- **useTitle（hook + 两段 effect，不用 React 19 `<title>` JSX）**：恢复
  语义是硬需求——`<title>` 卸载只移除自己浮升的元素，不写回 index.html
  静态默认值，终究要 effect 兜底；`<title>` JSX 的核心收益在流式 SSR，
  本项目零 SSR。两段 effect 规避「[title] 变化触发 cleanup 写回上轮本页
  title」的坑；基线快照取 effect 期而非渲染期（路由换树同一次 commit，
  渲染期读到的是上一页标题）。标题口径统一「<页名> · Painless」。
- **失效粒度按「key 与写操作是否一一对应」分档**：评论写与 `[slug]` 一一
  对应 → 前缀失效 `[[commentsCache, slug]]`（其它文章的评论缓存不误清）；
  home 投影的 key 是完整 search 组合、发布/编辑改变列表形状不可本地推导
  → 整实体失效（Editor 的既有论证不变）。两档并存是刻意对比，非不一致。
- **Register 异步校验 fail-open**：`usernameAvailable` 经
  `GET /profiles/:username` 查重（200 占用 / 404 可用），网络错与 5xx
  一律放行——校验通道不阻塞注册，权威判定在提交时 422（既有
  `applyApiFieldErrors` 兜底）。`meta.signal` 透传到 fetch，被超越回合
  自动取消（react-f0rm validateDebounce）。
- **StackWarmer（initHistoryStack）接入**：HistoryRouter 组件形态下经
  `useRouter()` 在子组件 effect 里调 core 的 `initHistoryStack`，刷新后
  viewStack 尾窗预热、窗内 back/forward 零请求。已知边界（库既定语义）：
  预热经 resolve 直取快照、不经 beforeLoad 守卫——刷新后窗口含守卫路由
  且登录态已变时，POP 落预热快照不重跑守卫；loader 数据公开、写操作有
  401 兜底，当前接受，需严格语义时可在预热后置空守卫槽位。
- **haze-ui 1.12 token 作用域修复**：1.12 起 tokens.css 把
  spacing/radius/typography token 挂到独立作用域类（不再是主题类的
  一部分），根部只挂 `lightTheme/darkTheme` 时全应用
  `--haze-space-*/--haze-radius-*` 不解析（haze 组件 padding/radius 实际
  为 0，颜色 token 不受影响故集成时未被发现）。修复：根 className 合并
  `spacing`/`typography` 导出（挂根一次全树继承）。
- **About Feed 渐进增强**：browserslist 目标含无 IntersectionObserver 的
  环境（KaiOS 2.5），哨兵做特性检测降级——无 IO 时自动续拉静默、哨兵区
  改渲染 Load more 手动按钮；eslint compat 的 polyfills 声明补
  `IntersectionObserver`（引用处有降级路径，非硬依赖）。
- **DevTool `x-if` 死语法清除**：`babel-plugin-transform-jsx-condition`
  只配置在 babel.config.js，vite 管道不消费它——`x-if={show}` 从未生效
  （条件不渲染、React 报 non-boolean attribute 警告），改显式
  `{show && …}`。

## 12. mock 双通道分层与持久化镜像的 always 挂起

- **背景**：mock 有两条通道，分层语义刻意相反。**loader 通道**
  （`dataLoader.ts` 的 `mockViewData`）包在 `withCache` 外层——只有透传的
  真实数据进缓存，faker 造数不污染缓存；**组件通道**（`createQueryHook`
  内的 `useMock`）垫在 `useCache` 内层——mock 命中数据会 settle 进缓存，
  这是 DevTool 面板 Refresh / always / empty 模式生效的前提（垫在缓存
  外层会「缓存命中时 mock 失效、mock 命中时结果又进不了缓存」，论证见
  `QueryHookConfig.mock` 注释）。
- **缺陷**：内层垫法的代价在持久化实体上显形——tagsCache 是唯一持久化
  实体（`painless.cache.tags`），always 期间组件通道的 faker tags settle
  进缓存并经 `attachPersistence` 的 subscribe 镜像落盘；刷新后
  mockConfig（内存态）重置 off，盘上 faker 数据在模块加载时被 hydrate
  回来（早于任何面板条目重建）：侧栏显示假 tags，脱离 mock 面板管理。
- **决定**：**always 激活期间挂起镜像写入**——subscribe 写盘回调开头检查
  `getMockConfigs()`，任一 key `when === 'always'` 即跳过本次写。要点：
  - 只拦镜像落盘：内存缓存照常更新（DevTool 缓存视图与组件消费不受
    影响）；登出擦盘（`persistWipes` 的 removeItem）不经 subscribe
    路径，不受影响。
  - 粗粒度「任一 always 即全挂起」而非按 key 精确拦：mock key 与 cache
    实体没有声明式映射，精确拦要为唯一持久化实体 tags 单建映射关系，
    收益为零。「宁可少写不写脏」：挂起窗口漏写的真实数据只是丢一次
    镜像，内存正确、下次写盘即补上（代价至多一次冷启动重拉）；写脏
    则刷新后永久呈现。
  - 关闭 always 即恢复写盘：DevTool 切 when 本就先 `clearAllCaches()`，
    清内存的 delete 事件在 always 已解除时把空表写回盘（覆掉挂起前的
    旧镜像），真实数据随后 settle 重新落盘。
  - `empty` 模式不拦：它是「真实请求空手而归才造数兜底」，产物在语义上
    与真实空态同权重地进缓存展示，且仅在真实侧确认空时产生；而
    always 是无条件替代，关闭面板后缓存里的假数据即纯污染——两者的
    「假」不可同日而语。
- **`mock-config.ts` 抽模块**：mockConfig 状态（变量 +
  get/getAll/set/change 订阅）自 `mock.ts` 抽出，`mock.ts` re-export 保持
  DevTool 等消费方路径不破；`useQuery.ts` 从状态模块 import
  `getMockConfigs`——直接反向 import `mock.ts` 会与其 `clearAllCaches`
  依赖构成 useQuery↔mock 循环，状态模块零项目依赖是干净解。

## 13. 胶水层上移 API 冻结清单（第 2 条收口的前置基线）

- **背景**：第 2 条暂缓上移的 useQuery / loaderCache / dataLoader 胶水层，
  形态已随三元组 + 场景 hook 收敛（第 2 条补记）。本条把「已冻结面」
  显式列成契约基线：以下签名与语义不变量即上移包的 API 面，改动它们
  等于改动未来库的公开 API，须先修订本条再动代码。
- **已冻结面**（签名 + 语义不变量，出处标注源文件）：
  - `createDataLoader({fetch, cache, keyOf, staleTime?, mock?})` →
    `[loader, useData, queryFn]` 三元组（`util/dataLoader.ts`）：
    - `loader` 内层包装序固定 withCache → mockViewData（mock 最外层，
      faker 造数不进共享缓存——第 12 条 loader 通道语义）；
    - `useData` 的重载体语义：无参返回 T（路由声明了 loader，进组件前
      必已 resolve）；`{optional: true}` 返回 T | undefined（共用组件的
      无 data 路由合法）。DEV 声明身份校验 `route.data === loader`
      （第 8 条）随之冻结；
    - `queryFn` 恒为 `bindQueryFn(fetch, cache)` 产物，第三元素即组件
      通道入口（`createQueryHook` 的唯一合法入参）。
  - `createQueryHook({queryFn, staleTime?, initData?, mock?})`
    （`util/useQuery.ts`）：选项创建时闭合、运行时调用点只收 args 零
    option 零重载；声明 initData 的场景 data 类型收窄为非空。
    `QueryResult` 字段集冻结：`data / loading / fetching / error /
    failureCount / stale / refetch / dataUpdatedAt`，各字段语义见第 9 条
    （loading 仅初载、失败保留 dataUpdatedAt、select 恒等投影等）。
  - `withCache(cache, keyOf, fn, {staleTime?})`（`util/loaderCache.ts`）：
    新鲜命中直返零请求 / stale 旧值先行后台重验证 / miss 走 load 三分支
    语义；同参数并发共享 in-flight；key 的 hash 归一（剥 signal 与
    undefined 键）是两通道同寻址的前提。
  - `bindRefresh`（内部；测试接缝 `bindCacheRefresh`）：cache set 事件
    → 微任务去抖 refresh 最近使用它的 router；判据是「视图已见过的 key
    换了值」（引用 diff，结构共享等价物）；delete/clear 不订阅。
  - `bindQueryFn(fetch, cache)` / `getCache(queryFn)`（`util/useQuery.ts`）：
    WeakMap 配对、函数身份零改动、phantom brand 编译期门槛、未绑定
    早抛（第 9 条）。
  - `createQueryCache(name, cacheTime?, {persist?})` + `allCaches` 注册表
    + `clearAllCaches`（登出清场顺序：先清内存后擦盘）。
  - `attachPersistence`（内部）：载荷版本门禁 `{v, data}`、hydrate 保留
    cachedAt（重启后按真实年龄 SWR）、跨 tab storage 事件清内存不 hydrate
    字节、mock always 挂起镜像写入（第 12 条）。
- **验收测试清单**（上移时随包带走，用例组名即契约文档；改冻结面必须
  先改这些组）：
  - `useQuery.test.ts`：`createQueryHook（场景 hook）` 全组（initData
    初载、SWR 旧值先行、refetch、failureCount、signal abort、hash 归一、
    断网恢复三态、持久化 round-trip、跨 tab 同步、mock always 挂镜像）
    + `bindQueryFn / getCache（fetch × cache 配对）`。
  - `loaderCache.test.ts`：`withCache`（三分支、后台失败保旧、值引用
    不变不 refresh、并发 miss 单飞）+ `mock 面板与 loader 缓存的交互
    （DevTool Refresh 语义）` + `key 归一（hash 剥 undefined 键）`。
  - `dataLoader.test.tsx`：`createDataLoader：DEV 来源身份校验`（含
    错配/再包箭头/optional 对偶五例）+ `createDataLoader：POP 往返
    （viewStack 快照回放）` + `createDataLoader：queryFn + 场景 hook
    （组件通道）`。
- **上移前置条件**：
  - ✅ react-toolroom ≥0.18.3 已发版（`npm view` 核实，gitHead 对应
    a40c39c）——CacheProvider 成员改为方法签名，具体元组实例化可赋值
    给宽泛槽位（method-shorthand 类型修复；EntityCache 的 K 逆变收窄
    依赖它）。painless lockfile 已随升级批切 0.18.4（de84fee）。
  - ✅ fetch-fun 0.11 升级已落地（de84fee，第 6 条 openapi 子入口转正
    同批完成，调用点零改动兑现）——本清单该前置已清。
  - 剩余阻碍（非阻塞、逐项决策后再动）：①mock/DevTool 与
    `attachPersistence` 的耦合（always 挂镜像）上移时需决定——进包
    （带上 mock 语义）或留在模板（包只暴露 persist 挂点与订阅面）；
    ②`services/dataloaders.ts` 绑定层已验证「应用侧只留声明」，上移时
    作为包的 README 示范形态。

## 14. View Transition：库管时序、CSS 管范围（2026-08-31 VT 批）

- **库/模板分工**：`@native-router/react` 1.10 起 Router 系组件的
  `viewTransition` prop 只管**时序**——`document.startViewTransition`
  的调用、commit gate（过渡打开期间挂起新视图提交，由过渡回调内
  flushSync 一次性提交，否则 onLoadingChange 重渲染与 POP 后的窗口
  同步 replace 会在浏览器截帧前抢先提交令过渡被判无变化而跳过）、
  action→types 映射（push/pop/replace）。**不给 DOM 挂
  view-transition-name、不注入全局 CSS**——动画范围与视觉完全是
  使用方 CSS 的事（`view-transition-name` 本就是 CSS 属性）。
- **两套 CSS 配方**（库 README「View Transitions」节给全）：整页
  模式（router 管全文档，root 快照零配置即所需）；局部模式
  （MemoryRouter/嵌套 router：出口容器挂**全文档唯一** name +
  `::view-transition-group(root)`/old/new 三者 `animation: none`
  冻结 root 组）。本模板用整页模式（`src/view-transition.css`）；
  局部模式顺带解决 portal 内容进快照的问题（圈外内容两边都不沾）。
- **谓词双开 push/pop，偏离库默认**：库默认仅 push 动画（pop 走
  viewStack 快照恢复，动画拖慢返回），模板显式
  `viewTransition={(info) => info.action !== 'replace'}` 双开以展示
  方向感（`:active-view-transition-type(push/pop)` 消费，160ms 位移
  + 淡入淡出）；replace/守卫重定向链终点不动画（e2e 钉了零调用
  断言）。
- **降级链**：无 `startViewTransition`（旧浏览器/jsdom）直接提交；
  types 选项不支持（Chrome <129 / Safari <18.2）经一次性行为探测
  （`{update(){}, types:[]}` + 立即 `skipTransition`）回退 callback
  形态——无方向感但过渡仍生效；`prefers-reduced-motion` 由 CSS
  `animation: none` 兜底。
- **滚动恢复时序缺陷（已修，钉版本）**：react 1.10.0 的 VT ×
  ScrollRestoration 有两条确定性坏路径——VT 路径 pop 恢复的
  scrollTo 落在 gate 持有的旧矮 DOM 上被钳到 0；非 VT 路径同步提交
  使文档先收缩、浏览器钳制发生在保存读取之前（保存值即坏）。
  1.10.1 修复（恢复挂起至 VT 提交后经 afterViewCommit 触发 + 离开
  偏移在首个历史事件同步读取 + 探针/正式过渡 ready/finished 补
  catch 止 unhandled rejection 泄漏）。**依赖下限因此是
  ^1.10.1**，e2e 用「出站页矮时 back 后滚动位置恢复」守回归（含
  完整证据链注释）。
- **体积**：VT 批 +1.64 KB（115.50 → 116.56 KB，size-budget 口径）
  ——主要是 CSS 与 react-dom 的 flushSync 引入；预 traded 的
  `Element.startViewTransition` 提案落地或 React stable 通道出
  `<ViewTransition>` 组件时，prop API 形态不变、库内实现可平移。

## 15. 三库发版能力接入批（2026-09-01）

- **版本**：@native-router/core ^1.12.0 + @native-router/react ^1.12.0
  （自 1.11.0/1.10.1）、react-f0rm ^0.8.0（自 0.7.0），npm 显式版本
  安装（第 1 条流程），无双实例/类型骤变（tsc 首轮即绿）。
- **useCanSubmit 替换手组**：Login/Register 的提交按钮 disabled 原由
  `useIsSubmitting(form) || useHasErrors(form)` 两个订阅 hook 手组
  （0.6 时代无复合 flag 的过渡形态），0.8 的 `useCanSubmit(form)`
  （= !isSubmitting && !hasErrors，布尔快照仅翻转重渲染）取代之——
  按钮 disabled 行为逐字节不变，21 个表单单测全绿零改动断言。Article
  的评论提交只挂 isSubmitting（无 hasErrors 门）、Editor 组的是
  isSubmitting × isDirty——语义不同型，均非替换对象。
- **searchDeps 接线（保守起步）**：只接 Home 链——布局层
  `searchDeps: []`（不消费 search）+ Home 叶子层
  `['tag', 'offset', 'limit']`（HomeSearch 全量键：loader 经 keyOf 消费
  整个 search 组合，且 schema 对三键严格校验——快路径跳过 resolve 期
  schema，严格校验的键漏声明会让非法值落 URL 无人检查）。收益：该链上
  无关 search 键变化 / 同 search 重复导航 / 纯 hash 变化 → 快照复用
  零重跑（守卫/loader/懒加载全跳）；声明键变化（翻页/切 tag）照常整链
  重解析。**其余路由（article/help/about/login/register/editor×2）刻意
  不声明**：链覆盖全有或全无，叶子补 `[]` 的收益是「这些链上重复导航/
  纯 hash 变化零重跑」，但每条链都要独立核对「search schema 严格校验的
  键全量声明 + 守卫不读未声明键」两个前置——当前这些路由无 search
  schema 无守卫、收益仅剩重复点击导航栏的场景，viewStack（POP 零重跑）
  已覆盖主要动线；等某条链真出现「无关键变化触发多余重取」的实际痛点
  再逐链接入（届时套 Home 链的两条前置核对即可）。行为锚点：
  `src/views/index.test.tsx` 的 searchDeps 组（含未声明链的对照用例），
  e2e `searchDeps: Home 同 search 重复导航零请求，翻页照常重取`
  钉真实路由表。
- **RouteDataOf 评估：不接**。库侧类型工具 `RouteDataOf<typeof loader>`
  服务的是裸 `useData<T>()` 消费者（把手写泛型换成从 loader 引用推导）；
  painless 的 createDataLoader 工厂里 T 从 fetch 声明直接流进
  `UseData<T>`，视图零泛型标注——已验证
  `RouteDataOf<typeof homeLoader>` 与工厂的 T（ArticlePage）逐类型
  等价（双向可赋值编译实验），且工厂额外绑定「声明身份」（第 8 条 DEV
  校验，RouteDataOf 只保类型不保来源）。回退到 `useData<RouteDataOf<…>>`
  形态等于放弃工厂换弱保证，不接。
- **react-f0rm 0.8 其余能力**：form 级 `validate/validateDebounce`
  （>0 窗口归并 + round gate + 在途轮 abort）评估不接——Register 的
  异步校验在字段级（FormItem validateDebounce 透传 useField），form 级
  校验（密码一致性）是同步的，无 form 级 debounce 消费场景。
- **随批修复（前置基线缺口）**：949ea22（haze-ui 1.12.2 接入）把视图
  控件换成 InputCore/TextareaCore/TagInputCore 但漏登记
  vite-plugin-haze-css.mts 的 FAMILY——kebab 直拼 input-core.css 等
  不存在，`npm run build` 在本批升级前就已必挂（该提交只跑了 tsc/
  vitest，build 缺口未暴露）。按插件自身约定（家族归并以 .haze-<X>__
  类实际落点为准，已核 1.12.2 dist/css：haze-InputCore__* 在 input.css
  等）补三条同名家族映射，build 复绿。
- **体积**：116.95 KB（size-budget 口径：dist JS+CSS gzip 总和，zlib
  level 9，含懒加载 chunk），对 VT 批口径数字 116.56 KB +0.39 KB——
  增量来自三个库升级自身（core 1.11→1.12 的 searchDeps 快路径 +
  react 1.10.1→1.12 + f0rm 0.7→0.8），模板侧接线零增（searchDeps 是
  声明式选项、useCanSubmit 是替换不是叠加）。预算 126.00 KB 内
  （7.2% 余量），棘轮基线不动。
