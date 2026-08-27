import {expect, test, type Page, type Route} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

    // Article 详情页的 CommentList 订阅评论实体（含一条 fixture 让列表
    // 渲染出真实条目——空列表扫不到 Avatar/ListItem 的可访问性）
    const comments = /^\/articles\/([^/]+)\/comments$/.exec(api);
    if (req.method() === 'GET' && comments) {
      return json(route, 200, {
        comments: [
          {
            id: 'c1',
            createdAt: 1_767_225_600_000,
            updatedAt: 1_767_225_600_000,
            body: 'Fixture comment for the article page.',
            slug: comments[1],
            author
          }
        ]
      });
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

// 未保存离开拦截（beforeunload 通道）。导航栏 NavLink as 组合 SPA 化
// 后，点导航链接不再跨文档卸载（走 in-app 通道，见下一条用例），整页
// 卸载只剩刷新/关闭两个入口——此处以 location.reload() 触发：dirty 时
// Editor 挂的 beforeunload 兜底弹浏览器原生「离开站点？」确认。
// Playwright 以 dialog 处理器模拟用户选择：dismiss=留在页面（重载被
// 取消，草稿保留），accept=重载（表单回空 initialValues，草稿即弃）。
test('editor blocks unsaved reload (beforeunload) until confirmed', async ({page}) => {
  await mockApi(page, {published: false});

  // leaveConfirmed=false → dismiss（用户选「留在页面」）；置 true 后
  // accept（用户选「离开」）。必须在触发重载前注册：无处理器时
  // Playwright 自动 accept beforeunload，两种语义就分不开了
  let leaveConfirmed = false;
  page.on('dialog', (dialog) => (leaveConfirmed ? dialog.accept() : dialog.dismiss()));

  await page.goto('/');
  await login(page);

  await page.getByRole('link', {name: 'New Article'}).click();
  const title = page.getByPlaceholder('Article Title');
  await title.fill('Unsaved draft');
  await expect(title).toHaveValue('Unsaved draft');

  // 重载 → 原生确认被 dismiss → 留在原文档，草稿保留（未卸载）
  await page.evaluate(() => location.reload());
  await expect(title).toHaveValue('Unsaved draft');
  await expect(page).toHaveURL(/\/editor/);

  // 再重载 → 这次 accept → 文档重载，表单回落空 initialValues
  leaveConfirmed = true;
  await page.evaluate(() => location.reload());
  await expect(page.getByRole('button', {name: 'Publish Article'})).toBeVisible();
  await expect(title).toHaveValue('');
  await expect(page).toHaveURL(/\/editor/);
});

// 未保存离开拦截（in-app 通道之一，走真实 UI）。Logout 是导航栏里唯一
// 「非导航」的 <a>：href='#' 按钮语义 + onClick 里 logout 后
// navigate('/')——点击 → navigate 被 useBlocker 同步否决（未离开、
// 草稿保留）→ ConfirmDialog 弹出；确认后 reset 清 dirty 再 navigate，
// 落在 Home。取消语义与单测一致（仅关框留页），此处覆盖否决 + 确认
// 放行的完整链路。
test('editor blocks unsaved in-app leave (logout navigate) until confirmed', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  await login(page);

  await page.getByRole('link', {name: 'New Article'}).click();
  const title = page.getByPlaceholder('Article Title');
  await title.fill('Unsaved draft');

  // 点 Logout：其内部 navigate('/') 被否决，ConfirmDialog 弹出
  await page.getByRole('link', {name: 'Logout'}).click();
  await expect(page.getByRole('button', {name: 'Leave'})).toBeVisible();
  await expect(title).toHaveValue('Unsaved draft');
  await expect(page).toHaveURL(/\/editor/);

  // 确认离开：reset 后放行 navigate → 落在 Home
  await page.getByRole('button', {name: 'Leave'}).click();
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
});

// 未保存离开拦截（in-app 通道的主路径）：导航栏 NavLink as={HazeNavLink}
// 组合 SPA 化后，点导航链接走 in-app navigate（不再跨文档整页跳转），
// dirty editor 的 useBlocker 同步谓词终于拦得住它。window 标记探测器
// 断言 SPA 语义：URL 切到 Home 但文档未重载（标记仍在）；取消留页 /
// 确认放行的语义与 Logout 用例一致，此处在导航链接本体上覆盖否决 +
// 取消 + 确认的完整链路。
test('editor blocks unsaved navbar navigation (in-app) until confirmed', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  await login(page);

  await page.getByRole('link', {name: 'New Article'}).click();
  const title = page.getByPlaceholder('Article Title');
  await title.fill('Unsaved draft');
  await expect(title).toHaveValue('Unsaved draft');

  // 整页卸载探测器：window 标记随 JS 上下文存活，任何文档卸载（整页
  // 跳转/重载）都会换新上下文把标记丢掉。落在 Home 后标记仍在即铁证：
  // URL 变了但文档从未重载（注：framenavigated 事件对 pushState 同样
  // 触发，区分不了同文档/跨文档，不能用）
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__spaProbe = 'alive';
  });

  // 点导航栏 Home：in-app navigate 被否决，ConfirmDialog 弹出，草稿保留
  await page.getByRole('link', {name: 'Home'}).click();
  await expect(page.getByRole('button', {name: 'Leave'})).toBeVisible();
  await expect(title).toHaveValue('Unsaved draft');
  await expect(page).toHaveURL(/\/editor/);

  // 取消：仅关框留页，继续编辑
  await page.getByRole('button', {name: 'Stay'}).click();
  await expect(page.getByRole('button', {name: 'Leave'})).toHaveCount(0);
  await expect(title).toHaveValue('Unsaved draft');
  await expect(page).toHaveURL(/\/editor/);

  // 再点 Home → 确认：reset 清 dirty 后放行 navigate，SPA 内落 Home
  await page.getByRole('link', {name: 'Home'}).click();
  await page.getByRole('button', {name: 'Leave'}).click();
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // SPA 语义铁证：两次 Home 点击 + 视图切换全程零文档卸载
  const probe = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__spaProbe
  );
  expect(probe).toBe('alive');
});

// ---------------------------------------------------------------------------
// a11y：@axe-core/playwright 对 mock 数据渲染出的主要页面做 WCAG 2.0/2.1
// A/AA 系统化扫描（复用上面的 mockApi/login fixtures，网络层全 mock，
// 未预期端点 404）。违例处理约定：painless 视图侧问题（缺 label、aria
// 链路断裂等）修视图代码；haze-ui 组件自身的问题（如 token 对比度）不
// 改库——在扫描处 disable 对应规则并注明「haze-ui 侧问题，待库侧审核」。
// ---------------------------------------------------------------------------

// WCAG 2.0 + 2.1 的 A/AA 规则集（axe-core 官方 tag 体系）
const A11Y_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// 扫描当前页面 DOM，返回违例数组；toEqual([]) 失败时 Playwright 会打印
// 完整违例对象（规则 id、影响、问题节点选择器），可直接定位
const scanA11y = async (page: Page) => {
  const {violations} = await new AxeBuilder({page})
    .withTags(A11Y_TAGS)
    // color-contrast：haze-ui 侧问题，待库侧审核——全部命中节点均为
    // NavLink 的 token 前景 #8a8a8a 落在 #ffffff 上（3.45:1 < AA 4.5:1），
    // 样式属 haze-ui 组件，painless 不越库覆盖 token；库侧修正对比度后
    // 移除本行即可恢复整页对比度检查
    .disableRules(['color-contrast'])
    .analyze();
  return violations;
};

test('a11y: Home（未登录）通过 WCAG A/AA 扫描', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  // 等真实内容渲染完成（而非骨架/Loading 态）再扫
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();

  expect(await scanA11y(page)).toEqual([]);
});

test('a11y: Home（登录态）通过 WCAG A/AA 扫描', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  await login(page);
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();

  expect(await scanA11y(page)).toEqual([]);
});

test('a11y: Login 页通过 WCAG A/AA 扫描', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/login');
  await expect(page.getByRole('button', {name: 'Login'})).toBeVisible();

  expect(await scanA11y(page)).toEqual([]);
});

test('a11y: Register 页通过 WCAG A/AA 扫描', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/register');
  await expect(page.getByRole('button', {name: 'Register'})).toBeVisible();

  expect(await scanA11y(page)).toEqual([]);
});

test('a11y: Article 详情页通过 WCAG A/AA 扫描', async ({page}) => {
  await mockApi(page, {published: false});

  // /article/:title 的 :title 即 slug；loader 拉 GET /articles/:slug，
  // CommentList 拉 GET /articles/:slug/comments（均已 mock）
  await page.goto(`/article/${article1.slug}`);
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  // 评论条目渲染出来再扫（空态/加载态扫不到列表语义）
  await expect(page.getByText('Fixture comment for the article page.')).toBeVisible();

  expect(await scanA11y(page)).toEqual([]);
});
