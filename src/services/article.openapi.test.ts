import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import * as ff from 'fetch-fun';

import * as openapi from '@/services/article.openapi';

// spec × validate 配对（decisions.md 第 6 条）的行为面：openapi 通道在
// DEV 下逐端点挂生成 schema 校验——好形状（含新契约的 bio/image 可
// null）放行直返 envelope，坏形状抛 ff.ValidationError 且 message 定位
// 到端点与实例指针。fetch 替身模式与 util/http.test.ts 同款。

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    statusText: 'OK',
    url: 'https://api.realworld.io/api/test',
    type: 'basic' as const,
    headers: new Headers(),
    text: vi.fn().mockResolvedValue(JSON.stringify(body))
  } as unknown as Response;
}

describe('article.openapi（spec 类型通道 × DEV 校验）', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('query：好形状直返 spec 原始 envelope（author.bio/image 为 null 合法）', async () => {
    const page = {
      articles: [
        {
          slug: 'some-title-1',
          title: 'Some title',
          description: 'desc',
          body: 'line1\nline2',
          tagList: ['dragons'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          favorited: false,
          favoritesCount: 0,
          author: {username: 'alice', bio: null, image: null, following: false}
        }
      ],
      articlesCount: 1
    };
    fetchMock.mockResolvedValue(mockResponse(page));

    await expect(openapi.query({limit: 10})).resolves.toEqual(page);
    // query 参数经管道序列化进 URL
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.realworld.io/api/articles?limit=10'
    );
  });

  it('query：2xx 响应失配 schema 抛定位的 ValidationError', async () => {
    // image 是 spec 手写双口径统一后的 Image | null——42 既非 string
    // 也非 null，anyOf 两分支全败
    fetchMock.mockResolvedValue(
      mockResponse({
        articles: [
          {
            slug: 's',
            title: 't',
            description: 'd',
            body: 'b',
            tagList: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            favorited: false,
            favoritesCount: 0,
            author: {username: 'alice', bio: null, image: 42, following: false}
          }
        ],
        articlesCount: 1
      })
    );

    const error = await openapi.query().then(
      () => undefined,
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(ff.ValidationError);
    const validation = error as ff.ValidationError;
    expect(validation.message).toContain('GET /articles');
    expect(validation.message).toContain('/articles/0/author/image');
  });

  it('findBySlug：typedPath 路径参数替换 + envelope(article) 校验', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        article: {
          slug: 'some-title-1',
          title: 'Some title',
          description: 'desc',
          body: 'b',
          tagList: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          favorited: false,
          favoritesCount: 0,
          author: {username: 'alice', bio: null, image: null, following: false}
        }
      })
    );

    await expect(openapi.findBySlug('some title')).resolves.toMatchObject({
      article: {slug: 'some-title-1'}
    });
    // 路径参数经 fillPath 逐值 encodeURIComponent（空格 → %20）
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.realworld.io/api/articles/some%20title'
    );
  });
});
