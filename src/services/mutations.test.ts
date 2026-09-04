// 来源：生态评审后置项 #13 —— cache.mutation 组合管道（services/mutations.ts）
// 此前只有 Home/Article 视图测试经 UI 链路间接覆盖（乐观/回滚/toast/refresh
// 扇出），缺「直调管道、断言缓存快照」的语义级测试。本文件 mock 服务层
// （favoriteArticle/followAuthor），用真实 createQueryCache 建测试文件专属
// 的临时 articleCache/homeCache 驱动 favoriteOnArticle/favoriteOnHome/
// followOnArticle，钉住两条仅靠视图测试难以观测的语义：①favorite 双层组合
// 失败时 article 层与 home 层各自独立回滚；②follow 的 apply 以 settle 时
// 当前缓存值为基（peek-merge，不回滚在飞期间 favorite 的并发写穿）。
// 归并建议：Home/Article 视图测试保持 UI 口径（按钮态/toast/卡片重渲染），
// cache 语义断言以本文件为准；若后续出现双份断言漂移，优先把视图测试里的
// 缓存形状断言收敛到此处，视图侧只留用户可见行为。
import type {Article, ArticlePage, Author} from '@/types';
import type {HomeSearch} from '@/types/search';

import {describe, it, expect, vi, beforeEach} from 'vitest';

// 临时 cache：机制用真实现（createQueryCache → createMemoryCacheProvider），
// 实例为本文件专属——mutations.ts 闭包绑定的 articleCache/homeCache 经模块
// mock 换成下面的新建实例，与其它测试文件的模块实体（含 tagsCache 的
// localStorage 镜像）互不干扰；用例间 clear 清场即可
vi.mock('@/util/useQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/util/useQuery')>();
  return {
    ...actual,
    articleCache: actual.createQueryCache<Article, [string]>(
      'article@mutations.test'
    ),
    homeCache: actual.createQueryCache<ArticlePage, [HomeSearch]>(
      'home@mutations.test'
    )
  };
});

// mutations.ts 经 `import * as api from './article'` 消费——与本 import 解析
// 到同一模块文件，mock 对两侧同时生效（Home 视图测试同款先例）
vi.mock('@/services/article', () => ({
  favoriteArticle: vi.fn(),
  followAuthor: vi.fn()
}));

import {articleCache, homeCache} from '@/util/useQuery';
import {favoriteArticle, followAuthor} from '@/services/article';

import {favoriteOnArticle, favoriteOnHome, followOnArticle} from './mutations';

const favoriteMock = vi.mocked(favoriteArticle);
const followMock = vi.mocked(followAuthor);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

const author = (following: boolean): Author => ({
  username: 'alice',
  bio: 'old bio',
  image: 'old.png',
  following
});

const article = (slug: string, favoritesCount: number): Article => ({
  slug,
  title: `title-${slug}`,
  description: 'desc',
  body: 'body',
  tagList: ['react'],
  favorited: false,
  favoritesCount,
  author: author(false),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
});

// homeCache 的 key 形状对齐视图侧 homeCacheArgs：缺省 tag 不带键
const pageKey = (search?: string): [HomeSearch] => [
  search ? {tag: search, offset: 0, limit: 10} : {offset: 0, limit: 10}
];

beforeEach(() => {
  vi.resetAllMocks();
  articleCache.clear();
  homeCache.clear();
});

describe('favorite 双层组合（article 实体层 × home 投影层）', () => {
  const base = article('slug-x', 5);
  const neighbor = article('slug-y', 7);
  const page: ArticlePage = {articles: [base, neighbor], articlesCount: 2};
  // 页内不含 slug-x 的筛选页：miss-bail 语义的观测对象（update 返回
  // undefined → 整页跳过，写与回滚都不触达）
  const untouchedPage: ArticlePage = {
    articles: [article('slug-z', 1)],
    articlesCount: 1
  };

  beforeEach(() => {
    articleCache.set(['slug-x'], base);
    homeCache.set(pageKey(), page);
    homeCache.set(pageKey('react'), untouchedPage);
  });

  it('成功写穿两层：apply 以服务端权威字段收口，邻项与不含该 slug 的页不动', async () => {
    favoriteMock.mockResolvedValueOnce({
      ...base,
      favorited: true,
      favoritesCount: 9
    });

    await favoriteOnHome('slug-x', true);

    // article 实体层：服务端 favorite 域覆盖乐观值
    expect(articleCache.peek?.(['slug-x'])?.value).toMatchObject({
      favorited: true,
      favoritesCount: 9
    });
    // home 投影层：页内仅目标项被替换（author 域在 favorite 的 apply 里
    // 不动，保持原引用对象）
    const settled = homeCache.peek?.(pageKey())?.value;
    expect(settled?.articles[0]).toMatchObject({
      slug: 'slug-x',
      favorited: true,
      favoritesCount: 9
    });
    expect(settled?.articles[1]).toBe(neighbor);
    // 未含该 slug 的页：apply 阶段 patchArticleIn 恒返回新页对象（无
    // miss-bail），条目引用换新但内容与页内项引用不变——断言内容相等；
    // update 阶段的 miss-bail（未写即无 journal，引用原样幸存）由下方
    // 回滚用例以引用复原钉住
    expect(homeCache.peek?.(pageKey('react'))?.value).toEqual(untouchedPage);
  });

  it('服务拒绝：同步乐观步写穿两层，settle 后两层各自回滚到原引用', async () => {
    const pending = deferred<Article>();
    favoriteMock.mockReturnValueOnce(pending.promise);

    const result = favoriteOnHome('slug-x', true);

    // 直调管道无 useMutation 的 scope 微任务队列：update 同步执行，调用
    // 表达式返回后两层缓存即持有乐观值（这是「回滚确实发生」的前提观测）
    expect(articleCache.peek?.(['slug-x'])?.value).toMatchObject({
      favorited: true,
      favoritesCount: 6
    });
    const optimistic = homeCache.peek?.(pageKey())?.value;
    expect(optimistic?.articles[0]).toMatchObject({
      favorited: true,
      favoritesCount: 6
    });

    pending.reject(new Error('network down'));
    // rejection 原样上抛（视图侧 toast 依赖它），且抛出前回滚已完成
    await expect(result).rejects.toThrow('network down');

    // 两层独立回滚：journal 恢复的是写前引用（toBe 而非 toEqual——引用
    // 复原即内容复原，且能排除「重算出同形新对象」的假回滚）
    expect(articleCache.peek?.(['slug-x'])?.value).toBe(base);
    expect(homeCache.peek?.(pageKey())?.value).toBe(page);
    expect(homeCache.peek?.(pageKey('react'))?.value).toBe(untouchedPage);
    expect(favoriteMock).toHaveBeenCalledWith('slug-x', true);
  });
});

describe('follow 的 peek-merge（apply 以 settle 时当前值为基）', () => {
  const base = article('slug-x', 5);

  beforeEach(() => {
    articleCache.set(['slug-x'], base);
  });

  it('在飞期间 favorite 已写穿：follow 的 apply 只收 author 域，不回滚 favorite 字段', async () => {
    const followPending = deferred<Author>();
    followMock.mockReturnValueOnce(followPending.promise);

    const followResult = followOnArticle('slug-x', 'alice', true);

    // 乐观步只动 author.following，favorite 域原样
    const optimistic = articleCache.peek?.(['slug-x'])?.value;
    expect(optimistic?.author).toMatchObject({
      following: true
    });
    expect(articleCache.peek?.(['slug-x'])?.value).toMatchObject({
      favorited: false,
      favoritesCount: 5
    });

    // follow 在飞期间 favorite 独立 settle：实体缓存被 favorite 域写穿
    favoriteMock.mockResolvedValueOnce({
      ...base,
      favorited: true,
      favoritesCount: 9
    });
    await favoriteOnArticle('slug-x', true);
    expect(articleCache.peek?.(['slug-x'])?.value).toMatchObject({
      favorited: true,
      favoritesCount: 9
    });

    // follow settle：响应是请求发出那一刻的旧实体里的 author——apply 若
    // 以快照为基全量铺开会连 favorite 域一起回滚到旧值；以 settle 时当前
    // 值为基 + 只取 author 域，favorite 写穿得以幸存
    followPending.resolve({
      username: 'alice',
      bio: 'new bio',
      image: 'new.png',
      following: true
    });
    await followResult;

    const settled = articleCache.peek?.(['slug-x'])?.value;
    expect(settled?.author).toEqual({
      username: 'alice',
      bio: 'new bio',
      image: 'new.png',
      following: true
    });
    expect(settled).toMatchObject({favorited: true, favoritesCount: 9});
  });
});
