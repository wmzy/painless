/* eslint-disable import/no-extraneous-dependencies */

import * as path from 'path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import wyw from '@wyw-in-js/vite';
import rollupPluginTypeAsJsonSchema from 'rollup-plugin-type-as-json-schema';

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: `${path.join(import.meta.dirname, 'src/$1')}`
      },
      // haze-ui link workaround（dev/e2e 用；切回 npm 版后删除）：本地
      // haze-ui 的 dist 裸导入 react/react-dom，link 后解析到库目录自带
      // 的嵌套副本（双 React）。重定向到 painless 主项目的唯一副本。
      {find: 'react', replacement: path.join(import.meta.dirname, 'node_modules/react')},
      {
        find: 'react-dom',
        replacement: path.join(import.meta.dirname, 'node_modules/react-dom')
      },
      // haze-ui 本地 link 的临时 workaround（同上，切回 npm 版后删除）：
      // 本地 haze-ui 的 dist 依赖 react-use-control 与 react-f0rm，link
      // 后解析到库目录自带的副本（各带独立 react 闭包，双 React）。与
      // 主项目同版本，统一重定向到唯一副本（dist 仅裸导入、无子路径，
      // 包目录字符串别名安全）。
      {
        find: 'react-use-control',
        replacement: path.join(
          import.meta.dirname,
          'node_modules/react-use-control'
        )
      },
      {
        find: 'react-f0rm',
        replacement: path.join(import.meta.dirname, 'node_modules/react-f0rm')
      }
    ]
  },
  server: {
    open: true
  },
  plugins: [
    react({
      exclude: ['node_modules/**']
    }),
    rollupPluginTypeAsJsonSchema(),
    wyw({
      sourceMap: true,
      exclude: ['node_modules/**']
    })
  ],
  optimizeDeps: {
    include: ['babel-runtime-jsx-plus']
  }
});
