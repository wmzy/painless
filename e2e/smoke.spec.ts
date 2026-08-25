import {expect, test, type Page, type Route} from '@playwright/test';

// E2E 冒烟 fixtures：静态 JSON（不用 faker——dev 模式下 faker 只在请求
// 失败/空响应时兜底，这里 mock 全部命中，随机数只会让断言不稳定）。
// 形状对齐 src/types/index.ts 的 Article/User 契约。

const AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%2306f"/></svg>';

const PASSWORD = 'e2e-password';

const user = {
  email: 'e2e@painless.dev',
  username: 'e2e-tester',
  bio: 'smoke tester',
  image: AVATAR,
  token: 'e2e-jwt-token'
};

// 作者名与登录用户名错开：getByText(username) 才能唯一定位导航栏的
// 用户名 span，不被卡片作者行误伤
const author = {
  username: 'alice',
  bio: '',
  image: AVATAR,
  following: false
};

const article1 = {
  slug: 'e2e-first-article',
  title: 'First E2E Article',
  description: 'Smoke test fixture article one',
  body: 'Paragraphs of the first fixture article.',
  tagList: ['e2e', 'smoke'],
  author,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  favorited: false,
  favoritesCount: 3
};

const article2 = {
  slug: 'e2e-second-article',
  title: 'Second E2E Article',
  description: 'Smoke test fixture article two',
  body: 'Paragraphs of the second fixture article.',
  tagList: ['smoke'],
  author: {...author, username: 'bob'},
  createdAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-01-04T00:00:00.000Z',
  favorited: false,
  favoritesCount: 0
};

const newArticle = {
  slug: 'e2e-published-article',
  title: 'Published From E2E',
  description: 'Created by the editor smoke test',
  body: 'Body submitted from the editor form.',
  tagList: [],
  author,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
  favorited: false,
  favoritesCount: 0
};

type Article = typeof article1;

// 路由状态：POST /articles 发布后，后续 GET /articles 的 feed 才包含
// 新文章——模拟「服务端已写入」的可观测行为
type ApiState = {published: boolean};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });

// 网络层 mock：app 的 API base 是 https://api.realworld.io/api/，
// page.route 按 URL 分发（glob 对 query string 的匹配不可靠，统一
// 解析 pathname）。未预期的端点回 404，让 mock 缺口在断言处显式暴露
// 而不是静默挂起。
async function mockApi(page: Page, state: ApiState) {
  const bySlug = (slug: string): Article | undefined =>
    [article1, article2, ...(state.published ? [newArticle] : [])].find(
      (a) => a.slug === slug
    );

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const {pathname: path} = new URL(req.url());
    const api = path.replace(/^\/api/, '');

    if (req.method() === 'POST' && api === '/users/login') {
      return json(route, 200, {user});
    }
    if (req.method() === 'GET' && api === '/tags') {
      return json(route, 200, {tags: ['e2e', 'smoke']});
    }
    if (req.method() === 'GET' && api === '/articles') {
      const articles = state.published
        ? [newArticle, article1, article2]
        : [article1, article2];
      return json(route, 200, {articles, articlesCount: articles.length});
    }
    if (req.method() === 'POST' && api === '/articles') {
      state.published = true;
      // 回显提交内容 + fixture 的服务端字段（slug/时间戳/计数）
      const {article} = req.postDataJSON() as {
        article: Pick<Article, 'title' | 'description' | 'body' | 'tagList'>;
      };
      return json(route, 201, {article: {...newArticle, ...article}});
    }

    const favorite = /^\/articles\/([^/]+)\/favorite$/.exec(api);
    if (req.method() === 'POST' && favorite) {
      const base = bySlug(favorite[1]!);
      if (!base) return json(route, 404, {errors: {article: ['not found']}});
      return json(route, 200, {
        article: {
          ...base,
          favorited: true,
          favoritesCount: base.favoritesCount + 1
        }
      });
    }

    // PreviewLink 的 viewport 预取会请求单篇文章详情
    const single = /^\/articles\/([^/]+)$/.exec(api);
    if (req.method() === 'GET' && single) {
      const base = bySlug(single[1]!);
      if (!base) return json(route, 404, {errors: {article: ['not found']}});
      return json(route, 200, {article: base});
    }

    return json(route, 404, {errors: {body: [`unmocked ${req.method()} ${api}`]}});
  });
}

// 走 UI 登录（而非直写 localStorage）：登录表单本身就在被测链路里，
// mock 的 POST /users/login 返回带 token 的 user，auth 服务负责落
// localStorage['painless.user']
async function login(page: Page) {
  await page.getByRole('link', {name: 'Login'}).click();
  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  // 表单提交按钮（button）与导航栏 Login（link）角色不同，天然不冲突
  await page.getByRole('button', {name: 'Login'}).click();
  await expect(page.getByText(user.username)).toBeVisible();
}

test('login → browse → favorite → logout', async ({page}) => {
  await mockApi(page, {published: false});

  // 首页：文章列表渲染（标题在卡片 h2 里，链接由 PreviewLink 渲染）
  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: article2.title})
  ).toBeVisible();

  // 登录：导航切换出用户名，token 落 localStorage
  await login(page);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('painless.user')))
    .toContain(user.token);

  // 收藏第一篇：收藏按钮的可访问名是「❤ + 计数」，按计数定位
  await page.getByRole('button', {name: /❤\s*3/}).click();
  // 乐观 +1 后由 mock 响应校正；计数变了可访问名也变，断言落在新的
  // locator 上（/❤\s*3/ 的旧按钮已不存在）
  const favoritedButton = page.getByRole('button', {name: /❤\s*4/});
  await expect(favoritedButton).toBeVisible();
  await expect(favoritedButton).toHaveAttribute('aria-pressed', 'true');

  // 登出：导航回到匿名态，本地凭据清除
  await page.getByRole('link', {name: 'Logout'}).click();
  await expect(page.getByRole('link', {name: 'Login'})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Register'})).toBeVisible();
  await expect(page.getByText(user.username)).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('painless.user'));
  expect(stored).toBeNull();
});

test('publish article from editor', async ({page}) => {
  const state = {published: false};
  await mockApi(page, state);

  await page.goto('/');
  await login(page);

  // 登录态进 editor（路由守卫已放行），填表发布
  await page.getByRole('link', {name: 'New Article'}).click();
  await page.getByPlaceholder('Article Title').fill(newArticle.title);
  await page
    .getByPlaceholder("What's this article about?")
    .fill(newArticle.description);
  await page.getByPlaceholder('Write your article...').fill(newArticle.body);
  await page.getByRole('button', {name: 'Publish Article'}).click();

  // 发布成功 → 跳回首页；mutation 已失效 ['home'] 缓存，loader 重新
  // 请求 GET /articles（此时 feed 含新文章），新标题出现在列表首位
  await expect(
    page.getByRole('heading', {name: newArticle.title})
  ).toBeVisible();
});
