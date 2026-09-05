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

export default defineConfig({
  base: './',
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
