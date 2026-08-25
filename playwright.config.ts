import {defineConfig, devices} from '@playwright/test';

// 浏览器 E2E 冒烟：与 vitest（mock service 层）互补，这里用 page.route
// 在网络层拦截 mock，跑真实浏览器里的完整 SPA 链路。
// 端口选 4273 而非常见的 4173：本机 4173 常年被其它项目的 vite preview
// 占用，strictPort 下会直接起不来。
export default defineConfig({
  testDir: './e2e',
  // 冒烟只有两条用例且共享同一个 dev server，单 worker 串行足够，
  // 失败时输出也更可读
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  // vite.config.mts 里 server.open:true 会拉起系统浏览器；CLI 的
  // --no-open 在 resolveConfig 阶段覆盖为 false（已实测验证），CI 与
  // 本地跑 e2e 都不会弹浏览器窗口
  webServer: {
    command: 'pnpm exec vite --port 4273 --strictPort --no-open',
    url: 'http://localhost:4273',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  use: {
    baseURL: 'http://localhost:4273',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']}
    }
  ]
});
