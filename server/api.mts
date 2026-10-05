import type {App} from 's200';

import {createApp, get, json, post, readJson, usePlugin} from 's200';

export function apiRoutes(app: App): void {
  get(app, '/api/health', (ctx) => json(ctx, {status: 'ok'}));
  get(app, '/api/hello', (ctx) => json(ctx, {hello: ctx.query.get('name') ?? 'painless'}));
  post(app, '/api/echo', async (ctx) => json(ctx, await readJson(ctx)));
}

// 仅 API 的应用——开发环境由 vite dev server 挂载（/api 前缀，
// vite.config.mts 的 s200ApiPlugin，decisions.md #42）；独立
// 服务（server/index.mts）在此基础上再加日志中间件与静态面。
export function createApiApp(): App {
  const app = createApp();
  usePlugin(app, apiRoutes);
  return app;
}
