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
      // @native-router 本地 link 的临时 workaround（dev/e2e 用；切回 npm
      // 版后删除）：link 包的真实路径不在 node_modules 下，vite 按源码处
      // 理并从库目录解析依赖——react 会解析到库自带的第二份副本（双
      // React），@native-router/core 会解析到库 node_modules 里的旧版
      // 1.5.0（无 setBlocker）。全部重定向到 painless 主项目的唯一副本。
      // 注意指向 dist 入口文件而非包目录：目录别名会把子路径导入
      // （core/util）拼成「包目录/util」的裸路径，绕过包的 exports map
      // 解析（util 物理上不在包根）而 500；正则精确匹配裸导入与子路径
      // 两条导入各指向真实入口。
      {find: 'react', replacement: path.join(import.meta.dirname, 'node_modules/react')},
      {
        find: 'react-dom',
        replacement: path.join(import.meta.dirname, 'node_modules/react-dom')
      },
      {
        find: /^@native-router\/core\/util$/,
        replacement: path.join(
          import.meta.dirname,
          'node_modules/@native-router/core/dist/util.mjs'
        )
      },
      {
        find: /^@native-router\/core$/,
        replacement: path.join(
          import.meta.dirname,
          'node_modules/@native-router/core/dist/index.mjs'
        )
      },
      // use-sync-external-store/shim：native-router NavLink 的订阅依赖
      // （@native-router 本地 link 的临时 workaround 配套项，切回 npm 版
      // 后随其余 workaround 一并删除）。包只存在于 link 库的嵌套
      // node_modules（painless 根解析不到，optimizeDeps.include 会报
      // Failed to resolve），alias 到真实 shim 入口文件最稳：作为普通
      // 源文件进模块图，不走预打包，也就不会在首个页面渲染时被「中途
      // 发现」触发 vite 重优化 + 整页 reload（那会与已加载模块图拼出
      // 双实例，useRouter 崩 Router 上下文）。
      {
        find: /^use-sync-external-store\/shim$/,
        replacement: path.join(
          import.meta.dirname,
          '../native-router/react/node_modules/use-sync-external-store/shim/index.js'
        )
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
