import { defineConfig } from 'vitest/config';
import path from 'path';
import rollupPluginTypeAsJsonSchema from 'rollup-plugin-type-as-json-schema';

export default defineConfig({
  // '@/types/*.schema' 是 rollup-plugin-type-as-json-schema 的虚拟模块
  //（vite.config.mts 同款注册）：服务层（services/article.ts）现直接引用
  // 生成 schema 做 dev 响应校验，vitest 管线必须同样能解析它，测试才能
  // 覆盖「schema 前挂→失配报错」全链。
  plugins: [rollupPluginTypeAsJsonSchema()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // e2e/ 是 Playwright 用例（自带 dev server），vitest 不得误捞
    exclude: ['node_modules', 'dist', 'mock', 'typings', 'fixtures', 'e2e/**']
    // 历史注记——server.deps.inline: ['haze-ui'] 已删，无需再 inline：
    // 曾因 haze-ui 1.11 的 wyw-in-js 构建（dist 各模块副作用导入
    // *.wyw-in-js.css，Node 原生 ESM 解析不了 .css 说明符）与更早版本的
    // babel-runtime-jsx-plus（UMD 具名导出问题）需要 inline 后走 vite
    // 管线；1.11.1 起 dist 预打包为纯 ESM 且零 css 说明符（净室探针已
    // 证），Node 直连即可，dist 裸依赖也只剩 react 系/react-f0rm/
    // react-use-control。视图测试里 vi.mock('haze-ui') 的组件 stub 保留
    // 是视图隔离（不测库的纯展示渲染），与模块兼容无关。
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    }
  }
});
