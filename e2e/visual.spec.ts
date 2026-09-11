import {expect, test} from '@playwright/test';

import {article1, mockApi} from './helpers';

// 视觉回归（本地门禁，VISUAL=1 才挂载本项目，CI 默认不跑——理由见下）。
// 快照是**平台绑定**的：模板刻意零 webfont（decisions #34），排版走系统
// 衬线栈，同一页在不同 OS/渲染后端的字体度量与亚像素抗锯齿都不同，跨机
// 比对必然红——所以快照只在本机有意义；换机或 CI 环境用
// `pnpm test:visual -- --update-snapshots` 重生基线。
// 稳定性口径：context 级 reducedMotion:'reduce'（decisions #14 的 CSS
// 兜底面）灭掉 View Transitions/过渡动画，叠加 toHaveScreenshot 的
// animations:'disabled'（再冻结 CSS 动画/过渡并截掉 caret）；每张都在
// 等到真实内容渲染后再拍（骨架/Loading 态不进快照）；日期渲染来自
// fixture 的固定时间戳，无当前时间渗入。viewport 内客区快照（非
// fullPage）——毒长的 Home/Article 全页截图对字体度量差更敏感，像素
// 面积越大跨次比对噪声越大。

test('Home（浅色，未登录）', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  // feed 卡片与侧栏 tags 都渲染出来再拍（两条独立请求，各自可能
  // 晚于首帧）
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  await expect(page.getByRole('button', {name: 'e2e'})).toBeVisible();

  await expect(page).toHaveScreenshot({animations: 'disabled'});
});

// 暗色预设：应用的主题初值来自 matchMedia('(prefers-color-scheme:
// dark)')（util/theme.tsx 的 useAppTheme 懒初始化，未持久化、手动干预
// 前持续跟随系统档）——Playwright 的 colorScheme:'dark' 在任何应用 JS
// 之前让该 media query 命中，首渲染即暗色根。不走点击 ThemeToggle 的
// 路：toggle 的翻转过渡帧会进快照，且写 control 会标记 manual 档（对
// 单张快照无影响，但语义上是「用户干预」而非「系统档」）。test.use
// 必须圈在 describe 里：模块级调用会作用于整个文件，把浅色用例也染暗。
test.describe('dark', () => {
  test.use({colorScheme: 'dark'});

  test('Home（暗色，未登录）', async ({page}) => {
    await mockApi(page, {published: false});

    await page.goto('/');
    await expect(
      page.getByRole('heading', {name: article1.title})
    ).toBeVisible();
    await expect(page.getByRole('button', {name: 'e2e'})).toBeVisible();

    await expect(page).toHaveScreenshot({animations: 'disabled'});
  });
});

test('Article 详情页（浅色）', async ({page}) => {
  await mockApi(page, {published: false});

  // 直访（不走 in-app 导航）：快照只关注页面终态，VT 过渡帧零参与
  await page.goto(`/article/${article1.slug}`);
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  // 评论区渲染出来再拍（含两条 fixture 评论的作者行/头像）
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();

  await expect(page).toHaveScreenshot({animations: 'disabled'});
});

test('Login 页（浅色）', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/login');
  await expect(page.getByRole('button', {name: 'Login'})).toBeVisible();

  await expect(page).toHaveScreenshot({animations: 'disabled'});
});

// 直访未匹配路径：Router 的 notFound prop（NotFoundError → 页面级 404）
test('NotFound（浅色）', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/nope');
  await expect(
    page.getByRole('heading', {name: 'Page not found'})
  ).toBeVisible();

  await expect(page).toHaveScreenshot({animations: 'disabled'});
});
