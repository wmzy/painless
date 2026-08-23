import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'mock', 'typings', 'fixtures'],
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
      '@': path.resolve(import.meta.dirname, './src')
    }
  }
});
