/* eslint-disable import/no-extraneous-dependencies */

import * as path from 'path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import wyw from '@wyw-in-js/vite';
import rollupPluginTypeAsJsonSchema from 'rollup-plugin-type-as-json-schema';

// 显式 .mts 扩展名（需 tsconfig allowImportingTsExtensions，本项目
// noEmit/emitDeclarationOnly 场景下合法）：对 vite 配置打包器是明确的
// ESM 模块，避免无扩展名/.ts 形态的 CJS 探测警告。
import hazeCss from './vite-plugin-haze-css.mts';

// base 环境驱动：默认 './'（相对——可移植静态部署形态：资源相对文档
// 解析，任何托管路径都能加载）。GitHub Pages 部署（pages.yml）以
// VITE_BASE=/painless/ 构建：绝对 base 让资源按 /painless/ 前缀寻址，
// 深链刷新经 404.html 回退（scripts/make-404.mjs 复制 index.html）时
// 资源仍从根前缀加载——相对 base 下深链的 ./assets 会解析到深路径目录，
// 回退即失败。路由侧 baseUrl 同源（views/index.tsx 读 BASE_URL 推导）。
const base = process.env.VITE_BASE ?? './';

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
    // 按需 CSS 收集：扫描 haze-ui 具名导入注入对应 css 副作用导入，须先
    // 于 react/wyw 转换看到原始源码。机制与家族映射见插件文件头注释。
    hazeCss(),
    react({
      exclude: ['node_modules/**']
    }),
    rollupPluginTypeAsJsonSchema(),
    wyw({
      sourceMap: true,
      exclude: ['node_modules/**']
    })
  ]
});
