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
            // date-time 字符串对齐真实 API 形态（曾是毫秒数 number，
            // Comment 契约改为 PastDate 后失配）
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
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

// /editor/:slug（编辑既有文章）：params schema（editorParamsSchema）在
// resolve 期 coerce 通过 → loader 以 coerce 后的 slug 走 GET
// /articles/:slug（与 /article/:title 同一 mock 端点）→ Editor 经
// useData 预填进「Edit Article」态。PUT 由本用例在 mockApi 之后注册的
// 探针路由捕获（后注册者先被咨询，非 PUT 经 fallback 交还 mockApi——
// 与预取探针同一约定）。
test('edit article from /editor/:slug: schema+loader 预填并 PUT 更新', async ({page}) => {
  await mockApi(page, {published: false});
  const puts: {slug: string; description: string}[] = [];
  await page.route('**/api/articles/*', async (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      const slug = new URL(req.url()).pathname.split('/').pop()!;
      const {article} = req.postDataJSON() as {
        article: {description: string};
      };
      puts.push({slug, description: article.description});
      return json(route, 200, {article: {...article1, description: article.description}});
    }
    return route.fallback();
  });

  await page.goto('/');
  await login(page);

  await page.goto(`/editor/${article1.slug}`);
  await expect(page.getByRole('heading', {name: 'Edit Article'})).toBeVisible();
  await expect(page.getByPlaceholder('Article Title')).toHaveValue(article1.title);
  await expect(
    page.getByPlaceholder("What's this article about?")
  ).toHaveValue(article1.description);

  await page
    .getByPlaceholder("What's this article about?")
    .fill('Updated by the edit flow test');
  await page.getByRole('button', {name: 'Update Article'}).click();

  // 更新成功 → 跳回首页（提交后 setInitialValues 清 dirty，navigate
  // 不被未保存拦截否决）；PUT 命中正确的 slug 与载荷
  await expect(
    page.getByRole('heading', {name: article2.title})
  ).toBeVisible();
  expect(puts).toEqual([
    {slug: article1.slug, description: 'Updated by the edit flow test'}
  ]);
});

// 非法 slug（%20 解码为空格，trim 后为空）：params schema 报 issue →
// ParamsError。native-router 的通道边界：params/search 属 resolve 前段，
// 校验失败经路由器 errorHandler（全局 RouterError：Error 标题 + 信息 +
// Refresh/Home）呈现；errorComponent 只覆盖 data 段失败（文章不存在/
// 加载失败 → NotFound）。两者都是 painless 既有错误通道，无新造。
test('invalid slug on /editor/:slug: params schema 拒绝并走全局 errorHandler', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  await login(page);

  await page.goto('/editor/%20');
  await expect(page.getByRole('heading', {name: 'Error'})).toBeVisible();
  // ParamsError 信息里带上本 schema 的 issue 文案（Text span 与堆栈
  // <pre> 各渲染一份，取 first）
  await expect(
    page.getByText('slug must be a non-empty path segment').first()
  ).toBeVisible();
  // 编辑表单未渲染：ParamsError 在 loader 前拦截，没有带着空 slug 发请求
  await expect(page.getByRole('button', {name: 'Publish Article'})).toHaveCount(0);
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
// 行为链路补充（复用上面的 mockApi/login fixtures）。page.route 与既有
// mockApi 叠加时的匹配语义（均经浏览器实测确认）：
// - handler 按注册的逆序尝试（后注册者先命中），fulfill 即终结，不再
//   进入更早注册的 handler；
// - route.fallback() 只向「更早注册」的下一个 handler 回退——改写单个
//   端点的探针/计数路由必须注册在 mockApi 之后，记账后 fallback 才能交
//   还 mockApi 分发，不复制端点分发逻辑；
// - pattern 对完整 URL（含 query string）做 glob 匹配：`**/api/articles`
//   匹配不到 `/api/articles?offset=0&limit=10`，恒带 query 的端点要写
//   `?*`（glob 的 ? 匹配单个非 / 字符，恰好吃掉 URL 的字面 ?）。
// ---------------------------------------------------------------------------

// 断网恢复重验证（useReconnectRevalidate）：Tags 侧栏经 useQuery 订阅
// tagsCache（key=[]，staleTime 默认 2000ms），window online 事件时对
// miss/stale 条目后台重拉。mock 用可变闭包让 GET /tags 依次返回两个
// 标签集：首拉 ['alpha'] 上屏 → 等条目过期 → offline→online 触发重拉
// ['alpha','omega']——omega chip 出现是「重验证真发生了」的 UI 铁证，
// 请求计数（首拉 1 次、重拉 1 次）同时排除风暴式重发。
//
// 时序取舍：过期是纯时间条件，没有可等待的 UI 观测点（Tags 的 stale
// 只映射为 opacity 样式类，且组件内 stale 标志只在重验证周期里翻转，
// 不会随时间独自置真），故以 waitForTimeout(2100) 等满 staleTime——
// 等的是「前置条件本身」，不是拿 sleep 等某个会自行发生的 UI 变化。
//
// 断网模拟：context.setOffline 走 CDP 网络仿真，与 page.route 的
// fulfill 互不干扰（被 mock 命中的请求不出网络栈）；setOffline(false)
// 恢复时 Chromium 原生派发 online 事件且此刻 navigator.onLine 已翻真
// ——reconnect 处理器先查 onLine 再动作，条件必须成立，因此用真实
// 断网而非手工 dispatchEvent（后者绕开 onLine 门槛，覆盖是假的）。
test('tags refetch on reconnect (offline → online)', async ({
  page,
  context
}) => {
  const tagPayloads = [['alpha'], ['alpha', 'omega']];
  let tagsGets = 0;
  await mockApi(page, {published: false});
  // 仅接管 /tags：取值与自增在同一处同步完成（handler 内无 await），
  // 不依赖 request 事件与 route 处理器之间不确定的先后序
  await page.route('**/api/tags', (route) => {
    const tags = tagPayloads[Math.min(tagsGets, tagPayloads.length - 1)];
    tagsGets++;
    return json(route, 200, {tags});
  });

  await page.goto('/');
  await expect(page.getByRole('button', {name: 'alpha'})).toBeVisible();
  await expect.poll(() => tagsGets).toBe(1);

  // 等满 staleTime（默认 2000ms），理由见上方时序注释
  await page.waitForTimeout(2100);

  await context.setOffline(true);
  await context.setOffline(false);

  await expect(page.getByRole('button', {name: 'omega'})).toBeVisible();
  await expect.poll(() => tagsGets).toBe(2);
});

// 401 自动登出：http 层在错误映射处判「401 且 tokenGetter() 非空」→
// 触发 auth 服务注册的 unauthorized handler → logout()（clearAllCaches
// + setUser(null) + localStorage 移除 'painless.user'），Layout 经
// onAuthChange 订阅同步导航栏。选 favorite mutation 作 401 载体：登录
// 态请求必带 token（触发条件成立），且 mutation 失败走 toast 报错 +
// 乐观回滚，不牵动路由 errorComponent——视图保持稳定，登出断言不被
// 换页干扰；登录/注册自身的 401 发生在未登录态（token 为空）天然不
// 触发，无法用它验证本链路。Toast 3s 自动消失，其断言紧跟触发点。
test('401 on authenticated request auto-logs-out', async ({page}) => {
  await mockApi(page, {published: false});
  // favorite 端点固定 401，响应体取 RealWorld {errors} 形状——mapError
  // 把字段错误拼成可读文案写进 HTTPError.message，toast 断言据此落点
  await page.route('**/api/articles/*/favorite', (route) =>
    json(route, 401, {errors: {token: ['expired']}})
  );
  // feed 探针：叠加在 mockApi 之上（后注册先命中），记账（await
  // headerValue，请求停在 handler 内，无 request 事件的异步竞态）后
  // fulfill 按 fixture 同款形状回包。pattern 带 ?*：feed 请求恒带
  // offset/limit query，glob 对完整 URL 匹配，裸 `**/api/articles`
  // 匹配不到（段首注释）。本用例不依赖 state.published
  const feedAuth: (string | null)[] = [];
  await page.route('**/api/articles?*', async (route) => {
    feedAuth.push(await route.request().headerValue('authorization'));
    return json(route, 200, {
      articles: [article1, article2],
      articlesCount: 2
    });
  });

  await page.goto('/');
  await login(page);

  // 触发 401：乐观收藏 → POST .../favorite 响应 401 → 登出链路 + 失败
  // toast（乐观 +1 由 mutation 管道自动回滚，按钮态无需在此断言）
  await page.getByRole('button', {name: /❤\s*3/}).click();
  await expect(page.getByRole('alert')).toContainText('token expired');

  // 导航栏切回匿名态：用户名消失、Sign in 回归；本地凭据已清。401
  // 处置链（增强）在此之外还回跳 /login?redirect=<原 path+search>（与
  // requireLogin 守卫重定向同款整体编码；当前页 '/'，redirect 值即
  // 编码后的 '/'）——视图随导航切到 Login
  await expect(page.getByText(user.username)).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Login'})).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('painless.user')))
    .toBeNull();
  await expect(page.getByRole('heading', {name: 'Login'})).toBeVisible();
  await expect(page).toHaveURL(/\/login\?redirect=%2F$/);

  // 后续匿名请求正常：登出已清全部实体缓存，回 Home（SPA 导航）feed
  // GET /articles 匿名发出（无 Authorization 头）且照常成功渲染。
  // 内容可见后轮询 feed 账本到新增一条，再断言头值
  const before = feedAuth.length;
  await page.getByRole('link', {name: 'Home'}).click();
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  await expect.poll(() => feedAuth.length).toBe(before + 1);
  expect(feedAuth[before]).toBeNull();
});

// PrefetchLink 预览与预取共享实体缓存：Home 卡片标题即 PreviewLink
//（prefetch='viewport'，卡片滚入视口即经 router.preload 预解析目标
// 路由——守卫 + resolveView + withCache(articleCache) 的 loader，GET
// /articles/:slug 由此发出）；hover 走组件内 onMouseEnter 开 Preview
// 浮层（usePrefetch 渲染已解析视图）；点击复用 link ref 里缓存的同一
// resolve entry——loader 不重跑、articleCache 亦不重查，单篇文章 GET
// 全程共 1 次（预取/预览/正式导航三态共享同一请求）。
//
// 定位取舍：Preview 浮层带 aria-hidden='true'（不在无障碍树里），
// getByRole('dialog') 匹配不到，改用 [role=dialog] 属性选择器；浮层
// pointer-events:none，点击仍落在卡片标题本体（浮层只读不可交互）。
// 点击时同名的预览标题（h1）已在 DOM，需 .first() 锁定卡片 h2。
test('PreviewLink previews on hover and reuses prefetch on click', async ({
  page
}) => {
  const singleGets: Record<string, number> = {};
  await mockApi(page, {published: false});
  // 计数代理：glob 的 * 不含 /，只命中「单篇详情」这一层路径
  //（comments/favorite 更深层与信息流 GET /articles 均不匹配；详情
  // 请求无 query，无需 ?*），计数后 fallback 交还 mockApi 的正常分发
  await page.route('**/api/articles/*', async (route) => {
    const slug = new URL(route.request().url()).pathname.split('/').pop()!;
    singleGets[slug] = (singleGets[slug] ?? 0) + 1;
    await route.fallback();
  });

  await page.goto('/');
  // viewport 预取：卡片滚入视口即拉详情，恰好一次
  await expect.poll(() => singleGets[article1.slug]).toBe(1);

  // hover 卡片标题 → onMouseEnter 开预览浮层：呈现预解析的 Article
  // 视图（正文可辨而非 loading 占位），且零新增请求
  await page.getByRole('heading', {name: article1.title}).hover();
  const overlay = page.locator('[role="dialog"]');
  await expect(
    overlay.getByText('Paragraphs of the first fixture article.')
  ).toBeVisible();
  await expect.poll(() => singleGets[article1.slug]).toBe(1);

  // 点击进详情：复用预取的同一 resolve entry（视图任务已 settle），
  // 同一 GET 仍共 1 次——预取与正式导航共享实体缓存/在飞任务
  await page.getByRole('heading', {name: article1.title}).first().click();
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();
  await expect.poll(() => singleGets[article1.slug]).toBe(1);
});

// About 页无限滚动 feed（useFeed 场景：react-toolroom/async 原子 hooks
// 组装——useInfinite + useRun + useInitialLoading/useError，不经过
// useQuery preset，见 src/services/feed.ts）：IntersectionObserver 哨兵
// 滚到底自动续页，追平总量进终态。mock 叠加语义同上：分页 handler 注册
// 在 mockApi 之后（后注册者先被咨询，fulfill 即终结），pattern 必须
// **/api/articles?* ——列表端点恒带 query string，不带 ?* 的 glob 匹配
// 不到（见上方行为链路注释）。
test('about infinite feed: scroll to bottom loads the next page, then stops', async ({page}) => {
  await mockApi(page, {published: false});

  // 12 篇 fixture × limit 10 → 两页 10 + 2；形状复用 article1 的契约，
  // 仅 slug/title/描述/时间错开。记账每次列表请求的 offset。
  const feedArticles: Article[] = Array.from({length: 12}, (_, i) => {
    const no = String(i + 1).padStart(2, '0');
    return {
      ...article1,
      slug: `e2e-feed-${no}`,
      title: `Feed Article ${no}`,
      description: `Fixture article ${no} for the infinite feed demo.`,
      createdAt: `2026-02-${no}T00:00:00.000Z`,
      updatedAt: `2026-02-${no}T00:00:00.000Z`,
      favoritesCount: i
    };
  });
  const feedOffsets: string[] = [];
  await page.route('**/api/articles?*', async (route) => {
    const {searchParams} = new URL(route.request().url());
    const offset = Number(searchParams.get('offset') ?? 0);
    const limit = Number(searchParams.get('limit') ?? 10);
    feedOffsets.push(searchParams.get('offset') ?? '0');
    return json(route, 200, {
      articles: feedArticles.slice(offset, offset + limit),
      articlesCount: feedArticles.length
    });
  });

  await page.goto('/about');

  // 首页：10 篇渲染，第 11 篇不存在，feed 只发过 offset=0 一次请求
  //（哨兵在 overflow 容器的裁剪区外，不滚不动）
  await expect(
    page.getByRole('heading', {name: 'Feed Article 01'})
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Feed Article 10'})
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Feed Article 11'})
  ).toHaveCount(0);
  expect(feedOffsets).toEqual(['0']);

  // 滚动 feed 容器到底：哨兵进入视口 → 自动发起第二条请求（offset=10）
  await page.getByRole('feed').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(
    page.getByRole('heading', {name: 'Feed Article 12'})
  ).toBeVisible();
  expect(feedOffsets).toEqual(['0', '10']);

  // 终态：追平总量显示结束标记（加载反馈与终态同在哨兵区）；继续滚动
  // 不再发请求。waitForTimeout 是「负断言的稳定窗」：没有可等待的 UI
  // 信号能证明「什么都没发生」，只能给 IO 回调一个结算窗口后核对记账。
  await expect(page.getByRole('status')).toHaveText('All 12 articles loaded');
  await page.getByRole('feed').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(300);
  expect(feedOffsets).toEqual(['0', '10']);
});

// viewStack 同文档往返（卖点：后退恢复零请求）。分层短路见
// views/index.tsx：bfcache > viewStack > queryCache——同文档 back 落
// history.state 里的会话栈快照，视图即时恢复。零请求的边界是缓存新鲜
// 期（实测确认）：POP 时条目仍新鲜（staleTime 2000ms 内）则全程零请求；
// 已 stale 则快照恢复「旧值先行」，POP 的重解析走 SWR 后台重验证补一
// 条 feed 请求——那是 queryCache 层的设计行为（stale-while-revalidate），
// 不是 viewStack 失效。本用例按卖点场景走「快速浏览读完即回退」动线，
// 全程留在新鲜期内；重验证只认事件触发（mount/focus/reconnect/导航），
// 不会随时间自行发生，back 后的等待窗里没有触发源，计数断言稳定。
// useFocusRevalidate 的面：本链路里它挂在 createQueryHook 场景（Tags/
// About feed），且 Playwright 的 goBack 是同文档 POP，不派发 focus/
// visibilitychange；计数只盯 /api/articles，Tags 侧的重拉（若有）天然
// 不计入。
test('viewStack back: Home 后退零请求恢复', async ({page}) => {
  let feedGets = 0;
  await mockApi(page, {published: false});
  // feed 计数代理，注册在 mockApi 之后（后注册先咨询，fallback 只向更早
  // 注册者回退，见段首注释）。两个 pattern 各司其职：列表请求恒带
  // offset/limit query，glob 对完整 URL 匹配，裸 `**/api/articles` 拦不
  // 到，`?*` 变体（? 恰好吃掉 URL 的字面 ?）才命中；裸变体兜住假想的
  // 无 query 形态。同一请求只会计一次：query URL 只匹配 ?* 变体，fallback
  // 传给裸变体时 glob 不匹配、回调不执行，直达 mockApi。
  const countFeed = (route: Route) => {
    feedGets++;
    return route.fallback();
  };
  await page.route('**/api/articles', countFeed);
  await page.route('**/api/articles?*', countFeed);

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  // 初载恰好一次：StackWarmer 预热与冷启动首解析经 withCache 的 in-flight
  // 共享并成同一请求（时序论证见 views/index.tsx）
  await expect.poll(() => feedGets).toBe(1);
  const before = feedGets;

  // 进首篇详情：先 hover 等预览浮层把目标视图完整解析（含 CommentList
  // 的 comments 订阅落定）再点击——直接点会踩「浮层卸载 abort 在飞
  // comments 请求」的竞态（见下一条用例注释）；.first() 的取舍同预取
  // 用例，浮层里已有同名标题
  await page.getByRole('heading', {name: article1.title}).hover();
  await expect(
    page
      .locator('[role="dialog"]')
      .getByText('Fixture comment for the article page.')
  ).toBeVisible();
  await page.getByRole('heading', {name: article1.title}).first().click();
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();
  expect(feedGets).toBe(before);

  // 后退：POP 落 viewStack 快照，Home 视图即时恢复
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: article2.title})
  ).toBeVisible();

  // 负断言的稳定窗（同无限滚动终态断言的取舍）：给潜在的重解析/后台
  // 重验证一个结算窗口后核对计数——快照命中则计数纹丝不动
  await page.waitForTimeout(1000);
  expect(feedGets).toBe(before);
});

// searchDeps 快路径（@native-router ≥1.12，接线见 views/index.tsx 的
// Home 链：布局层 [] + Home 叶子层 tag/offset/limit 全量键）：同 search
// 重复导航 → 当前视图快照直接作为新条目复用，零守卫零 loader 零懒加载
//（与 POP 落 viewStack 同一条路）；声明键变化（翻页 offset）照常整链
// 重解析——分页行为不变是接线的前置约束，两段在同一用例里互为对照。
// 列表 fixture 需 ≥2 页（12 篇 × limit 10），复用无限 feed 用例的造数
// 形态：fulfill 型 handler 注册在 mockApi 之后（后注册先咨询），直接
// 覆盖 mockApi 的两篇 fixture 响应。
test('searchDeps: Home 同 search 重复导航零请求，翻页照常重取', async ({page}) => {
  let feedGets = 0;
  await mockApi(page, {published: false});
  const feedArticles: Article[] = Array.from({length: 12}, (_, i) => {
    const no = String(i + 1).padStart(2, '0');
    return {
      ...article1,
      slug: `e2e-deps-${no}`,
      title: `Deps Article ${no}`
    };
  });
  await page.route('**/api/articles?*', async (route) => {
    feedGets++;
    const {searchParams} = new URL(route.request().url());
    const offset = Number(searchParams.get('offset') ?? 0);
    const limit = Number(searchParams.get('limit') ?? 10);
    return json(route, 200, {
      articles: feedArticles.slice(offset, offset + limit),
      articlesCount: feedArticles.length
    });
  });
  // 裸变体只计数（列表请求恒带 query，glob 对完整 URL 匹配——口径见
  // viewStack 用例注释）
  await page.route('**/api/articles', (route) => {
    feedGets++;
    return route.fallback();
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: 'Deps Article 01'})
  ).toBeVisible();
  await expect.poll(() => feedGets).toBe(1);

  // 同 search 重复导航：导航栏 Home（TypedNavLink to='/'，当前已在 /）
  const before = feedGets;
  await page.getByRole('link', {name: 'Home', exact: true}).click();
  // 负断言的稳定窗（同 viewStack 用例）：给潜在的重解析一个结算窗口
  await page.waitForTimeout(1000);
  expect(feedGets).toBe(before);

  // 翻页（声明键 offset 变化）：TypedLink 的 search 序列化进 URL，整链
  // 重解析、loader 读到新 search → 第二条列表请求，第二页渲染
  await page.getByRole('link', {name: 'Next →'}).click();
  await expect(page).toHaveURL(/\/\?offset=10$/);
  await expect(
    page.getByRole('heading', {name: 'Deps Article 11'})
  ).toBeVisible();
  await expect.poll(() => feedGets).toBe(2);
});

// 乐观写失败自动回滚（cache.mutation 管道卖点，services/mutations.ts）：
// 乐观首步同步翻转 → 服务调用 → 失败自动回滚 + 调用方 toast。favorite 是
// toggle 端点（POST 加 / DELETE 取），route 对方法不敏感、一律拦截，本
// 用例驱动 POST（未收藏 → 收藏）方向：500 虽属瞬态码，重试管道只放行
// 幂等方法，POST 单趟即终败，~300ms 延迟就是确定的乐观窗口（DELETE 方向
// 会额外带 2 趟重试，回滚语义同形，不重复驱动）。断言三段：乐观期翻转
// （即时断言，窗口只有延迟期那么长）→ 500 落地后回滚复原 → danger
// toast（错误文案经 http 层 mapError 拼 errors 字段「<field> <message>」；
// haze-ui Toast 的 DOM 形态：div[role=alert] + haze-Toast__danger 变体类，
// 已读组件库 dist 确认）。
test('favorite 500: 乐观翻转回滚 + danger toast', async ({page}) => {
  await mockApi(page, {published: false});
  await page.route('**/api/articles/*/favorite', async (route) => {
    // fulfill 前延迟 ~300ms：把乐观窗口拉到可断言的宽度
    await new Promise((resolve) => setTimeout(resolve, 300));
    return json(route, 500, {errors: {favorite: ['server exploded']}});
  });

  await page.goto('/');
  await login(page);

  // 已登录态进首篇详情（收藏按钮需登录，未登录点击会被引去 /login）。
  // 先 hover 等预览浮层完整解析再点击：Playwright 的 click 自带 mousemove
  // 会开出浮层，浮层里的 CommentList 已挂起 comments 订阅——立刻点击会
  // 卸载浮层、在飞请求被 signal abort（net::ERR_ABORTED），AbortError 污
  // 染共享的 per-args 状态，真视图的 CommentList 渲染 Failed to load
  // comments（预取用例不踩此坑：它在点击前等过预取落定）。等浮层的评
  // 论文本出现即 comments 已 settle，点击后真视图直接吃缓存
  await page.getByRole('heading', {name: article1.title}).hover();
  await expect(
    page
      .locator('[role="dialog"]')
      .getByText('Fixture comment for the article page.')
  ).toBeVisible();
  await page.getByRole('heading', {name: article1.title}).first().click();
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();

  // 点收藏：乐观首步在点击事件内同步落 DOM，断言即时落点（toHave* 自带
  // 重试，但真正的约束是必须赶在 300ms 延迟结束前看到翻转）
  await page.getByRole('button', {name: /❤\s*3/}).click();
  const optimistic = page.getByRole('button', {name: /❤\s*4/});
  await expect(optimistic).toBeVisible();
  await expect(optimistic).toHaveAttribute('aria-pressed', 'true');

  // 500 落地：管道回滚（❤4→❤3、aria-pressed 复原 false），错误文案进
  // danger toast；视图不换页（写失败不牵动路由 errorComponent）。toast
  // 定位锁定 haze-Toast__danger 变体类：haze-ui 的 Alert 也是 role=alert
  //（评论失败态与 toast 同 role），类名才能把两者分开
  await expect(
    page.getByRole('button', {name: /❤\s*3/})
  ).toHaveAttribute('aria-pressed', 'false');
  const toast = page.locator('[role="alert"].haze-Toast__danger');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('favorite server exploded');
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));
});

// 预览浮层竞态回归（react-toolroom ≥0.18.4 abort 让位修复的行为闭环）：
// hover 开出预览浮层（浮层内 CommentList 已挂起 comments 订阅）后不等
// settle 立刻点击——浮层卸载，useRun 的 signal abort 在飞请求。修复前：
// provider.load 的 in-flight 槽要等微任务才随 reject 清除，真视图同栈
// mount 的 load join 已死 promise，评论区永久渲染 Failed to load
// comments 且无重试（fetch 总调用数停在 1）。修复后：abort 同步让位槽，
// 真视图新起请求，评论区正常渲染。上面的用例刻意等浮层 settle 规避本
// 竞态；本用例反其道行之，专守这条回归线。
test('PreviewLink race: fast click after hover keeps comments healthy', async ({
  page
}) => {
  await mockApi(page, {published: false});
  // comments 端点垫 ~200ms 延迟（注册在 mockApi 之后，逆序先试、fulfill
  // 即终结）：把「在飞窗口」拉宽到覆盖 click→浮层卸载的时序，不依赖
  // 竞态的纳秒级自然窗口
  await page.route('**/api/articles/*/comments*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return json(route, 200, {
      comments: [
        {
          id: 'c1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          body: 'Fixture comment for the article page.',
          slug: article1.slug,
          author
        }
      ]
    });
  });

  await page.goto('/');
  // hover 开浮层后只等浮层本体出现（不等评论文本——那意味着 settle），
  // 立刻点击
  await page.getByRole('heading', {name: article1.title}).hover();
  // first()：页面除预览浮层外还有一个常驻 [role=dialog]（ToastContainer
  // 的宿主），strict mode 下裸 locator 解析到 2 个元素直接违例
  await expect(page.locator('[role="dialog"]').first()).toBeVisible();
  await page.getByRole('heading', {name: article1.title}).first().click();
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));

  // 修复后的契约：真视图的 CommentList 新起请求并成功渲染，全程不出现
  // 失败态文案
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible({timeout: 5000});
  await expect(page.getByText('Failed to load comments')).toHaveCount(0);
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

// 交互态扫描（区别于上面的静态页面态）：预览浮层 / DevTool 面板这类
// 只在交互后才出现的 portal 内容。
//
// 预览浮层的覆盖边界（读 axe-core 4.13 源码确认）：浮层 aria-hidden
// 后多数规则直接跳过其子树，唯一仍作用于它的 A/AA 规则是
// aria-hidden-focus（隐藏子树内不得有可聚焦元素）；该规则的三个检查
// 在「存在 fixed 全屏元素 / pointer-events:none」等场景会退化为
// pass/incomplete——本例浮层 pointer-events:none + scale(0.2)，实测
// 返回 incomplete（不进 violations）。因此本用例对浮层是「回归网」
// 而非充分判定：浮层内可聚焦内容的真缺陷（键盘 Tab 落进对 AT 不可见
// 的 0.2 倍缩放视图——浮层渲染的是含链接/按钮/表单的完整目标页面）已
// 作为模板侧缺陷修复（Preview 浮层加 inert，Popover 撤销非模态却声明
// aria-modal="true"），此处扫描守住其余规则不回归。

test('a11y: PreviewLink 预览浮层打开态通过 WCAG A/AA 扫描', async ({
  page
}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();

  // hover 打开预览浮层（定位同上方 PreviewLink 行为用例：浮层
  // aria-hidden，getByRole 匹配不到，用 [role=dialog] 属性选择器）
  await page.getByRole('heading', {name: article1.title}).hover();
  await expect(
    page
      .locator('[role="dialog"]')
      .getByText('Paragraphs of the first fixture article.')
  ).toBeVisible();
  // 浮层必须 inert：把整棵预览树移出 Tab 序（见用例头注释的缺陷说明）
  await expect(page.locator('[role="dialog"][inert]')).toBeAttached();
  // 键盘链路实证：inert 子树不可聚焦（focus() 落空、activeElement 不变）
  // ——修复前浮层内链接可被焦点穿透（Tab 落进对 AT 不可见的 0.2 倍视图）
  const focusEnteredOverlay = await page.evaluate(() => {
    const link = document.querySelector('[role="dialog"][inert] a[href]');
    if (!link) return true;
    (link as HTMLElement).focus();
    return document.activeElement === link;
  });
  expect(focusEnteredOverlay).toBe(false);

  expect(await scanA11y(page)).toEqual([]);
});

// DevTool 面板（dev-only，e2e 的 webServer 是 vite dev，面板必然存在）：
// 点击 DEV 角标展开 300×300 面板——mock 配置/CacheView（含 Clear 按钮）/
// react-toolroom 的 'Cache & Calls' 调用追踪表/请求日志。面板与页面
// 背景内容同扫：面板本体是 Popover（role=dialog，未 aria-hidden），
// 其内容在无障碍树内，接受完整规则集。
test('a11y: DevTool 面板打开态通过 WCAG A/AA 扫描', async ({page}) => {
  await mockApi(page, {published: false});

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();

  await page.getByRole('button', {name: 'DEV'}).click();
  // 'Cache & Calls'（react-toolroom 面板标题）可见即面板内容挂载完成
  await expect(page.getByText('Cache & Calls')).toBeVisible();

  expect(await scanA11y(page)).toEqual([]);
});

// ---------------------------------------------------------------------------
// View Transitions e2e：Router 的 viewTransition 谓词（views/index.tsx：
// (info) => info.action !== 'replace'）× 库侧管线（@native-router/react
// 1.10：谓词通过时 document.startViewTransition({update, types})，types
// 按 action 映射 push→['push'] / pop→['pop'] / replace→[]；动画期间
// commit gate 挂起新视图提交，update 回调内 flushSync 提交）。观测通路
// 是 spy 注入：page.addInitScript 在任何页面 JS 之前包装
// document.startViewTransition——包装器纯透传（原参数调原函数、返回原
// ViewTransition，库的 commit gate / skipTransition 探针语义不受影响），
// 把每次调用的形态记进 window.__vtCalls，经 page.evaluate 读回断言。
//
// 库能力探针的口径（读 dist/view-transition.js 确认）：每个页面首次动画
// 导航前，库会先 startViewTransition({update(){}, types:[]}).skip
// Transition() 探一次「对象形态 + types 选项」可用性（模块级 memo）。
// 该探针调用同样进 __vtCalls（types 为空数组）——断言按 types 内容过滤
// 即可自然排除，不计入导航过渡本身。
//
// 环境退化约定：能力探针用例硬断言 startViewTransition 存在（bundled
// Chromium，Chrome 111+ 支持 VT、125+ 支持 types 选项，预期可用）；后续
// 用例一律先断言导航功能，再查能力——不支持的环境注记后止步于导航断言
//（测试保持绿），不硬写必红的 VT 断言。
// ---------------------------------------------------------------------------

// VT 调用形态：对象形态记 {types: [...]}（数组快照拷贝，防调用方事后
// 原地改写）；types 选项不被支持时库降级为回调形态，记 {callback: true}
type VtCall = {types?: string[]; callback?: boolean};

// spy 注入。__vtSupported 必须在包装前采集：包装后
// document.startViewTransition 恒为函数，typeof 探针就失效了
const installVtSpy = (page: Page) =>
  page.addInitScript(() => {
    const doc = document as unknown as {
      startViewTransition?: (setup: unknown) => unknown;
    };
    const native = doc.startViewTransition?.bind(document);
    const calls: {types?: string[]; callback?: boolean}[] = [];
    const record = window as unknown as Record<string, unknown>;
    record.__vtSupported = typeof native === 'function';
    record.__vtCalls = calls;
    if (!native) return;
    doc.startViewTransition = (setup: unknown) => {
      calls.push(
        typeof setup === 'function'
          ? {callback: true}
          : {types: [...((setup as {types?: string[]}).types ?? [])]}
      );
      // 纯透传：原参数调原函数、返回原 ViewTransition
      return native(setup);
    };
  });

const readVtCalls = (page: Page) =>
  page.evaluate(
    (): VtCall[] =>
      (window as unknown as {__vtCalls?: VtCall[]}).__vtCalls ?? []
  );

const vtSupported = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as {__vtSupported?: boolean}).__vtSupported === true
  );

// 不支持 VT 的环境的止步口径：调用方已断言过导航功能，此处跳过 VT 专属
// 断言并注记（环境能力本身由探针用例把关）
const vtUnsupported = async (page: Page) => {
  if (await vtSupported(page)) return false;
  test.info().annotations.push({
    type: 'note',
    description:
      'document.startViewTransition 不存在（环境不支持 VT）：本用例按约定止步于导航功能断言'
  });
  return true;
};

// 能力探针 + 初载零过渡。冷启动链的两个历史提交——listen 自举的
// replace 与冷启动 refresh 落终点的 replace——action 都是 replace，谓词
// 全程排除；这也是「守卫重定向不动画」用例的前置口径。
test('view transitions: 能力探针（startViewTransition 可用且初载零过渡）', async ({page}) => {
  await mockApi(page, {published: false});
  await installVtSpy(page);

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();

  expect(await readVtCalls(page)).toEqual([]);
  expect(await vtSupported(page)).toBe(true);
});

// push 触发 VT：首页点文章卡片（PreviewLink 的 in-app navigate）→ 库以
// types=['push'] 开过渡。spy 是页面生命周期的全量账本，断言只认「导航前
// 长度 → 差值」——本用例窗口含页内首航的库能力探针（空 types，见段首
// 注释），按 types 内容过滤排除。
test('view transition: push 导航开过渡且 types 含 push', async ({page}) => {
  await mockApi(page, {published: false});
  await installVtSpy(page);

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  const before = (await readVtCalls(page)).length;

  // .first()：hover 会开出预览浮层，浮层里已有同名 h1，锁定卡片 h2
  //（取舍同预取用例）
  await page.getByRole('heading', {name: article1.title}).first().click();
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));
  // 导航功能正常：真视图渲染（评论区可见），非仅 URL 变化
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();

  if (await vtUnsupported(page)) return;

  const added = (await readVtCalls(page)).slice(before);
  const pushes = added.filter((c) => c.types?.includes('push'));
  expect(pushes).toHaveLength(1);
  // 窗口内除 push 过渡本身，最多再一条库能力探针；再多即一次导航重复
  // 开过渡的缺陷信号
  expect(added.length).toBeLessThanOrEqual(pushes.length + 1);
});

// back 触发 VT：同文档 POP → types=['pop']（pop 也动画是本模板的显式
// 配置，库默认仅 push）。baseline 在 push 航之后取——页内首航的能力
// 探针已在 push 窗口消化，本窗口应恰一条 pop 调用。
test('view transition: back 导航开过渡且 types 含 pop', async ({page}) => {
  await mockApi(page, {published: false});
  await installVtSpy(page);

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: article1.title})
  ).toBeVisible();
  await page.getByRole('heading', {name: article1.title}).first().click();
  await expect(page).toHaveURL(new RegExp(`/article/${article1.slug}$`));
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();
  const before = (await readVtCalls(page)).length;

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  // 导航功能正常：Home 视图恢复渲染
  await expect(
    page.getByRole('heading', {name: article2.title})
  ).toBeVisible();

  if (await vtUnsupported(page)) return;

  const added = (await readVtCalls(page)).slice(before);
  expect(added).toHaveLength(1);
  expect(added[0]?.types).toContain('pop');
});

// 守卫重定向不动画（谓词排除 replace）：未登录直访 /editor →
// requireLogin 在 resolve 期把链改写到 /login?redirect=…。实测口径：
// goto 是整页加载、spy 账本自空开始，冷启动链的两次历史提交（listen
// 自举 replace + refresh 走 replaceEntry 落守卫链终点）action 都是
// replace，谓词全程排除——全量核对应零调用。
test('view transition: 未登录直访 /editor 的守卫重定向链零过渡', async ({page}) => {
  await mockApi(page, {published: false});
  await installVtSpy(page);

  await page.goto('/editor');
  // 重定向落点：URL 落 /login（守卫路由的 URL 不落），Login 表单渲染
  await expect(page).toHaveURL(/\/login\?redirect=/);
  await expect(page.getByRole('button', {name: 'Login'})).toBeVisible();

  expect(await readVtCalls(page)).toEqual([]);
});

// 滚动恢复 × pop 动画（本批最担心的时序面）：ScrollRestoration 在
// history POP 监听的微任务里 scrollTo 恢复，而 VT 的 commit gate 把新
// 视图提交挂到过渡 update 回调（约一帧后）——恢复落点是仍挂着的旧视图
// DOM：旧页（文章页）比保存偏移矮时 scrollTo 被文档高度钳制，恢复失效。
// 用例构造这个耦合形状：Home（10 张卡片，长页）滚到末卡 → push 到文章
// 页 → back。断言三件事：pop 过渡确实开了（恢复时序发生在动画管线
// 内）、Home 内容正常渲染（不卡旧帧）、滚动偏移恢复到离开时的位置
//（160ms 动画结算后再读数）。两个用例只差「出站文章页的高度」：
// - 高页（60 条评论垫高文档）：恢复不触钳制，管线契约成立——本用例
//   绿，钉住正确行为；
// - 矮页（1 条评论，文档恰为一屏）：恢复被旧 DOM 钳制到 0——已实测
//   确定的库侧缺陷（@native-router/react ScrollRestoration × VT commit
//   gate），fixme 钉住缺陷形状并附证据，库侧修复后转正。
test('view transition pop × ScrollRestoration: 出站页够高时 back 后滚动位置恢复', async ({page}) => {
  await mockApi(page, {published: false});
  // 长列表：10 张卡片让 Home 显著高于视口，滚动偏移可观。pattern 带
  // ?*（列表端点恒带 query，见段首注释）；注册在 mockApi 之后，fulfill
  // 即终结
  const feedArticles: Article[] = Array.from({length: 10}, (_, i) => {
    const no = String(i + 1).padStart(2, '0');
    return {
      ...article1,
      slug: `e2e-vt-${no}`,
      title: `VT Article ${no}`,
      description: `Fixture article ${no} for the scroll restoration test.`,
      createdAt: `2026-03-${no}T00:00:00.000Z`,
      updatedAt: `2026-03-${no}T00:00:00.000Z`,
      favoritesCount: i
    };
  });
  await page.route('**/api/articles?*', (route) =>
    json(route, 200, {
      articles: feedArticles,
      articlesCount: feedArticles.length
    })
  );
  // 详情端点补 VT 卡片：mockApi 的 bySlug 只认两篇 fixture；* 不跨 /，
  // comments 更深一层不受影响；未命中的 fallback 交还 mockApi
  await page.route('**/api/articles/*', async (route) => {
    const slug = new URL(route.request().url()).pathname.split('/').pop()!;
    const hit = feedArticles.find((a) => a.slug === slug);
    return hit ? json(route, 200, {article: hit}) : route.fallback();
  });
  // 评论区垫 60 条：出站文章页（3274px 实测）显著高于保存偏移（~1011）
  // + 视口（720），恢复 scrollTo 不被旧 DOM 钳制——这是「管线正确」的
  // 形状（pattern 同 PreviewLink race 用例）
  await page.route('**/api/articles/*/comments*', (route) =>
    json(route, 200, {
      comments: Array.from({length: 60}, (_, i) => ({
        id: `vt-c${i}`,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        body: `Scroll fixture comment #${i}.`,
        slug: 'e2e-vt-10',
        author
      }))
    })
  );
  await installVtSpy(page);

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: 'VT Article 01'})
  ).toBeVisible();

  // 滚末卡入视口后读实际偏移（卡片高度随内容浮动，不硬编码像素）；
  // 离开点必须非顶部，否则不构成对恢复的检验
  await page
    .getByRole('heading', {name: 'VT Article 10'})
    .scrollIntoViewIfNeeded();
  const leftAt = await page.evaluate(() => window.scrollY);
  expect(leftAt).toBeGreaterThan(0);

  // 点末卡 push 到文章页（.first() 的取舍同上：浮层里已有同名 h1）
  await page.getByRole('heading', {name: 'VT Article 10'}).first().click();
  await expect(page).toHaveURL(/\/article\/e2e-vt-10$/);
  await expect(page.getByText('Scroll fixture comment #0.')).toBeVisible();

  const before = (await readVtCalls(page)).length;
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  // Home 快照恢复：首末两张卡片都在（内容正常，不卡旧帧）
  await expect(
    page.getByRole('heading', {name: 'VT Article 01'})
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'VT Article 10'})
  ).toBeVisible();
  // 等 160ms 过渡动画结算后再读滚动位置：恢复本身发生在 POP 的微任务
  // 里、伪元素动画不动 scrollY，这里按「动画结束后再断言」的口径给
  // 结算窗，读的是最终落点
  await page.waitForTimeout(300);
  const restored = await page.evaluate(() => window.scrollY);
  expect(restored).toBe(leftAt);

  if (await vtUnsupported(page)) return;
  // pop 过渡在场：恢复确实发生在动画管线内（本用例的耦合前提）
  const added = (await readVtCalls(page)).slice(before);
  expect(added.filter((c) => c.types?.includes('pop'))).toHaveLength(1);
});

// 缺陷形状（fixme，库侧修复后转正）：出站文章页矮（文档恰一屏 720px，
// maxScroll=0）时，pop 恢复的 scrollTo(0, ~1011) 落在 commit gate 仍
// 持有的旧文章 DOM 上，被钳到 0，Home 提交后停留在顶部。
//
// 实测证据（2026-08-31，bundled Chromium 1.62.1，@native-router/react
// 1.10.0）：
// - 现象：leftAt=1011 / restored=0，--repeat-each=5 全 5 次复现
//   （确定性缺陷，非偶发时序）；
// - 机制（window.scrollTo 包装探针实证）：pop 时 ScrollRestoration 的
//   恢复 scrollTo(0,1011) 在旧文章 DOM（docHeight=720）上执行 → 落点
//   被钳到 0 → VT update 回调内 flushSync 提交 Home（1731px）时滚动
//   已丢。出站页垫高（60 条评论，3274px）后同一流程恢复成功
//   （scrollY=1011）——钳制是唯一分叉变量；
// - 对照（删掉 Document.prototype.startViewTransition 关闭 VT）：矮页
//   场景同样 restored=0，但机制不同（同步提交让文档先收缩、浏览器自动
//   钳制发生在保存读取之前，保存值即坏）——即 pop 滚动恢复的时序缺陷
//   不止 VT 一条路径，VT 路径的独有贡献是「恢复被旧 DOM 钳制」。
//
// 库侧修复已发版并实测：1.10.1（恢复挂起至 VT 提交后经 afterViewCommit
// 触发 + 离开偏移在首个历史事件同步读取 + 探针/正式过渡的 ready/
// finished 补 catch）上，本用例解封直跑绿（27/27 全绿，且 1.10.0 上
// 每次首航必现的 vite 控制台 [Unhandled rejection] AbortError:
// Transition was skipped 消失）。本仓库锁 1.10.0 时缺陷仍在——升级
// @native-router/react 到 1.10.1（pnpm install @native-router/
// react@1.10.1）与本用例解封（test.fixme → test、标题去「库侧缺陷」
// 后缀、注释留证）由集成侧一并落地。
test('view transition pop × ScrollRestoration: 出站页矮时 back 后滚动位置恢复', async ({page}) => {
  await mockApi(page, {published: false});
  const feedArticles: Article[] = Array.from({length: 10}, (_, i) => {
    const no = String(i + 1).padStart(2, '0');
    return {
      ...article1,
      slug: `e2e-vt-${no}`,
      title: `VT Article ${no}`,
      description: `Fixture article ${no} for the scroll restoration test.`,
      createdAt: `2026-03-${no}T00:00:00.000Z`,
      updatedAt: `2026-03-${no}T00:00:00.000Z`,
      favoritesCount: i
    };
  });
  await page.route('**/api/articles?*', (route) =>
    json(route, 200, {
      articles: feedArticles,
      articlesCount: feedArticles.length
    })
  );
  await page.route('**/api/articles/*', async (route) => {
    const slug = new URL(route.request().url()).pathname.split('/').pop()!;
    const hit = feedArticles.find((a) => a.slug === slug);
    return hit ? json(route, 200, {article: hit}) : route.fallback();
  });
  // 与上一用例唯一分叉：评论区只有 mockApi 的 1 条 fixture，出站页矮
  await installVtSpy(page);

  await page.goto('/');
  await expect(
    page.getByRole('heading', {name: 'VT Article 01'})
  ).toBeVisible();
  await page
    .getByRole('heading', {name: 'VT Article 10'})
    .scrollIntoViewIfNeeded();
  const leftAt = await page.evaluate(() => window.scrollY);
  expect(leftAt).toBeGreaterThan(0);

  await page.getByRole('heading', {name: 'VT Article 10'}).first().click();
  await expect(page).toHaveURL(/\/article\/e2e-vt-10$/);
  await expect(
    page.getByText('Fixture comment for the article page.')
  ).toBeVisible();

  const before = (await readVtCalls(page)).length;
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', {name: 'VT Article 01'})
  ).toBeVisible();
  await page.waitForTimeout(300);
  const restored = await page.evaluate(() => window.scrollY);
  expect(restored).toBe(leftAt);

  if (await vtUnsupported(page)) return;
  const added = (await readVtCalls(page)).slice(before);
  expect(added.filter((c) => c.types?.includes('pop'))).toHaveLength(1);
});
