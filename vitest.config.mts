import { defineConfig } from 'vitest/config';
import path from 'path';
import rollupPluginTypeAsJsonSchema from 'rollup-plugin-type-as-json-schema';

export default defineConfig({
  // '@/types/*.schema' 是 rollup-plugin-type-as-json-schema 的虚拟模块
  //（vite.config.mts 同款注册）：服务层（services/article.ts）现直接引用
  // 生成 schema 做 dev 响应校验，vitest 管线必须同样能解析它，测试才能
  // 覆盖「schema 前挂→失配报错」全链。
  plugins: [rollupPluginTypeAsJsonSchema()],
  test: {    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // e2e/ 是 Playwright 用例（自带 dev server），vitest 不得误捞
    exclude: ['node_modules', 'dist', 'mock', 'typings', 'fixtures', 'e2e/**'],
    // haze-ui 1.11（wyw-in-js 构建）：dist 各模块副作用导入 *.wyw-in-js.css，
    // Node 原生 ESM 解析不了 .css 说明符——inline 后走 vite 管道即可正常
    // 渲染。旧版 inline 的 babel-runtime-jsx-plus（UMD 具名导出问题）随
    // 1.11 预打包升级消失，dist 裸依赖只剩 react 系/react-f0rm/
    // react-use-control，无需再 inline。
    server: {
      deps: {
        inline: ['haze-ui']
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    }
  }
});
