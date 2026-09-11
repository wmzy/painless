import {expect, type Page, type Route} from '@playwright/test';

// E2E 共享层：fixtures/mockApi/login 原为 smoke.spec.ts 顶部私有定义，
// prod/visual 两个新 spec（真实产物链路、视觉快照）需要同一套固定内容
// mock——同一形状抄两份只会让 fixture 漂移时三处失同步。本文件从
// smoke.spec.ts 原样抽出（加 export，代码与注释逐字未改，既有用例的
// 断言与 fixture 零改动）。文件名不命中 Playwright 默认 testMatch
// （*.spec.*），不会被当成用例收集。

// E2E 冒烟 fixtures：静态 JSON（不用 faker——dev 模式下 faker 只在请求
// 失败/空响应时兜底，这里 mock 全部命中，随机数只会让断言不稳定）。
// 形状对齐 src/types/index.ts 的 Article/User 契约。

export const AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%2306f"/></svg>';

export const PASSWORD = 'e2e-password';

export const user = {
  email: 'e2e@painless.dev',
  username: 'e2e-tester',
  bio: 'smoke tester',
  image: AVATAR,
  token: 'e2e-jwt-token'
};

// 作者名与登录用户名错开：getByText(username) 才能唯一定位导航栏的
// 用户名 span，不被卡片作者行误伤
export const author = {
  username: 'alice',
  bio: '',
  image: AVATAR,
  following: false
};

export const article1 = {
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

export const article2 = {
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

export const newArticle = {
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

// 作者即登录用户本人的文章：删除文章/删除评论用例的作者权入口依赖它
//（article1/2 的作者是 alice/bob，与登录用户错开）
export const userArticle = {
  slug: 'e2e-own-article',
  title: 'Own E2E Article',
  description: 'Authored by the fixture user.',
  body: 'Body of the fixture user article.',
  tagList: [],
  author: {
    username: user.username,
    bio: user.bio,
    image: user.image,
    following: false
  },
  createdAt: '2026-01-06T00:00:00.000Z',
  updatedAt: '2026-01-06T00:00:00.000Z',
  favorited: false,
  favoritesCount: 0
};

export type Article = typeof article1;

// 路由状态：POST /articles 发布后，后续 GET /articles 的 feed 才包含
// 新文章——模拟「服务端已写入」的可观测行为。deletedComments /
// deletedArticle 让删除端点有可观测效果（重拉列表不再含已删条目）；
// settings 是当前用户的权威副本（PUT /user 写入，profiles 端点读回）
export type ApiState = {
  published: boolean;
  deletedComments?: number[];
  deletedArticle?: string;
  settings?: typeof user;
};

export const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });

// 列表投影（spec 2.0）：列表响应不含 body（detail 才有）——所有列表
// 路由统一剥离，与真实后端同形；dev 校验的 additionalProperties:false
// 下带 body 会整页失配（mock empty 分支回填 faker 的既有症状）
export const summarize = (a: Article) =>
  Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'body'));
export const summaries = (as: Article[]) => as.map(summarize);

// 网络层 mock：app 的 API base 是 https://api.realworld.show/api/，
// page.route 按 URL 分发（glob 对 query string 的匹配不可靠，统一
// 解析 pathname）。未预期的端点回 404，让 mock 缺口在断言处显式暴露
// 而不是静默挂起。
export async function mockApi(page: Page, state: ApiState) {
  // 可选状态位归一：调用方只给 {published} 的既有形态不变
  state.deletedComments ??= [];
  state.settings ??= {...user};
  const bySlug = (slug: string): Article | undefined =>
    [article1, article2, userArticle, ...(state.published ? [newArticle] : [])]
      .filter((a) => a.slug !== state.deletedArticle)
      .find((a) => a.slug === slug);

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const {pathname: path} = new URL(req.url());
    const api = path.replace(/^\/api/, '');

    if (req.method() === 'POST' && api === '/users/login') {
      return json(route, 200, {user: state.settings});
    }
    if (req.method() === 'PUT' && api === '/user') {
      // Settings 更新：请求体 {user: UpdateUser}（password 可省略），
      // 权威用户照单合并（password 只消费不返回，显式挑字段）——后续
      // GET /profiles/<新 username> 读回新档案。字段回退用 undefined
      // 判定而非 ??：应用层把清空 bio/image 归一成显式 null 下发
      //（services/auth updateUser），?? 会把 null 误当「未提供」回退
      // 旧值；undefined 才是省略键
      const {user: update} = req.postDataJSON() as {
        user: Partial<typeof user> & {password?: string};
      };
      const current = state.settings!;
      const pick = <T,>(next: T | undefined, old: T): T =>
        next === undefined ? old : next;
      state.settings = {
        username: pick(update.username, current.username),
        email: pick(update.email, current.email),
        bio: pick(update.bio, current.bio),
        image: pick(update.image, current.image),
        token: current.token
      };
      return json(route, 200, {user: state.settings});
    }
    if (req.method() === 'GET' && api === '/tags') {
      return json(route, 200, {tags: ['e2e', 'smoke']});
    }
    if (req.method() === 'GET' && api === '/articles') {
      const {searchParams} = new URL(req.url());
      const all = state.published
        ? [newArticle, article1, article2, userArticle]
        : [article1, article2, userArticle];
      // Profile 页的两个维度按查询参数过滤（fixture 口径：alice 收藏了
      // bob 的文章）；Home 无 author/favorited 参数照常全量
      const byAuthor = searchParams.get('author');
      const byFavorited = searchParams.get('favorited');
      // 列表投影不含 body（spec 2.0，detail 才有）——与真实后端同形，
      // dev 校验的 additionalProperties:false 下带 body 会整页失配
      const filtered = all
        .filter((a) => a.slug !== state.deletedArticle)
        .filter((a) => !byAuthor || a.author.username === byAuthor)
        .filter(
          (a) => !byFavorited || (byFavorited === author.username && a.slug === article2.slug)
        );
      const articles = summaries(filtered);
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

    // Article 详情页的 CommentList 订阅评论实体（两条 fixture：alice 的
    // 一条 + 登录用户本人的一条——删除评论用例的作者权入口；空列表扫
    // 不到 Avatar/ListItem 的可访问性）
    const comments = /^\/articles\/([^/]+)\/comments$/.exec(api);
    if (req.method() === 'GET' && comments) {
      return json(route, 200, {
        comments: [
          {
            id: 1,
            // date-time 字符串对齐真实 API 形态（曾是毫秒数 number，
            // Comment 契约改为 PastDate 后失配）
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            body: 'Fixture comment for the article page.',
            author
          },
          {
            id: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            body: 'My own comment from the fixture user.',
            author: {
              username: user.username,
              bio: user.bio,
              image: user.image,
              following: false
            }
          }
        ].filter((c) => !state.deletedComments!.includes(c.id))
      });
    }
    const commentDel = /^\/articles\/([^/]+)\/comments\/([^/]+)$/.exec(api);
    if (req.method() === 'DELETE' && commentDel) {
      state.deletedComments!.push(Number(commentDel[2]));
      return json(route, 200, {});
    }

    // 档案端点（Profile 路由 loader 与 Register 查重共用）：alice 与
    // 当前用户（settings 权威副本）命中，其余 404
    const follow = /^\/profiles\/([^/]+)\/follow$/.exec(api);
    if (req.method() === 'POST' && follow) {
      return json(route, 200, {
        profile: {...author, following: true}
      });
    }
    const profile = /^\/profiles\/([^/]+)$/.exec(api);
    if (req.method() === 'GET' && profile) {
      const name = decodeURIComponent(profile[1]!);
      if (name === author.username) return json(route, 200, {profile: author});
      if (name === state.settings!.username)
        return json(route, 200, {
          profile: {
            username: state.settings!.username,
            bio: state.settings!.bio,
            image: state.settings!.image,
            following: false
          }
        });
      return json(route, 404, {errors: {profile: ['not found']}});
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
    if (req.method() === 'DELETE' && single) {
      // 删除文章：记为已删（后续 feed/详情端点随之 404/缺位），响应空体 200
      state.deletedArticle = single[1];
      return json(route, 200, {});
    }

    return json(route, 404, {errors: {body: [`unmocked ${req.method()} ${api}`]}});
  });
}

// 走 UI 登录（而非直写 localStorage）：登录表单本身就在被测链路里，
// mock 的 POST /users/login 返回带 token 的 user，auth 服务负责落
// localStorage['painless.user']
export async function login(page: Page) {
  await page.getByRole('link', {name: 'Login'}).click();
  await page.getByPlaceholder('Email').fill(user.email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  // 表单提交按钮（button）与导航栏 Login（link）角色不同，天然不冲突
  await page.getByRole('button', {name: 'Login'}).click();
  // 导航栏用户名以 link 角色断言：home feed 的 userArticle 卡片作者行
  // 同样渲染该 username（纯 Text 非 link，见 _shared/AuthorLine），
  // getByText 裸匹配双命中触发 strict mode；link 角色只命中导航入口
  await expect(page.getByRole('link', {name: user.username})).toBeVisible();
}
