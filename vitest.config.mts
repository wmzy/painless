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
    // vmThreads：jsdom 环境按文件重建的启动开销占全量 ~38%——vmThreads
    // 把文件级隔离从「每文件独立 worker」换成同线程内的 node:vm 上下文
    // （模块注册表隔离语义等价，mock/隔离行为不变）。曾因
    // react-use-control 1.6.0「ESM 语法却按 CJS 发布」被迫回退 forks
    // （vm CJS 求值器无模块语法探测，见 decisions.md #37）；上游 1.6.1
    // 加 "type": "module" 后根因消除，已回迁。
    pool: 'vmThreads',
    include: ['src/**/*.test.{ts,tsx}'],
    // e2e/ 是 Playwright 用例（自带 dev server），vitest 不得误捞
    exclude: ['node_modules', 'dist', 'mock', 'typings', 'fixtures', 'e2e/**']
    // 历史注记——server.deps.inline: ['haze-ui'] 已删，无需再 inline：
    // 曾因 haze-ui 1.11 的 wyw-in-js 构建（dist 各模块副作用导入
    // *.wyw-in-js.css，Node 原生 ESM 解析不了 .css 说明符）需要 inline
    // 后走 vite 管线；1.11.1 起 dist 预打包为纯 ESM 且零 css 说明符
    //（净室探针已证），Node 直连即可，dist 裸依赖也只剩 react 系/
    // react-f0rm/react-use-control。视图测试里 vi.mock('haze-ui') 的组件
    // stub 保留是视图隔离（不测库的纯展示渲染），与模块兼容无关。
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    }
  }
});
