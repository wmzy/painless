import {expect, test} from '@playwright/test';

import {article1, login, mockApi, user} from './helpers';

// prod 项目（playwright.config.ts：testMatch 圈定本文件，baseURL 指向
// 4274 的 vite preview——pnpm build 真实产物）。要守的断层是「dev 绿、
// prod 死」：DEV 折叠、摇树、产物化转换只在构建产物里显形，dev server
// 上任何用例都探不到（先例：docs/decisions.md #26 部署断裂）。复用
// helpers 的网络层 mock——被测的是产物代码路径，不是后端。

test('首页 → 详情：fixture 文章渲染正文与评论（产物渲染链路）', async ({
  page
}) => {
  await mockApi(page, {published: false});

  // 首页列表经懒加载视图 + loader 链路渲染 fixture 卡片（摇树/分包
  // 错误会在这里先显形：chunk 404 → 边界兜底，列表空）
  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();

  // 点进详情：PreviewLink 的 SPA 导航 + articleLoader + CommentList
  // 三条链路都在产物形态下工作
  await page.getByRole('link', {name: article1.title}).click();
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));
  await expect(page.getByText(article1.body)).toBeVisible();
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();
});

test('UI 登录后导航栏出现用户名（auth 落地链路在产物上工作）', async ({
  page
}) => {
  await mockApi(page, {published: false});

  // login() 走完整 UI 表单并断言导航栏用户名；这里再补 token 落
  // localStorage——产物里 auth 服务的持久化路径（JSON 解析 + 写入）
  // 与导航栏订阅链路一起被覆盖
  await page.goto('/');
  await login(page);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('painless.user')))
    .toContain(user.token);
});

test('DevTool 角标不存在（import.meta.env.DEV 折叠的唯一 UI 证据）', async ({
  page
}) => {
  await mockApi(page, {published: false});

  // DevTool 整棵子树包在 import.meta.env.DEV 下（src/index.tsx），产物
  // 里应被整体折叠：DOM 里不出现 DEV 角标（Popover 触发器，role=button、
  // 文本 'DEV'，见 src/components/DevTool.tsx）。这是 DEV 折叠从页面
  // 外可观察的唯一证据——此前每批都要手工 grep dist 确认，此处自动化
  // 替代；若角标出现，说明 dev-only 代码漏进了产物（体积回归 + dev
  // 工具面板暴露给最终用户）。
  await page.goto('/');
  await expect(
    page.getByRole('button', {name: 'DEV'})
  ).toHaveCount(0);
});
