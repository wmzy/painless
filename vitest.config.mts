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
        inline: ['babel-runtime-jsx-plus', 'haze-ui']
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // haze-ui link workaround：本地 haze-ui 的 dist 裸导入 react，link
      // 后会解析到库目录自带的嵌套副本（双 React，hooks 崩）。重定向到
      // painless 主项目的唯一副本。切回 npm 版后删除。
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
      'react-f0rm': path.resolve(import.meta.dirname, './node_modules/react-f0rm')
    }
  }
});
