import {defineConfig, devices} from '@playwright/test';

// 浏览器 E2E 冒烟：与 vitest（mock service 层）互补，这里用 page.route
// 在网络层拦截 mock，跑真实浏览器里的完整 SPA 链路。
// 端口选 4273 而非常见的 4173：本机 4173 常年被其它项目的 vite preview
// 占用，strictPort 下会直接起不来；prod 的 preview 用 4274 错开同理。
//
// 两个 server（dev + prod preview）都是全局 webServer：Playwright 的
// webServer 无项目级作用域，任一项目跑起来都会把两个都拉起——prod 侧
// 含 pnpm build（首次较慢，timeout 放宽到 180s），visual-only 的本地
// 门禁也会付出这次构建，换来的是配置保持单一数组、无按项目开关的
// 脆弱分支。
export default defineConfig({
  testDir: './e2e',
  // 冒烟用例共享同一个 dev server，单 worker 串行足够，
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
  webServer: [
    {
      command: 'pnpm exec vite --port 4273 --strictPort --no-open',
      url: 'http://localhost:4273',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      // prod 项目走真实构建产物（vite preview）：守住 DEV 折叠/摇树类
      // 「dev 绿、prod 死」的部署断裂（先例：docs/decisions.md #26 部署
      // 断裂——问题只在产物里显形，dev server 上全程绿）。build 需要
      // 时间，timeout 放宽；端口 4274 与 dev 的 4273 错开。
      command: 'pnpm build && pnpm exec vite preview --port 4274 --strictPort',
      url: 'http://localhost:4274',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000
    }
  ],
  use: {
    baseURL: 'http://localhost:4273',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
      // prod/visual 两个 spec 各有专属项目（testMatch 精确圈定）；
      // 默认 testMatch 是 **/*.spec.*，不排除的话它们会被本 dev 项目
      // 一起收集——prod spec 打 4273 会全错，visual spec 缺快照必红
      testIgnore: ['**/prod.spec.ts', '**/visual.spec.ts']
    },
    {
      // 真实产物冒烟（见上方 webServer 注释）：三条用例见
      // e2e/prod.spec.ts——渲染链路 / UI 登录 / DevTool 角标缺席
      name: 'prod',
      testMatch: '**/prod.spec.ts',
      use: {...devices['Desktop Chrome'], baseURL: 'http://localhost:4274'}
    },
    // 视觉回归项目：本地门禁（VISUAL=1 才挂载，CI 默认不跑——快照是
    // 平台绑定的，零 webfont 系统衬线栈对字体度量差敏感，跨机/CI 环境
    // 的差异会让快照比对失真，见 e2e/visual.spec.ts 头注释）。
    // reducedMotion:'reduce' 灭掉 View Transitions/过渡动画（decisions
    // #14 的 CSS 兑底面），配合 toHaveScreenshot 的 animations:'disabled'
    // 让像素比对不受动画帧影响。
    ...(process.env.VISUAL === '1'
      ? [
          {
            name: 'visual',
            testMatch: '**/visual.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              viewport: {width: 1280, height: 800},
              baseURL: 'http://localhost:4273',
              contextOptions: {reducedMotion: 'reduce' as const}
            }
          }
        ]
      : [])
  ]
});
