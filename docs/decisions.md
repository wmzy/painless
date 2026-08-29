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

## 3. native-router beforeLoad context 注入：待设计

- **背景**：路由守卫需要当前用户；native-router 的 beforeLoad 没有官方的
  context 注入点，painless 目前用模块级单例 `getCurrentUser()` 绕过。
  痛点：多 router 实例（微前端/同页多 app）共享单例会串数据；测试里每个用例
  都要重置模块级状态，隔离性差。
- **决定**：**待设计思考**。方向是在 router 创建时传入一个 context 工厂
  （每实例一份，loader ctx 透传），但注入边界（与 viewStack/loader ctx 的
  关系、类型推导）未想清楚前不动。库侧改造，需 native-router 发版配合。

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

## 6. View Transition × fetch-fun OpenAPI 嫁接演示：待方案设计

- **背景**：两个候选方向——native-router 的视图切换接 View Transition API
  （浏览器侧平滑过渡），fetch-fun 接 OpenAPI schema 生成类型化客户端。
  「嫁接演示」指在 painless 里用 OpenAPI schema（经
  rollup-plugin-type-as-json-schema 已有先例）驱动 fetch-fun 管道，同时
  路由切换走 View Transition，展示组合效果。
- **决定**：**待实现方案设计**。两件事都还没到写代码阶段；先出设计稿
  （VT 的降级路径、OpenAPI 文档到 fetch-fun 管道的映射边界）再排期。
