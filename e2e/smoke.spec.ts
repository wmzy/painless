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

  // 导航栏切回匿名态：用户名消失、Sign in 回归；本地凭据已清
  await expect(page.getByText(user.username)).toHaveCount(0);
  await expect(page.getByRole('link', {name: 'Login'})).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('painless.user')))
    .toBeNull();

  // 后续匿名请求正常：登出后整页重载（缓存已清、旧账号数据不作数），
  // feed GET /articles 匿名发出（无 Authorization 头）且照常成功渲染。
  // 内容可见后轮询 feed 账本到新增一条，再断言头值
  const before = feedAuth.length;
  await page.reload();
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
