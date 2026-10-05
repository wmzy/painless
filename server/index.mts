import type {App} from 's200';

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {createApp, serveStatic, use, usePlugin} from 's200';
import {createFileReader, serve} from 's200/node';

// TS（bundler 解析）不给无扩展名解析 .mts，而 Node ESM 又只接受显式
// .mts 扩展名——两文件间的静态导入两头堵死（tsconfig 锁定不能开
// allowImportingTsExtensions）。动态 import + typeof import 钉住类型，
// 是同时通过 tsc 与 node 直跑的最小写法。
type ApiModule = typeof import('./api.mts');

const {apiRoutes} = (await import(new URL('./api.mts', import.meta.url).href)) as ApiModule;

// public 静态永远先注册：dist 有无两种状态下 /ok.txt 都由它命中，冒烟
// 结论确定。dist 构建在场时再挂一份带 spa 回退的静态服务，让深链刷新
// 由前端接管。
export function createServerApp(): App {
  const app = createApp();

  use(app, async (ctx, next) => {
    await next();
    if (ctx.res !== undefined) ctx.res.headers.set('x-served-by', 's200');
    console.log(`${ctx.req.method} ${new URL(ctx.req.url).pathname} ${ctx.res?.status ?? 0}`);
  });

  usePlugin(app, apiRoutes);

  const publicDir = join(import.meta.dirname, 'public');
  use(app, serveStatic({read: createFileReader(publicDir)}));

  const distDir = join(import.meta.dirname, '..', 'dist');
  if (existsSync(join(distDir, 'index.html'))) {
    use(app, serveStatic({read: createFileReader(distDir), spa: true}));
  }

  return app;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 4300);
  const server = await serve(createServerApp(), {port});
  console.log(`s200 server listening on http://127.0.0.1:${server.port}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) void main();
