# 架构决策记录

自研库生态（fetch-fun / react-toolroom / react-f0rm / haze-ui / native-router）与
painless 模板之间的集成决策，逐条记录背景与决定；状态变化时在条目内更新，不删历史。

## 1. workspace 化：不做

- **背景**：painless 与六个自研库是平级独立仓库，各库独立发版（semantic-release）、
  独立消费方。monorepo/workspace 化可简化跨库联调，但会绑死发版节奏与仓库权限。
- **决定**：**明确不做**。保持每个库的独立性；跨库集成走
  「库侧 commit 推 main → semantic-release 发版 → painless 按显式版本升级」
  的常规 npm 流程，不用 link/file: 协议。

## 2. useQuery / loaderCache 胶水层上移：评估后不抽包

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
  - **补记（2026-09-01）**：上移问题已评估收口——结论「不抽包」，胶水层
    常驻模板，本条「暂缓」状态终结。预演过程、五条理由与翻案条件见
    第 13 条补记；两文件顶部的「上移计划」注释已同步改注归宿。

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
- **补记（2026-09-04）：已果**。react-toolroom 0.23 的
  `createMemoryCacheProvider` 新增 `opts.persist`（`{key, version? 默认 1,
  enabled? 默认恒 true}`）——创建期同步 hydrate（版本门禁 + 形状粗验 +
  保留 cachedAt）、全事件镜像写盘写前 diff、跨 tab storage 收敛（别 tab
  写→清内存重拉，不回灌）、`clear` 先空表后 removeItem、存储异常全静默、
  `enabled=false` 挂起只拦磁盘不拦内存与擦盘——第 13 条补记预言的
  persist 原语落地，模板验证期收束的语义逐条被库吸收。模板侧
  `attachPersistence` 已删，`createQueryCache` 的选项改为透传
  `{key, enabled}`（详见第 13 条同日补记），本条「稳定后再考虑」状态终结。

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
    `createQueryHook`。**换绑不同 cache 在 DEV 下早抛**（2026-09-03 修
    订：原「重复绑定后者覆盖」的症状隐蔽——先绑的场景 hook 运行时改读
    后绑的 cache，数据通道无声张冠李戴；重绑同一 cache 实例幂等放行，
    生产维持覆盖不为误写付检查成本）。品牌值收 `EntityCache<T, K>`（2026-08-31 从
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
  - **补记（2026-09-02，第 16 条批次修订）**：`keyOf` 的 ctx 参数从
    `any` 收紧为泛型 `Ctx`（约束 `LoaderCtx`，默认宽松）——调用方按
    路由实际形状注解（如 `{params: {title: string}}`，非可选、无非空
    断言），精确形状流进工厂内部接线（keyOf 返回元组对 cache 的 K、
    fetch 的参数元组都是编译期检查）；loader 的公开类型保持宽松
    `DataLoader<T> = (ctx: LoaderCtx) => Promise<T>`，Ctx → 宽 ctx 在
    返回处一次断言收拢（实测 1.13 的 createRoutes 参数交集中宽松
    Route 成员以 `Record<string, string>` params 逆变换检查，窄 ctx
    形状通不过——连字面量内注解窄 ctx 的回调同样被拒，路由表级闭合
    对工厂产物不可达）。
  - `createQueryHook({queryFn, staleTime?, initData?, mock?})`
    （`util/useQuery.ts`）：选项创建时闭合、运行时调用点只收 args 零
    option 零重载；声明 initData 的场景 data 类型收窄为非空。
    `QueryResult` 字段集冻结：`data / loading / fetching / error /
    failureCount / stale / refetch / dataUpdatedAt`，各字段语义见第 9 条
    （loading 仅初载、失败保留 dataUpdatedAt、select 恒等投影等）。
  - `withCache(cache, keyOf, fn, {staleTime?, maxAge?})`（`util/loaderCache.ts`）：
    新鲜命中直返零请求 / stale 旧值先行后台重验证 / miss 走 load 三分支
    语义；同参数并发共享 in-flight；key 的 hash 归一（剥 signal 与
    undefined 键）是两通道同寻址的前提。**maxAge 硬过期**（2026-09-03
    新增，默认不启用）：条目 cachedAt 距今超过 maxAge 时按 miss 处理
    （走 load / pendingComponent，不再旧值先行）——补 loader 通道
    stale 命中后台重验证持续失败时旧值被无限端出且无感知的缺口。**补记（2026-09-02，同上修订）**：
    `keyOf` 的 ctx 同步泛型化（`C` 约束 `LoaderCtx`，与 `F` 的约束联动），
    `fn`/`keyOf` 的 any 注解消失；`cache.peek`/`cache.load` 的非空断言
    改 `bind(cache)` 一次收窄（缺失即挂载点早抛，取代首请求处的
    TypeError——`createQueryCache` 恒由 `createMemoryCacheProvider` 创建
    的不变量不变）；三分支/in-flight/hash 归一语义逐条不动。
  - `bindRefresh`（内部；测试接缝 `bindCacheRefresh`）：cache set 事件
    → 微任务去抖 refresh 最近使用它的 router；判据是「视图已见过的 key
    换了值」（引用 diff，结构共享等价物）；delete/clear 不订阅。
    **补记（2026-09-02，seen-map 语义修订）**：seen 从「随快照整体替换
    的当前键集」改为「每 key 保留最后所见值」——set 事件合并写入，
    delete/clear 不摘 key。原实现所有事件都整体替换 seen，delete 事件
    会把 key 摘出 seen，后续同 key 重拉 set 新值被判成「新 key 的
    miss settle」不触发 refresh——「失效即刷路由」静默失效（refetch
    的 delete→set 链、DevTool Refresh / 登出清场的 clear→set 链均在
    列，此前属未文档化不变量）。修订后 delete→set(新值) 恢复触发
    refresh；代价是清场后的首轮 set 会多排一次 refresh，由既有收敛性
    兜底（refresh 重跑 loader 新鲜命中只读不写，链即终止），无害。
    **同批修正（e2e 反例）**：整实体 clear 不能与单键 delete 同语义
    ——清场（登出/DevTool Clear）常伴随导航，随后导航 loader 的 miss
    settle 写入若被 seen 残留判成「已见 key 换值」，排出的 refresh 会
    supersede 这条在飞导航链（URL 不落、视图停留原地，e2e「401 自动
    登出后回 Home」实测复现）。而 provider 的 clear() 与 delete() 发
    同形 delete 事件（元组多寡不可判），分家在模板自己的组合点做：
    `createQueryCache` 包装 `clear()` 调 `resetRefreshSeen`（整实体清空
    = seen 代际归零，后续 set 按新 key 处理），单键 delete 保留最后
    所见值（refetch 契约不受影响）。测试接缝 `bindCacheRefresh` 的
    显式重绑定随之改为整体重置（seen 以调用时刻快照为基线）——seen
    保留语义下测试每用例重建订阅需要干净基线；`withCache` 内部的
    常规重绑（每次 loader 运行）仍只改 router 指向，不洗单键 delete
    保留的最后所见值。
  - `bindQueryFn(fetch, cache)` / `getCache(queryFn)`（`util/useQuery.ts`）：
    WeakMap 配对、函数身份零改动、phantom brand 编译期门槛、未绑定
    早抛、换绑不同 cache DEV 早抛（重绑同实例幂等；生产维持覆盖，
    第 9 条）。
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
- **补记（2026-09-01）：上移评估完成，结论「不抽包」**。完整抽包预演已
  做完（独立仓库 react-scenario-query，48 条契约测试随拆分全绿，因 npm
  认证阻断未发版），评估后叫停，胶水层常驻模板。理由：
  - **组合层不是通用原语**：createQueryCache / createQueryHook /
    createDataLoader 是「painless 对 react-toolroom × native-router 的
    组合意见」——换一个业务就是另一个组合。模板被 clone 的意义就是
    改造组合：胶水在树内是可改性，打成依赖等于把「本该被使用者改造
    的意见」冻结成「必须绕开或 fork 的约束」。
  - **单消费者包只剩仪式成本**：跨仓库升级批编排、semantic-release
    协同、npm 认证——每一项都是本生态反复支付的真实成本，零复用收益。
  - **分发模型已选定且一致**：native-router README 的「Data loading
    recipe」节以 painless 为活参考实现（配方走文档 + 参考实现分发，
    不走 npm install，见第 2 条补记），指针长期指向本仓库源码。
  - **真正通用的部分另有归宿**：persist 挂载语义（`{v,data}` 版本
    门禁、hydrate 保留 cachedAt、跨 tab 只清不 hydrate）收敛后上移为
    react-toolroom 的 `persist()` 原语（第 4 条原计划），不归胶水包。
  - **mock 恢复模板内直连**：预演中验证的机制/策略边界（mock 探针
    垫层、persist 写盘 veto 挂点）不再引入模板——解耦形态只在包边界
    下有意义，模板内第 12 条原语义更简单。
  - **本条冻结清单继续有效**，语义从「上移包的 API 面」改读为「模板
    内胶水的契约面」：改冻结面仍须先修订本条再动代码，验收测试清单
    仍即契约文档。
  - **翻案条件**：第二个项目复现同一组合时再抽。代码与冻结面都在
    本仓库与本条清单中，届时成本不变。
  - 预演仓库 github.com/wmzy/react-scenario-query 保留作过程记录
    （未发版，可归档）。
- **补记（2026-09-04）：两处冻结面随库官方化收缩**（react-toolroom
  0.22/0.23，模板接入与本补记同批）：
  - **`attachPersistence` → 库 `opts.persist`**（0.23，第 4 条补记）：
    `createQueryCache` 第三参的 `{persist?: string}` 改为透传
    `{persist?: PersistOptions}`（`{key, version?, enabled?}`），版本
    门禁、形状粗验、cachedAt 保留、写前 diff、跨 tab 收敛、clear 擦盘
    语义整体上移——冻结清单中 `attachPersistence` 条目与
    `clearAllCaches` 的「先清内存后擦盘」顺序约束（擦盘已内建在库版
    clear）随之失效，模板侧只剩 `persistEnabled` 回调承载第 12 条的
    mock always 挂起（判据不变：`getMockConfigs()` 任一 `when ===
    'always'` 即全挂起，粗粒度语义原样）。已知语义差异一处：库
    `enabled=false` 时创建期 hydrate 也跳过（模板原实现只拦写盘）——
    mockConfig 是内存态、刷新即重置，创建期 enabled 恒真，真实 mock
    流程行为无差异。旧盘载荷 `{v:1,...}` 与库默认 `version 1` 兼容，
    存量用户无感迁移。`persistWipes`/`BASELINE_WIPES` 等模板侧擦盘
    记账随删。
  - **模板本地 `stripVolatile` → 库导出**（0.22 起
    `react-toolroom/async` 具名导出）：`hashArgs` 改
    `stableHash(stripVolatile(args))` 组合库版。语义差异一处：库对
    `Map`/`Set` 透传（模板旧实现无此分支，会把它们空对象化）——模板
    参数域是 slug 元组与 HomeSearch 纯对象，无 Map/Set，行为等价；
    循环引用两者均不设防（args 元组天然无环，同旧版）。既有 hashArgs
    契约用例零改动全绿（钉的是行为不是实现）。

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

## 16. 三库新 API 接入批（2026-09-02）

- **版本**：react-toolroom ^0.19.0（自 0.18.4）、react-f0rm ^0.10.0
  （自 0.8.0）、@native-router/core ^1.13.0 + @native-router/react
  ^1.13.0（自 1.12.0）、haze-ui ^1.16.1（自 1.16.0——纯 peer 放宽
  `react-f0rm <0.11.0`，无 API 变化无消费面）。npm 显式版本安装 +
  pnpm dedupe（无双实例），tsc 首轮即绿。
- **writeSchema 消样板**：`src/types/search.ts` 的手写写侧 schema
  （先按读契约 coerce 再抹等于缺省键的投影 + 显式
  `StandardSchemaV1<unknown, HomeSearchInput>` 注解）删除，改
  `writeSchema(homeSearchSchema, {offset: 0, limit: DEFAULT_LIMIT})`
  （core 1.13）——写侧投影语义（值先经读契约 validate、再抹等于缺省
  与 undefined 的键、被抹后的 URL 读回还原同一值）上移为库原语，往返
  不变量由库背书；输出类型 `WriteSearchOutputOf` 自动推断。HomeSearchInput
  保留：TypedLink/pageSearch 的链接契约仍按读 schema 的 Input 位判别
  （写侧 Output 已是推断的可选化投影，两口径不再共用）。调用点
  （Tags/Home 的 `useSetSearch`）零改动；URL 干净度由既有单测（Home
  取消 tag → `setSearch({})`、分页 href 断言）与 e2e 守卫。Login 无
  写侧 search（写入口只在 Home 链），无替换对象。
- **params 类型链消断言**：1.13 的 createRoutes 闭合（SearchRoutesOf
  增加 RawP/GuardP 累积——data ctx.params 由匹配前缀的路由段类型流
  入、并从 loader 声明的 ctx 反推）让 keyOf 的精确形状注解有了库侧
  依据：`dataloaders.ts` 三处 `{params: {title?: string}}` + 非空断言
  改 `{params: {title: string}}`（/editor/:slug 的 `{slug: string}`
  同）。接线走工厂泛型（keyOf 参数 `Ctx`、withCache 联动 `C`），
  `keyOf`/`fn` 的 ctx any、peek/load 的非空断言全部消失——冻结面修订
  与「路由表级闭合对工厂产物不可达」的实测边界见第 13 条补记。
- **Register validateDeps**：`useForm` 加
  `validateDeps: ['password', 'confirmPassword']`（react-f0rm 0.10）
  ——两字段的用户变更重跑 form 级一致性校验，且每轮先清上一轮 form
  validate 写下的错误（round-scoped ownership：字段级 validator、
  setServerErrors、手动 setError 的错误永不被动）。消掉此前注释自认
  的显示局限「mismatch 挂上后改 password 不清错」（form.test.tsx 新
  用例钉住：提交挂 mismatch → 改 password → 错误消失、按钮弹起）。
  门控走变更字段的 mode + form 的 reValidateMode（默认 onChange，
  submit-then-fix 流）；提交永远重跑 form 级校验，安全边界不变。
- **useQuery 消 as Error**：`useArgsStatus<AF, E = Error>`（react-toolroom
  0.19）把 error 从 any 收紧为 `E | undefined`——createQueryHook 组装
  层的 `as Error | undefined` 断言删除，直接透传。
- **useMutation status 不接**：0.19 给 useMutation 返回新增
  `status: 'idle' | 'pending' | 'success' | 'error'`（与 isMutating
  同钟，scope 排队即 pending）——模板 mutation 消费点（favorite/follow/
  评论/编辑）的 UI 只需要 in-flight 门与 catch 侧错误呈现，无终态
  分支渲染场景，接了就是死代码；等某个 mutation 真需要「失败后常驻
  错误态 / 成功后短暂反馈」再接（与第 15 条 RouteDataOf 同款取舍：
  库发了新能力不等于消费方要接）。
- **体积**：117.99 KB（size-budget 口径：dist JS+CSS gzip 总和，zlib
  level 9，含懒加载 chunk），对上批 116.95 KB +1.04 KB——增量来自
  四包升级自身（core 1.13 的 writeSchema 运行时 + react 1.12→1.13 +
  f0rm 0.8→0.10 的 validateDeps 门控 + toolroom 0.18.4→0.19），模板侧
  净减（手写写侧 schema 删除、类型收紧零运行时）。预算 126.00 KB 内
  （6.4% 余量），棘轮基线不动。

## 17. 六库修复批集成（2026-09-02）

- **版本**：@native-router/core ^1.14.0（自 1.13.0）、react-toolroom
  ^0.20.0（自 0.19.0）、react-f0rm ^0.11.0（自 0.10.0）、fetch-fun
  ^0.11.1（自 0.11.0）、@for-fun/event-emitter ^1.0.2（自 1.0.1）、
  haze-ui ^1.17.1（自 1.16.1；1.17.1 纯 peer 放宽，产物与 1.17.0
  逐字节同——npm pack 解包 diff 仅 package.json）；@native-router/react 保持 ^1.13.0
  （本批无改动）。npm 显式版本安装 + pnpm dedupe（无双实例），tsc
  首轮即绿。core 实发 1.14.0 而非编排预期的 1.15.0——a3ed26d（fix）
  与 bd5571a（feat）同批推送，semantic-release 取最高档一次发版，
  gitHead=bd5571a 已核两 commit 均含于 v1.14.0。
- **fetch-fun 0.11.1 三修（唯一改模板断言的库）**：退避期 abort 停止
  重试循环——用户中止在旧版会被 retry 策略当瞬态错误重放（1+2 趟全部
  立即失败），现在退避 sleep 察觉 signal 已中止即终止循环，单次调用以
  AbortError 落定；身份断言（不被误标 TimeoutError）不变，仅调用数
  断言 3→1（http.test 注释同步改写新契约）。Request 输入读取重试方法
  （Request 实例作输入时 body 可重读供重试）与中间件排序/组链记忆化
  （纯 perf）对模板零可观察影响（http 层传路径与 options 对象，不传
  Request 实例）。
- **core 1.14.0 两项零影响**：ranked 匹配修复兄弟短路 + 匹配器记忆化
  ——平铺路由表无同前缀兄弟竞争模式（/editor 与 /editor/:slug 由参数
  段区分、非静态竞争），匹配结果集不变，265 单测 + 28 e2e 路由断言
  零改动全绿；预取有界并发 FIFO abort（preloadConcurrency 默认 4）
  ——StackWarmer 尾窗预热与 PrefetchLink 单路由预取的并发远低于上限，
  有界化的可观察收益是「预取风暴不再无限并发」，模板无需配置。
- **react-toolroom 0.20.0**：usePolling tick 失败记入错误通道——模板
  未消费 usePolling（轮询场景不存在），零影响；useRun 并发同参共享
  （无缓存路径去重）——组件通道的 useCache 路径本就经 provider.load
  去重（README 口径不变），新去重覆盖的是 Feed 的 useInfinite 首页
  驱动这类「无缓存直跑」路径，模板零改动全绿（预期风险点未兑现）。
- **react-f0rm 0.11.0 未消费**：useFieldArrayItem per-item leaf 订阅
  纯新增能力，模板无字段数组场景（Editor tagList 走 TagInput 非数组
  表单域），不接。
- **haze-ui 1.17.0**：FormItem input 桥接 raw DOM（eventToValue 适配
  器）——桥现已接受原生受控组件（不经 useControl 的裸 input/select），
  模板四表单全部用 haze 自家 Control 系组件（InputCore/TextareaCore/
  TagInputCore），新桥接面无消费点，属「库发了能力、消费方暂不接」
  （同第 16 条 useMutation status 取舍）。
- **@for-fun/event-emitter 1.0.2**：emit 空订阅早退（纯 perf），模板
  用于 auth 变更与 mock 配置事件，零可观察变化。
- **haze-ui peer 上限与 react-f0rm 0.11 的声明冲突（如实记录）**：
  haze-ui 1.17.0 的 peerDependencies 仍声明 `react-f0rm >=0.7.0
  <0.11.0`，与本批安装的 0.11.0 冲突（pnpm peers check 报 unmet；
  typescript/eslint 两条 peer 警告为存量工具链项，与本批无关）。实际
  风险评估：react-f0rm 0.10→0.11 全量 diff 仅 useFieldArrayItem 新增
  （context/form 各有小改，无 API 删除），haze-ui FormItem 桥消费的
  useForm/getValueByPath/setValueByPath/useValueByPath/setServerErrors
  面未动，且模板 265 单测（四表单全覆盖）+ 28 e2e 实测通过——de facto
  兼容。收口（同日完成）：haze-ui 4213bdc 放宽 peer 至
  `react-f0rm >=0.7.0 <0.12.0` 发 1.17.1（gitHead 已核），本仓随收
  ^1.17.1——peers check 归零（typescript/eslint 两条存量工具链警告
  与本批无关，仍存）。
- **随批模板侧修复（本地四 commit，074e258/04e1056/d786647/6eaecae，
  本条一并随推）**：bindRefresh seen-map 语义修订（每 key 保留最后
  所见值 + 整实体 clear 代际归零，e2e「401 登出后回 Home」反例修正，
  详见第 13 条补记）；QueryHookConfig initData 泛型收紧（错形状声明
  点即编译错）；useMock 面板 Refresh 改单 key 粒度删除；http label
  只大写 method、URL 原样保留；401 处置链升级为登出+回跳
  （bindUnauthorizedRedirect 挂 Router 树内，冷刷新首个请求也有人
  接）；StackWarmer 未登录守卫缓解（历史窗含守卫路由整窗跳过预热）；
  工具链两小项（vitest 删 passWithNoTests、size-budget 头注释基线
  同步）。
- **体积**：118.94 KB（size-budget 口径：dist JS+CSS gzip 总和，zlib
  level 9，含懒加载 chunk；实测 121794 B / 34 文件），对脚本头注释
  记录的上批实测 120825 B（117.99 KB）+0.95 KB——增量全部来自六库
  升级自身（core ranked 匹配器 + preload 队列、toolroom 去重层、
  f0rm leaf 订阅、fetch-fun 组链记忆化、haze 桥适配），模板侧源码
  零改动（唯一编辑是测试断言，不进产物）。预算 126.00 KB 内（5.6%
  余量），棘轮基线不动。

## 18. typescript/eslint 存量 peer 警告收口（2026-09-02）

- **背景**：第 17 条遗留的两条工具链 peer 警告（typescript 6 / eslint 10
  工具链升级起存在），本批清偿。
- **实测定性（先证伪「已消失」）**：删 node_modules 后按既有 lockfile 完整
  重装零警告输出——是假象：pnpm 仅在 resolution 阶段打印 peer 警告，
  lockfile 未变即跳过 resolution（此前「本地 install 未再现警告」的观测
  即此掩盖）。删 lockfile 全量重解析即复现 `[WARN] Issues with peer
  dependencies`，`pnpm peers check` 退出码 1，列明仅两条：
  - openapi-typescript@7.13.0 声明 peer `typescript ^5.x` vs 实装 6.0.3；
  - eslint-plugin-react@7.37.5（经 tools-config 0.3.1 引入）声明 peer
    `eslint ^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7` vs 实装 10.9.1。
- **升级路径不存在（registry 实证，2026-09-02）**：两声明方均已是 npm
  latest 且 latest 的 peer 区间即如上（dist-tags 的 next 是更老的 rc：
  eslint-plugin-react 7.8.0-rc.0 / openapi-typescript 7.0.0-rc.1）；
  tools-config 已钉 `eslint-plugin-react ^7.37.5`，放宽范围也无版本可解。
  另 eslint-plugin-import@2.32.0 的 peer 同封顶 ^9，但其 eslint 声明为
  optional peer，pnpm 不告警，不属本条。
- **de facto 兼容实证**：eslint 10 全链路实跑（lint:ci 全绿，react /
  import / typescript-eslint 规则集真实执行）；openapi-typescript 现环境
  实跑 codegen 55.5ms、产物与库内 src/types/openapi.d.ts 逐字节同；
  typecheck（TS 6 编译全仓含生成类型）全绿——两条均为上游元数据迟滞，
  非实际不兼容。
- **决定**：用 pnpm 官方豁免机制显式收口——pnpm-workspace.yaml 增
  `peerDependencyRules.allowedVersions`（eslint `^10` / typescript
  `^6`，窄区间：仅豁免现装大版本，未来 eslint 11 / TS 7 出现新区间
  冲突照常告警）。机制经对照实验钉住：同依赖图无规则 → 重解析 WARN +
  peers check 退出 1；有规则 → 重解析零 peer 警告 + peers check 退出 0
  （pnpm 11.22 的 peers check 同读该规则）。
- **移除条件**：eslint-plugin-react 发版接受 eslint 10、或
  openapi-typescript 发版接受 typescript 6 时，删除 pnpm-workspace.yaml
  该节；此后新出现的 peer 警告一律当真处理。
- **验证**：typecheck + 265 单测（24 文件）+ build + size 118.94 KB /
  126.00 KB（棘轮基线不动）+ lint:ci + 全量重解析安装零 peer 警告 +
  `pnpm peers check` 退出 0，全绿。
- **随记**：全量重解析相对既有 lockfile 另有时间窗漂移
  （typescript-eslint 8.68.0→8.69.0、tsc-alias 1.9.2→1.9.3、
  @cacheable/memory 2.0.9→2.2.0 等 minimumReleaseAge 窗口移动所致）与
  一条 deprecated 子依赖提示（glob@7/8、inflight@1，长期存在项）——均
  与本收口无关，不捎带，留周期性升级冒烟（upgrade-smoke）处理。

## 19. 两库新发版集成批（2026-09-02）

- **版本**：react-f0rm ^0.11.1（自 0.11.0）、haze-ui ^1.18.0（自
  1.17.1）。npm 显式版本安装 + pnpm dedupe（全树无双实例），tsc 首轮
  即绿。gitHead 双核：react-f0rm@0.11.1 = ce8e1af、haze-ui@1.18.0 =
  71a8d94，均与本批上游推送 commit 一致。
- **react-f0rm 0.11.1（bug 修复，模板零可观察变化）**：leaf 读改为
  跟随整分支写入、不再回退 initialValues 快照——根因三层：getValueByPath
  代际回退（旧代快照遮蔽新写入）、setValueByPath 后代键遮蔽、数字
  segment 数组腐化。模板四表单（Login/Register/Editor/Article 评论）的
  `FormItem` control 经 `useValueByPath` 订阅 + `reset(form, {...})` 整值
  写入正是该修复硬化的路径，但既有场景本就落在正确行为侧：265 单测与
  28 e2e 断言零改动全绿（预期影响面兑现——模板表单行为无变化）。上游
  566/566、perf 中性、leaf 订阅粒度不变；模板不接新 API、无断言修订。
- **haze-ui 1.18.0（纯新增能力，零接触）**：TransferCore/UploadCore
  值直出核心变体（经 FormItem input 桥零适配接入表单），Transfer/Upload
  外壳公开面不变（上游 860/860）。模板无 Transfer/Upload 消费场景，
  属「库发了能力、消费方暂不接」（同第 16 条 useMutation status /
  第 17 条 FormItem raw DOM 桥取舍）；dist 全文检索零命中（transfer
  字样仅为 dataTransfer/transferSize 平台 API），按需导入下零字节
  进包体。
- **peer 检查**：升级重装零 peer 警告，`pnpm peers check` 退出 0——
  第 18 条 eslint ^10 / typescript ^6 窄区间豁免仍适用，无新增豁免
  需求（haze-ui 1.18.0 的 react-f0rm peer 区间 `<0.12.0` 覆盖 0.11.1）。
- **体积**：119.03 KB（size-budget 口径：dist JS+CSS gzip 总和，zlib
  level 9，含懒加载 chunk；实测 121890 B / 34 文件），对上批实测
  121794 B（118.94 KB）+0.09 KB——增量全部来自 react-f0rm 0.11.1 修复
  运行时；haze-ui 新组件 tree-shake 零贡献。预算 126.00 KB 内（5.5%
  余量），棘轮基线不动（BASELINE_BYTES 与阈值代码不动，脚本头注释随批
  同步本批实测）。
- **验证**：typecheck + lint:ci + 265 单测（24 文件）+ build + size +
  28 e2e 全绿。

## 20. f0rm 1.0 路径收紧 + haze peer 收口集成批（2026-09-02）

- **版本**：react-f0rm ^1.0.0（自 0.11.1）、haze-ui ^1.18.2（自
  1.18.0）。npm 显式版本安装 + pnpm dedupe（全树无双实例），tsc 首轮
  即绿。gitHead 双核：react-f0rm@1.0.0 = c4fa94e（feat! 2fb54db 的直接
  子代 docs 提交——两提交同批推送，semantic-release 以 push 头打 tag，
  feat! 已包含、docs 不另发版；且 feat! 经默认 commit-analyzer 直升
  major，1.0.0 是既定行为、非 0.12.0 预期落空）、haze-ui@1.18.2 =
  02fdf05，均与本批上游推送头一致。
- **react-f0rm 1.0.0（feat!: 路径语法收紧，模板零可观察变化）**：
  parsePath 对纯数字的点分标识段（items.0 / items.0.name / 顶层 0）抛
  TypeError 并在报错文案中给出 bracket 拼写（items.0 → items[0]）；
  items[0] 与 items["0"] 语义不变；FieldPath<T> 类型层同步不再枚举
  点数字段段（编译期即拦）；getErrors/getDirtyFields/getTouchedFields
  输出侧仍为 dotted 展示字符串、不受影响。模板兼容面预检（grep 全量
  字段绑定）：四表单字段名全为平面字符串（title/description/body/
  tagList/email/password/username/confirmPassword），tagList 整体寻址
  无索引拼写，applyApiFieldErrors 字段清单同为平面名——零点数字段
  路径，收紧对合法拼写零影响；265 单测与 28 e2e 断言零改动全绿兑现。
- **haze-ui 1.18.2（纯 peer 元数据收口，零产物字节）**：1.18.0→1.18.2
  三连发均止于 package.json 层——1.18.1 放宽 react-f0rm peer 至
  <0.13.0（按当时 0.12.0 预期写下），f0rm 实发 1.0.0 后区间不覆盖，
  1.18.2 再放宽至 >=0.7.0 <2.0.0；上游 devDependencies 同步
  ^0.8.0→^1.0.0 并以全量 860 测试 + tsc --noEmit + build 实证兼容后
  才声明（证据链见 02fdf05 提交）。demo CacheProvider 泛型修复与
  typecheck CI 门禁（61b1d6c，chore 不计版本）均不入产物。本模板
  dist 与 haze 1.18.1 中间态逐字节同（122005 B），即 1.18.0→1.18.2
  对包体零字节。
- **peer 检查**：升级重装零 peer 警告，`pnpm peers check` 退出 0——
  f0rm 1.0.0 与 haze 1.18.1 的区间冲突经上游正式发版收口，而非本仓
  豁免（与第 18 条「上游确实无法声明兼容」的豁免前提不同，故不动
  peerDependencyRules）；第 18 条 eslint ^10 / typescript ^6 窄区间
  豁免仍适用、无新增。
- **体积**：119.15 KB（size-budget 口径：dist JS+CSS gzip 总和，zlib
  level 9，含懒加载 chunk；实测 122005 B / 34 文件），对上批实测
  121890 B（119.03 KB）+0.11 KB——增量全部来自 react-f0rm 1.0.0
  parsePath 收紧的抛错分支与错误树字符串段处理；haze-ui 纯元数据
  发版零贡献。预算 126.00 KB 内（5.4% 余量），棘轮基线不动（阈值与
  BASELINE_BYTES 代码不动，脚本头注释随批同步本批实测）。
- **验证**：typecheck + lint:ci + 265 单测（24 文件）+ build + size +
  28 e2e 全绿。

## 21. 生态评审修复批：七库修复 + 模板加固集成（2026-09-04）

- **背景**：对模板 + 七个自研库（native-router / react-toolroom /
  fetch-fun / react-f0rm / haze-ui / react-use-control / @for-fun/
  event-emitter）的全面评审（对比 TanStack / ky / mitt / RHF / Radix）
  产出 P0-P3 修复清单；库侧由 CI semantic-release 发版、模板从 npm
  集成（不用 workspace link），共 7 库 35 commit + 模板 9 commit。
- **版本**：@native-router/core ^1.15.0 + @native-router/react ^1.14.0
  （回摆竞态/零 delta veto/getParams 窗口外 undefined/setSearch 兜底四
  fix；route 级 context 合并注入、Router notFound、pendingDelayMs 应用
  内导航骨架、createRoute 工厂编写时类型化、initHistoryStack 并发限流
  五 feat——模板暂未消费新 API，仅升级锁定兼容面，后续按需采用）、
  react-toolroom ^0.21.0（useRetry abort 纪律 + 抖动、focus/reconnect
  重验证 staleTime 门控 + rejection 兜底、per-key stale）、react-f0rm
  ^1.1.0（字段卸载精确事件、trigger 作用域等待、字段级 validateDeps、
  getValues 缓存、初值 render 期 seed 等九项）、fetch-fun ^0.12.1
  （timeout 能力降级、beforeRetry 钩子、Retry-After、mapError 语义、
  openapi 2xx/typedQuery；0.12.1 修跨 realm 超时判别，见下）、
  haze-ui ^1.19.0（Popover 键盘可达、FormItem asProps 优先级、Toast
  WCAG 2.2.1 暂停/上限/位置、tier-2 视口翻转、子路径 exports、axe
  基线）、react-use-control ^1.5.1（watch 副作用出 updater、受控切换
  DEV warn、字符串 brand 双副本互识）、@for-fun/event-emitter ^1.1.0
  （off/removeAllListeners、emit 异常隔离、DEV maxListeners；semantic-
  release 单 push 聚合发一版，1.1.0 已含全部）。
- **fetch-fun 0.12.0→0.12.1 集成期修复**：0.12.0 的超时判别用
  `instanceof Error`，在 vitest 内嵌 jsdom 的双 realm 环境失效（其
  DOMException 原型链上的 Error 与本模块 realm 的 Error 非同一对象，
  instanceof 恒 false）→ 降级包装不触发、DOMException 裸漏；0.12.1 改
  name 鸭子判别（自有信号中止范围限定内）修复。连带修正本仓
  http.test 超时用例：原 mock 将 30s 总预算与 10s 单次预算共用同一
  signal——旧断言 10000ms 是 0.11.x 外层 totalTimeout 判别失效（同一
  realm bug）从不认领的副产物；0.12.1 起外层合法认领（30000ms），用例
  改为区分两个预算 signal（同 totalTimeout 用例模式）后断言 10000ms
  成立，语义与真实管线一致。
- **模板侧同批加固**（与库发版并行，独立成 commit）：bindQueryFn 换绑
  不同 cache DEV 早抛（第 9 条不变量升级为运行时守护，重绑同 cache 幂
  等放行）；loaderCache 多 router 覆盖 DEV 告警；hashArgs 递归剥嵌套
  signal（stripVolatile 与递归剥 undefined 对称）；get() init 类型收
  Omit<..., 'method'> + 运行时后置合并兜底；withCache 新增 maxAge 硬
  过期（默认不启用，第 13 条冻结面已补记）；三条契约测试（跨 tab
  storage 互写收敛 / mock always 期间持久化挂起核实 / e2e 文章 404 →
  errorComponent）；resetAllCaches 测试工具收拢清场样板。
- **体积**：121.54 KB（实测 124454 B / 34 文件），对上批 122005 B
  （119.15 KB）+2.39 KB——增量主要来自 react-f0rm 1.1.0（字段级
  validateDeps/初值 render 期 seed）与 react-toolroom 0.21.0（per-key
  stale/abort 纪律）的运行时新增；预算 126.00 KB 内（3.5% 余量），棘
  轮基线不动（BASELINE_BYTES 与阈值代码不动，脚本头注释随批同步本批
  实测）。
- **验证**：typecheck + 275 单测（24 文件，净增 10 条）+ build + size +
  29 e2e（新增 404 → NotFound 一条）全绿。

## 22. 评审后置项实施批：七库修复 + 模板加固 + 三能力上移（2026-09-04）

- **背景**：第 21 条生态评审修复批同日的二次评审（模板 + 七库对照
  TanStack 系）产出 18 项改进清单；本批按「库侧推送 → CI semantic-
  release 发版 → 模板 npm 显式版本集成（不 link）」流水线全量落地，
  多 agent 并行分仓实施。
- **库侧（各仓 origin/main，CI 已发版）**：haze-ui 1.20.0/1.21.0
  （Dialog 背景点击 onClose 双触发收敛到原生 close 单出口；新组件
  AsyncSection——loading/error/正常三分支；useTitle 上移主桶；dist
  ESM 发布契约守卫测试）、react-toolroom 0.22.0/0.23.0（stableHash
  symbol 按 description/注册键折叠 + undefined 值键折叠、useInfinite
  fetchNext/Prev 在飞 no-op、stripVolatile 导出 + stableHash 丢
  undefined 键——多通道 key 归一契约官方化；createMemoryCacheProvider
  opts.persist——本模板 attachPersistence 的官方化，见第 4 条补记）、
  @native-router/core 1.15.1（取消/被取代的导航链由「永不 settle」改
  reject NavigationCancelledError——veto=用户拒绝属正常完成 resolve、
  cancel/supersede=链失败 reject 的语义二分；模板 6 处 void navigate +
  3 处 void refresh 统一挂 .catch(()=>undefined) 吞除，auth 401 契约
  用例钉住）、native-router/react（from-tanstack-router.md 的「声明
  序先中即赢」陈旧匹配描述改为特异性打分制实况，README 双语同步；
  docs/test commit 不触发发版）、react-f0rm 1.1.1（pathCache FIFO
  上界 1e4，动态拼 key 场景内存兜底）。
- **模板侧 bug 修复**：sanitizeRedirect 补反斜杠拒绝（/\evil.com 经
  WHATWG 归一成协议相对跳转的 SPA open redirect）；Loading portal
  pending 期卸载残留（cleanup 补 remove，rAF 持 id 取消）；readStor-
  edUser 补 username/image 形状校验（半坏登录态不再恢复成已登录）。
- **模板侧加固**：Router 采纳 notFound prop（未匹配路径专用 404 视图
  取代 errorHandler→裸 stack），RouterError 的 stack 仅 DEV 渲染（生产
  信息泄露收口）；StackWarmer 守卫前缀从手写常量改为路由表推导（新
  增守卫路由自动入选，删手工同步注释）；RealWorld 错误契约双份解析
  下沉 src/util/apiError.ts（http 文案与表单回填共用 parseApiError）；
  CommentList 时间戳 locale 英文化对齐全站文案。
- **能力上移的模板收敛**：useTitle 删本地实现改 haze-ui 导出（9 调用
  点；vite-plugin-haze-css NO_CSS 增补防 css 直拼）；Tags/CommentList/
  Feed 三处三分支换 AsyncSection；attachPersistence 整段删除换
  opts.persist（persistEnabled 回调保留 mock always 挂起语义；旧盘载荷
  {v:1} 与库默认 version 1 兼容无感迁移；库 enabled=false 连创建期
  hydrate 也跳过与模板原「只拦写盘」的差异经 mock 配置内存态论证为
  不可达）；stripVolatile 本地实现删除换库导出（第 13 条冻结面两处
  收缩随 commit 补记）。
- **测试基建**：Tags 直测建立（aria-pressed/三分支/Retry 行为断言）并
  摘 Home 侧栏 stub（「.schema 无法解析」的 stub 理由已陈旧——vitest
  管线早已注册同款插件）；mutations 直测建立（favorite 双层独立回滚、
  follow peek-merge，真实 createQueryCache 驱动）；vitest 移除
  server.deps.inline ['haze-ui']（1.11.1 起 dist 纯 ESM 零 css 说明符，
  净室探针已证）；AuthorLine/TagList/useRequireAuth 收敛三处作者行、
  两处 tag 列表与两处未登录写闸门。
- **CLAUDE.md 漂移修复**：Async data 段按 createQueryCache/bindQueryFn/
  createQueryHook/createDataLoader 现行 API 重写（旧文仍描述已删除的
  useQuery(fn,args,opts) 形态）；Loader↔query 段的 keyOf 位置改
  dataloaders.ts 并补 maxAge/persist；Key Libraries 表版本与能力全线
  同步（fetch-fun ^0.12.1/f0rm 1.1/haze 1.21/core 1.15.1/toolroom
  0.23）；DevTool 段既有重复残句顺手修复；Testing/Forms/Layout 段按
  本批实况更新。
- **已知遗留**（下批候选）：native-router TypedLink 仍不透传 prefetch
  （PreviewLink 停留无类型 PrefetchLink）；params 守卫侧类型自动推导
  （对齐 search 的 SearchRoutesOf）；devtools（路由树/匹配观察面）；
  ToolroomPersist agent 报告 react-toolroom main 上 5 条存量 lint 红
  （no-use-before-define 等，先于本批存在）与 haze-ui CI lint 存量红
  ——库仓需单独小修；GUARDED 前缀推导的动态段截断策略对「只挂动态
  路由的守卫」取静态前缀，目录嵌套守卫场景需回访。
- **验证**：typecheck + lint:ci（0 error，1 条既有 `_schema` 警告与
  上批同源）+ 298 单测（26 文件，净增 23 条）全绿；build + size
  120.47 KB（实测 123361 B / 32 文件，较上批 -1.07 KB——本地实现上移
  的净收缩，预算 126 KB 内、棘轮基线不动）+ e2e 29 条全绿。

## 23. 生态优化批：五包升级 + 四能力采纳集成（2026-09-05）

- **背景**：第 21/22 条两轮评审的收尾批——库侧按「能力补齐 → CI
  semantic-release 发版 → 模板 npm 显式版本集成（不 link）」流水线
  产出五个新版本，模板侧同批落地写操作重试边界、haze-css manifest
  机制化、Popover 收敛三笔（21e0672/7e8a8c5/5febc94，先行推送）与
  本批的四项能力采纳；文档站（painless-docs 本地仓，无 remote）
  同步 9 页 + platform 立场页（660df7f）。
- **版本**（npm 显式安装 + pnpm dedupe 单实例，peers check 退出 0，
  #18 豁免面未新增；gitHead 双核均验）：@native-router/core ^1.16.0
  （e445e8e：导航可观察性——`router.onDebug(l)→unsubscribe`（幂等）
  /`router.getDebugInfo()`，独立函数导出同构；DebugEvent 联合
  nav-start/commit/supersede/cancel/error，nav-start.to=请求目标、
  nav-commit.to=守卫重定向后落点，POP 命中 viewStack 快照的回放单发
  nav-commit（replay:true、无 nav-start）；blocker veto 不发事件、
  监听者异常被吞——纯观察零干预）、@native-router/react ^1.15.0
  （08b5ccb，peer 收紧 core ^1.16.0：TypedLink/TypedNavLink/
  TypedPrefetchLink 新增可选 `prefetch`，声明时内部按 PrefetchLink
  渲染、未声明走原路径逐字节不变；`useRouteDebug()` =
  useSyncExternalStore 版 onDebug+getDebugInfo，每个导航事件后重渲染）、
  react-toolroom ^0.24.0（0c62458：双入口导出 `hashArgs` =
  stableHash(stripVolatile(args))——本模板组合定义的上移，附
  no-structural-sharing recipe）、react-use-control ^1.6.0（bf1f84e：
  纯 DEV 报错增强（组件栈），产物字节等价，零行为面）、haze-ui
  ^1.22.0（a173e92：exports 子路径 `haze-ui/css-manifest.json`——
  {families: 157 导出→css 文件, noCss: 4} 全覆盖）。
- **TypedLink prefetch 采纳（消掉第 22 条已知遗留第一项）**：
  PreviewLink 从无类型 PrefetchLink 换 `TypedLink<AppPaths>`
  （props = `TypedLinkProps<AppPaths> & visible control`），Home 卡片
  调用点从运行时字符串拼接 `` `/article/${slug}` `` 改字面量
  `to='/article/:title' params={{title: slug}}`（路径联合 + 动态段
  params 编译期判别，运行时拼接从此进不了类型检查）；prefetch 缺省
  'viewport' 收进组件声明（本组件唯一调用语义，卡片滚入视口即预取），
  调用点可显式覆盖；hover/focus 预览（span + Preview/visible control）
  逻辑零变化，e2e 既有 PreviewLink 行为用例（hover 预览/viewport 预取
  /竞态点击）零改动全绿。测试补编译期反向用例（@ts-expect-error 钉
  运行时字符串必须编译期报错）。
- **路由可观察性面板（DevTool 第三面板）**：cache/request 之后的
  Routes/viewStack 视图——上半 getDebugInfo 快照（to/index/
  stackDepth/baseIndex/snapshots/resolving，在飞链或 idle），下半
  onDebug 导航事件时间线（最近 8 条，nav-start/commit（含 replay 标
  志——「back 为何零请求」的直接证据）/supersede/cancel/error 带
  duration，状态着色同 RequestLog）。实例通道：面板在 Router 树外
  （角标由根级 DevTool 渲染，useRouter() 无 context），树内 DEV 门控
  null 探针 `RouterHost`（views/index.tsx，StackWarmer 同款挂法）把
  实例登记进 `util/routerHost.ts`（无副作用模块，生产随 DEV 常量
  折叠被整体摇掉——dist 零命中已验）；订阅优先实例方法、独立函数
  onDebug(router,l) 兜任意 router 对象，面板关即退订（同既有两视图）。
  useRouteDebug() 本体依赖 Router context，树外面板按其实现同构接线
  （onDebug 通知 + getDebugInfo 快照），语义一致。DevTool.test 补 4
  条：快照字段渲染/事件追加（duration+replay）/关面板退订/idle 态。
- **hashArgs 上移采纳**：useQuery.ts 删本地组合定义
  （`stableHash(stripVolatile(args))`），改 `import {hashArgs} from
  'react-toolroom/async'`——签名相同，调用点零改动；既有 hash 归一
  契约用例（键序无关/嵌套 signal 剥离/undefined 键折叠/persist 载荷
  key 形态）零改动全绿即证等价。
- **haze-css manifest 路径激活复验**（机制 7e8a8a5 已先行，本批随
  1.22 安装自动切换映射源）：BUILD_DEMO=false 构建绿；tokens 家族
  （lightTheme/darkTheme/spacing/typography 四导出同归 tokens.css）
  幂等——全 dist 恰一份 tokens 内容、无重复注入无报错；InputCore→
  input/TextareaCore→textarea/TagInputCore→tag-input 等映射经 manifest
  正确落点（产物 css 内类名核对）——1.21 兜底时代未进 FAMILY 表的
  *Core 导出理论上会走 kebab 猜测注入不存在的 css，manifest 全覆盖
  后该缺陷面消除（fail-fast 四要素报错保留）。
- **CLAUDE.md 同步**：Routing 段 PreviewLink 描述（1.7.x→1.15.x 顺带
  修正）与 Home 卡片预取句；HTTP 段补 toggle 重试例外一句
  （createApiClient/toggleClient/postRetryable/delRetryable，主 client
  POST 永不重放仍成立）；Async data 段 hashArgs 出处（≥0.24 上移）；
  Key Libraries 表三行（native-router prefetch 透传 + onDebug/
  getDebugInfo、toolroom hashArgs、haze 1.22 manifest 唯一映射源）；
  DevTool 段补路由面板。README：Coming from TanStack 表 queryKey 行
  （hashArgs）与 Query Dev Tools 行（三面板）、PreviewLink 示例代码
  同步为 TypedLink 形态。
- **Preview 浮层定位修复（5febc94 的 e2e 欠账）**：Popover 收敛批把
  Preview 的 portal div 换裸实现时丢了旧本地 Popover 的 role=dialog
  属性，而该批未重跑 e2e——5 条用例（hover 预览/viewStack back/
  favorite 500/竞态点击/a11y 扫描）在 origin/main 上即红（本批全量
  e2e 首跑暴露，非 TypedLink 迁移引入——链接 href 与预取行为均正常，
  仅浮层定位选择器失靶）。修法：浮层加 data-testid=
  'preview-overlay' 测试钩子（裸 div 的诚实定位面——role=dialog 本
  是借来的弹层假语义，aria-hidden 在场时角色属性不进无障碍树，语义
  零变化），e2e 六处选择器与注释随之更新（testid 唯一，消掉与
  ToastContainer 宿主撞 [role=dialog] 才需要的 .first()）。
- **体积**：121.27 KB（实测 124176 B / 32 文件），较上批 123361 B
  （120.47 KB）+0.80 KB——增量几乎全部来自库运行时（core 1.16 导航
  链事件簿记 + react 1.15 TypedLink prefetch 分支），另含浮层
  data-testid 测试钩子 25 B；DevTool 路由面板与 RouterHost 探针经
  import.meta.env.DEV 折叠零生产字节（dist 逐文件 grep 无
  RouteView/getPublishedRouter 命中已验）；预算 126 KB 内（3.8%
  余量），棘轮不动，脚本头注释随批同步实测。
- **已知遗留更新**：第 22 条遗留清单——TypedLink prefetch 透传已消
  （本批）；toolroom 存量 lint 红已被 0.24 批顺手修复（a427196）；
  其余三项（params 守卫侧类型自动推导、GUARDED 动态段截断策略、
  haze-ui CI lint 存量红）仍开放。
- **验证**：typecheck + lint:ci（0 error，1 条既有 `_schema` 警告与
  上批同源）+ 308 单测（26 文件，净增 4 条）+ BUILD_DEMO=false build
  + size 121.27 KB + e2e 29 条全绿（首跑 5 红——5febc94 的浮层定位
  欠账，见上；修复后全量复跑通过）。
