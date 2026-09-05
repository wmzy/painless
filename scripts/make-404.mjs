#!/usr/bin/env node
// GitHub Pages SPA 回退：Pages 对未命中路径以 404 状态回退站内
// dist/404.html——把 index.html 复制过去即得「深链刷新由 SPA 接管」
// （浏览器拿到 404.html 照常 boot，HistoryRouter 按 location.pathname
// 落到目标路由；真 404 由应用内 notFound 视图呈现）。
//
// 前置（关键）：该构建必须用绝对 base（GitHub Pages 构建传
// VITE_BASE=/painless/）——相对 base 下深链回退页的 ./assets 会相对
// 深路径解析（/painless/article/assets/...），资源 404、SPA 无法 boot。
//
// 对其它托管目标无害：Netlify / Cloudflare Pages 由 public/_redirects
// 的 `/* → /index.html 200` 先行拦截，404.html 不会被服务；任何「未
// 命中回退 404.html」的静态服务器（如 S3 静态网站的 error document）
// 则直接受益。随 pnpm build 一并执行（package.json 的 build 链）。
import {copyFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
const from = join(dist, 'index.html');
const to = join(dist, '404.html');

if (!existsSync(from)) {
  console.error('未找到 dist/index.html——先构建再生成 404 回退：pnpm build');
  process.exit(1);
}
copyFileSync(from, to);
console.log('✓ dist/404.html（index.html 副本，静态托管 SPA 回退）');
