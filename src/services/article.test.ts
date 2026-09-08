import {describe, it, expect, vi, beforeEach} from 'vitest';

import * as article from '@/services/article';

// 只 mock 传输出口：api/toggleApi/withSignal/withDevValidation 保持真实，
// 服务层的链派生（schema 静态烘焙 + signal 每请求挂载）照实执行，
// 断言经 objectContaining 钉住落在 get 第三参上的 signal。
vi.mock('@/util/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/util/http')>()),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  postRetryable: vi.fn(),
  delRetryable: vi.fn()
}));

import * as http from '@/util/http';

describe('article service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('query', () => {
    it('should call http.get with articles endpoint', async () => {
      const mockData = {articles: [], articlesCount: 0};
      vi.mocked(http.get).mockResolvedValue(mockData);

      const result = await article.query();

      expect(http.get).toHaveBeenCalledWith('articles', undefined, expect.objectContaining({signal: undefined}));
      expect(result).toEqual(mockData);
    });

    it('should pass query params to http.get', async () => {
      const mockData = {articles: [], articlesCount: 0};
      vi.mocked(http.get).mockResolvedValue(mockData);

      const params = {limit: 10, offset: 0, tag: 'react'};
      await article.query(params);

      expect(http.get).toHaveBeenCalledWith('articles', params, expect.objectContaining({signal: undefined}));
    });

    it('should forward abort signal to http.get', async () => {
      vi.mocked(http.get).mockResolvedValue({articles: [], articlesCount: 0});
      const controller = new AbortController();

      await article.query({limit: 10}, controller.signal);

      expect(http.get).toHaveBeenCalledWith('articles', {limit: 10}, expect.objectContaining({signal: controller.signal}));
    });
  });

  describe('findByTitle', () => {
    it('should fetch article by title and return article property', async () => {
      const mockArticle = {title: 'Test Article', slug: 'test-article'};
      vi.mocked(http.get).mockResolvedValue({article: mockArticle});

      const result = await article.findByTitle('test-article');

      expect(http.get).toHaveBeenCalledWith(
        'articles/test-article',
        undefined,
        expect.objectContaining({signal: undefined})
      );
      expect(result).toEqual(mockArticle);
    });

    it('should forward abort signal to http.get', async () => {
      vi.mocked(http.get).mockResolvedValue({
        article: {slug: 'a', title: 'A'}
      });
      const controller = new AbortController();

      await article.findByTitle('a', controller.signal);

      expect(http.get).toHaveBeenCalledWith('articles/a', undefined, expect.objectContaining({signal: controller.signal}));
    });
  });

  describe('fetchCommentsByTitle', () => {
    it('should fetch comments for an article', async () => {
      const mockComments = [
        {id: '1', body: 'Comment 1'},
        {id: '2', body: 'Comment 2'}
      ];
      vi.mocked(http.get).mockResolvedValue({comments: mockComments});

      const result = await article.fetchCommentsByTitle('test-article');

      expect(http.get).toHaveBeenCalledWith(
        'articles/test-article/comments',
        undefined,
        expect.objectContaining({signal: undefined})
      );
      expect(result).toEqual(mockComments);
    });
  });

  describe('fetchTags', () => {
    it('should fetch tags and return tags array', async () => {
      const mockTags = ['react', 'typescript', 'vitest'];
      vi.mocked(http.get).mockResolvedValue({tags: mockTags});

      const result = await article.fetchTags();

      expect(http.get).toHaveBeenCalledWith('tags', undefined, expect.objectContaining({signal: undefined}));
      expect(result).toEqual(mockTags);
    });

    it('should forward abort signal to http.get', async () => {
      vi.mocked(http.get).mockResolvedValue({tags: []});
      const controller = new AbortController();

      await article.fetchTags(controller.signal);

      expect(http.get).toHaveBeenCalledWith('tags', undefined, expect.objectContaining({signal: controller.signal}));
    });
  });

  describe('mutations', () => {
    const mockArticle = {slug: 'a', favorited: false};
    const mockAuthor = {username: 'jake', following: false};

    // favorite/follow 是效果幂等的 toggle 写：走 retryable 出口（重试
    // 白名单含 POST 的兄弟 client），不经普通 post/del——断言出口本身
    // 就是断言「这两个端点的写允许瞬时失败重试」。
    it('should POST favorite when favoriting', async () => {
      vi.mocked(http.postRetryable).mockResolvedValue({article: mockArticle});

      const result = await article.favoriteArticle('a', true);

      expect(http.postRetryable).toHaveBeenCalledWith(
        'articles/a/favorite',
        {},
        expect.objectContaining({signal: undefined})
      );
      expect(http.post).not.toHaveBeenCalled();
      expect(result).toEqual(mockArticle);
    });

    it('should DELETE favorite when unfavoriting', async () => {
      vi.mocked(http.delRetryable).mockResolvedValue({article: mockArticle});

      const result = await article.favoriteArticle('a', false);

      expect(http.delRetryable).toHaveBeenCalledWith('articles/a/favorite', expect.objectContaining({signal: undefined}));
      expect(http.del).not.toHaveBeenCalled();
      expect(result).toEqual(mockArticle);
    });

    it('should POST follow when following', async () => {
      vi.mocked(http.postRetryable).mockResolvedValue({profile: mockAuthor});

      const result = await article.followAuthor('jake', true);

      expect(http.postRetryable).toHaveBeenCalledWith(
        'profiles/jake/follow',
        {},
        expect.objectContaining({signal: undefined})
      );
      expect(http.post).not.toHaveBeenCalled();
      expect(result).toEqual(mockAuthor);
    });

    it('should DELETE follow when unfollowing', async () => {
      vi.mocked(http.delRetryable).mockResolvedValue({profile: mockAuthor});

      const result = await article.followAuthor('jake', false);

      expect(http.delRetryable).toHaveBeenCalledWith('profiles/jake/follow', expect.objectContaining({signal: undefined}));
      expect(http.del).not.toHaveBeenCalled();
      expect(result).toEqual(mockAuthor);
    });

    // 发评论是「每次调用新增实体」的写：必须留在永不重试的普通 post
    // 出口（POST 在默认 retry 白名单外，重放即重复评论）。
    it('should POST comment with body', async () => {
      const mockComment = {id: '1', body: 'Nice'};
      vi.mocked(http.post).mockResolvedValue({comment: mockComment});

      const result = await article.addComment('a', 'Nice');

      expect(http.post).toHaveBeenCalledWith(
        'articles/a/comments',
        {comment: {body: 'Nice'}},
        expect.objectContaining({signal: undefined})
      );
      expect(http.postRetryable).not.toHaveBeenCalled();
      expect(result).toEqual(mockComment);
    });

    it('should forward abort signal on mutations', async () => {
      vi.mocked(http.post).mockResolvedValue({comment: {id: '1'}});
      const controller = new AbortController();

      await article.addComment('a', 'Nice', controller.signal);

      expect(http.post).toHaveBeenCalledWith(
        'articles/a/comments',
        {comment: {body: 'Nice'}},
        expect.objectContaining({signal: controller.signal})
      );
    });
  });

  describe('queryProfileFeed', () => {
    // Profile 页两个维度的投影：scope='author' → ?author=<username>，
    // scope='favorited' → ?favorited=<username>，offset/limit 原样透传
    it('should map author scope onto the author query param', async () => {
      vi.mocked(http.get).mockResolvedValue({articles: [], articlesCount: 0});

      await article.queryProfileFeed({
        username: 'alice',
        scope: 'author',
        offset: 10,
        limit: 5
      });

      expect(http.get).toHaveBeenCalledWith(
        'articles',
        {author: 'alice', offset: 10, limit: 5},
        expect.objectContaining({signal: undefined})
      );
    });

    it('should map favorited scope onto the favorited query param', async () => {
      vi.mocked(http.get).mockResolvedValue({articles: [], articlesCount: 0});

      await article.queryProfileFeed({
        username: 'alice',
        scope: 'favorited',
        offset: 0,
        limit: 10
      });

      expect(http.get).toHaveBeenCalledWith(
        'articles',
        {favorited: 'alice', offset: 0, limit: 10},
        expect.objectContaining({signal: undefined})
      );
    });
  });

  describe('deletions', () => {
    // 删除是「移除既有实体」的写：DELETE 在 fetch-fun 默认重试白名单
    //（幂等方法）内——重复施加收敛到同一终态，走主 client 的普通 del
    //（与 toggle 专用 delRetryable 的边界：后者只服务 favorite/follow）
    it('should DELETE the article endpoint and resolve void', async () => {
      vi.mocked(http.del).mockResolvedValue({});

      await expect(article.deleteArticle('a')).resolves.toBeUndefined();

      expect(http.del).toHaveBeenCalledWith('articles/a', expect.objectContaining({signal: undefined}));
      expect(http.delRetryable).not.toHaveBeenCalled();
    });

    it('should DELETE the comment endpoint with encoded params and resolve void', async () => {
      vi.mocked(http.del).mockResolvedValue({});

      await expect(
        article.deleteComment('a b/c', 1)
      ).resolves.toBeUndefined();

      expect(http.del).toHaveBeenCalledWith('articles/a%20b%2Fc/comments/1', expect.objectContaining({signal: undefined}));
    });

    it('should forward abort signal on deletions', async () => {
      vi.mocked(http.del).mockResolvedValue({});
      const controller = new AbortController();

      await article.deleteArticle('a', controller.signal);

      expect(http.del).toHaveBeenCalledWith('articles/a', expect.objectContaining({signal: controller.signal}));
    });
  });
});
