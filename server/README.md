# s200 backend starter kit

[`s200`](https://github.com/wmzy/s200)（data + functions server framework，Web Standard，零依赖）的后端起步层：本目录 + 根目录三个脚本即构成「painless 前端模板 + s200 后端」的全栈模板（方案 B）。前端仍是纯静态 SPA，后端是独立进程——`AGENTS.md` 的 *frontend is not the backend* 原则不变。

## Prerequisite

s200 从 npm 安装（`package.json` devDependencies `"s200": "^0.1.0"`；fresh 发包，故列入 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`），解析的是发布到 registry 的 `dist/`——框架源码改动需上游发版后升级依赖版本，`pnpm install` 跟上。本地 `../s200` 是框架源码仓，与本仓库的运行无关。

Node ≥ 22.18 直接以内置 type stripping 运行 `.mts`，无需编译步骤。

## Scripts

|Script|Command|作用|
|---|---|---|
|`pnpm server`|`node --watch server/index.mts`|独立后端（prod-like）：API + `server/public` 静态，有 `dist` 时再挂 dist 静态带 SPA 回退（`PORT` 环境变量，默认 4300，改动自动重启）|
|`pnpm server:smoke`|`node server/smoke.mjs`|冒烟：`PORT=0` 拉起独立服务，断言全部 API + 静态资产|

## 开发环境同端口

`pnpm start`（vite）通过 `vite.config.mts` 的 `s200ApiPlugin` 把
`server/api.mts` 的 API 应用（`createApiApp()`）挂进 dev server 的
`/api` 前缀——`configureServer` 主体注册的中间件早于 vite 内置管线
（transform/static/html fallback），`/api` 请求直达 s200 分发，其余
路径照常走 HMR/静态/SPA。开发时浏览器只面对 vite 一个端口。

API 模块随 vite 配置打包——**改 API 路由后重启 dev server 生效**
（与独立进程 `--watch` 热重启的取舍见 `docs/decisions.md` #42）。
生产无此挂载：静态产物由本目录的独立服务（或任意静态托管 + s200
后端）提供。

## Routes

|Method / Path|行为|
|---|---|
|`GET /api/health`|`{"status":"ok"}`|
|`GET /api/hello?name=…`|`{"hello": name}`，`name` 缺省为 `painless`|
|`POST /api/echo`|`readJson` 透传请求体|
|`GET /ok.txt`（及其他 `server/public/*`）|静态资产（见下）|

## 静态服务的两种状态

`server/index.mts` 的组合顺序（`server/public` 静态先注册，`dist` 静态后注册）保证行为确定性：

- **无前端构建**（`dist/index.html` 不存在）：只服务 `server/public`——冒烟无需先 `pnpm build` 即可确定性通过。
- **有前端构建**：`server/public` 静态仍先命中（`/ok.txt` 等公共资产），随后 `dist` 静态带 `spa: true` 挂载——深链刷新（text/html 导航未命中）回退 `dist/index.html`，SPA 路由接管。

冒烟脚本因此两种状态下断言完全一致。

## Bun alternative

s200 核心运行时无关（只触 Web Standard `Request`/`Response`）。Bun 实现 `node:http` 兼容层，因此本文件原样可用：

```sh
bun --hot server/index.mts   # 复用同一 createServerApp，--hot 热重载
```

另有 `s200/bun` 适配器（`Bun.serve` 原生入口，`serve`/`createFileReader` 同形），需要时把 `s200/node` 的导入换成 `s200/bun` 即可。
