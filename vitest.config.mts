import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // e2e/ 是 Playwright 用例（自带 dev server），vitest 不得误捞
    exclude: ['node_modules', 'dist', 'mock', 'typings', 'fixtures', 'e2e/**'],
    passWithNoTests: true,
    // haze-ui（type:module，原生导入会被外部化）内部具名导入 babel-runtime-jsx-plus
    // （仅 UMD main 的 CJS 包），Node 原生 ESM 链接解析不出具名导出；
    // 两者 inline 后经 vite 互操作转换即可在测试中正常渲染 haze-ui 组件。
    server: {
      deps: {
        // 末两项是 @native-router 本地 link 的临时 workaround（库发版
        // 切回 npm 后随本文件其余 link workaround 一并删除）：link 进来
        // 的包默认被外部化（原生 ESM 加载，不走 vite 解析），其内部的
        // react / @native-router/core 导入会解析到库自带副本（双 React
        // + 双 core），inline 后经 vite 管线解析才吃得到下面的 alias。
        inline: [
          'babel-runtime-jsx-plus',
          'haze-ui',
          '@native-router/core',
          '@native-router/react'
        ]
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // @native-router 本地 link 的临时 workaround：库目录自带 node_modules
      // （含 react 与旧版 @native-router/core@1.5.0——没有 setBlocker），
      // 不重定向会加载出第二份 React 实例与两份 core。全部指向 painless
      // 主项目的唯一副本；core 别名须指到 dist 入口文件（目录别名会让
      // 子路径导入绕过 exports map 而 404）。切回 npm 版后删除。
      react: path.resolve(import.meta.dirname, './node_modules/react'),
      'react-dom': path.resolve(import.meta.dirname, './node_modules/react-dom'),
      // haze-ui 本地 link 的临时 workaround：库目录自带 react-use-control
      // 副本（与主项目同版本 1.3.2）。haze-ui 被 inline 后其内部对它的
      // 导入若解析到库副本，两副本各自闭包一份 dispatcher，跨副本调用
      // hooks 即「Invalid hook call」。统一指向主项目唯一副本。切回
      // npm 版后删除。
      'react-use-control': path.resolve(
        import.meta.dirname,
        './node_modules/react-use-control'
      ),
      // 同上（haze-ui link workaround）：本地 haze-ui 的 FormItem/
      // useFormControl 依赖 react-f0rm（form 子入口），库副本自带独立
      // react 闭包，不重定向即双 f0rm + 双 React。与主项目同版本 0.6.0，
      // 指向唯一副本（dist 仅裸导入、无子路径，包目录别名安全）。切回
      // npm 版后删除。
      'react-f0rm': path.resolve(import.meta.dirname, './node_modules/react-f0rm'),
      '@native-router/core': path.resolve(
        import.meta.dirname,
        './node_modules/@native-router/core/dist/index.mjs'
      )
    }
  }
});
