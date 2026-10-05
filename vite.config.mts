/* eslint-disable import/no-extraneous-dependencies */

import * as path from 'path';
import {Readable} from 'node:stream';
import {finished} from 'node:stream/promises';
import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import wyw from '@wyw-in-js/vite';
import rollupPluginTypeAsJsonSchema from 'rollup-plugin-type-as-json-schema';
import type {App} from 's200';
import {handle} from 's200';

import hazeCss from 'vite-plugin-haze-ui';

// base 环境驱动：默认 './'（相对——可移植静态部署形态：资源相对文档
// 解析，任何托管路径都能加载）。GitHub Pages 部署（pages.yml）以
// VITE_BASE=/painless/ 构建：绝对 base 让资源按 /painless/ 前缀寻址，
// 深链刷新经 404.html 回退（scripts/make-404.mjs 复制 index.html）时
// 资源仍从根前缀加载——相对 base 下深链的 ./assets 会解析到深路径目录，
// 回退即失败。路由侧 baseUrl 同源（views/index.tsx 读 BASE_URL 推导）。
const base = process.env.VITE_BASE ?? './';

// 开发环境前后端同端口：s200 API 应用挂进 vite dev server
// （/api 前缀）。configureServer 主体注册的中间件早于 vite
// 内置管线（transform/static/html fallback——见 vite 源码
// createServer 的中间件装配序），/api 请求不进前端管线、
// 直达 s200 分发；其余路径照常走 HMR/静态/SPA 回退。
// 适配器语义与 s200/node 的 dispatch 一致：rawHeaders 成对
// 保留重复头，非 GET/HEAD 请求体走 web 流（duplex:
// 'half'），响应体流式回写（缓冲会憋死 SSE 类端点）。
// api.mts 随 vite 配置打包（esbuild）——改 API 路由后重启
// dev server 生效，与独立进程 --watch 的取舍见 decisions.md
// #42。生产无此挂载：静态产物由 server/index.mts（或任意
// 静态托管 + s200 后端）服务。
type ApiModule = typeof import('./server/api.mts');

function s200ApiPlugin(): Plugin {
  // .mts 跨文件导入走动态 import + typeof import 钉类型
  // （server/index.mts 同款约束：tsconfig 的 bundler 解析不做
  // 值侧显式扩展名导入，Node ESM 又只认显式扩展名）。Vite
  // 打包配置时把 import.meta.url 重写为原配置文件 URL
  // （bundleConfigFile 的 define 注入），相对解析不受配置束
  // 临时位置影响。
  let appPromise: Promise<ApiModule> | undefined;
  const apiApp = (): Promise<App> => {
    appPromise ??= import(
      new URL('./server/api.mts', import.meta.url).href
    ) as Promise<ApiModule>;
    return appPromise.then(({createApiApp}) => createApiApp());
  };
  return {
    name: 's200-api',
    // configureServer 是 async 钩子（vite await 之）——先解析
    // API 应用再挂中间件，启动期即暴露导入错误。
    async configureServer(server) {
      const app = await apiApp();
      server.middlewares.use('/api', async (req, res, _next) => {
        try {
          const fullPath = '/api' + (req.url ?? '');
          const url = new URL(
            fullPath,
            `http://${req.headers.host ?? 'localhost'}`
          );
          const headerPairs: [string, string][] = [];
          const raw = req.rawHeaders;
          for (let i = 0; i + 1 < raw.length; i += 2) {
            const name = raw[i];
            const value = raw[i + 1];
            if (name === undefined || value === undefined || name.startsWith(':')) {
              continue;
            }
            headerPairs.push([name, value]);
          }
          const init: RequestInit & {duplex?: 'half'} = {
            method: req.method ?? 'GET',
            headers: headerPairs,
            redirect: 'manual'
          };
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            init.body = Readable.toWeb(
              req as unknown as import('node:stream').Readable
            ) as unknown as ReadableStream<Uint8Array>;
            init.duplex = 'half';
          }
          const response = await handle(app, new Request(url, init));
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
          });
          if (response.body) {
            const nodeStream = Readable.fromWeb(
              response.body as unknown as import('node:stream/web').ReadableStream
            );
            nodeStream.pipe(res);
            await finished(nodeStream);
          } else {
            res.end();
          }
        } catch (error) {
          console.error('API Error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({error: 'Internal Server Error'}));
        }
      });
    }
  };
}

export default defineConfig({
  base,
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: `${path.join(import.meta.dirname, 'src/$1')}`
      }
    ]
  },
  server: {
    open: true
  },
  plugins: [
    // 按需 CSS 收集：扫描 haze-ui 具名导入注入对应 css 副作用导入。
    // 插件不设 enforce（normal 顺序），运行在 vite 内置 TS/JSX 转换之后，
    // 拿到纯 ESM JS；数组位置不承重，放最前仅为可读性（机制见
    // vite-plugin-haze-ui README）。
    hazeCss(),
    react({
      exclude: ['node_modules/**']
    }),
    rollupPluginTypeAsJsonSchema(),
    wyw({
      sourceMap: true,
      exclude: ['node_modules/**']
    }),
    s200ApiPlugin()
  ]
});
