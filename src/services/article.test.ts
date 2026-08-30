import {describe, it, expect, vi, beforeEach} from 'vitest';

import * as article from '@/services/article';

vi.mock('@/util/http', () => ({
  get: vi.fn(),
  post: vi.fn(),
  del: vi.fn()
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

      expect(http.get).toHaveBeenCalledWith('articles', undefined, {
        signal: undefined, schema: expect.any(Object)
      });
      expect(result).toEqual(mockData);
    });

    it('should pass query params to http.get', async () => {
      const mockData = {articles: [], articlesCount: 0};
      vi.mocked(http.get).mockResolvedValue(mockData);

      const params = {limit: 10, offset: 0, tag: 'react'};
      await article.query(params);

      expect(http.get).toHaveBeenCalledWith('articles', params, {
        signal: undefined, schema: expect.any(Object)
      });
    });

    it('should forward abort signal to http.get', async () => {
      vi.mocked(http.get).mockResolvedValue({articles: [], articlesCount: 0});
      const controller = new AbortController();

      await article.query({limit: 10}, controller.signal);

      expect(http.get).toHaveBeenCalledWith('articles', {limit: 10}, {
        signal: controller.signal, schema: expect.any(Object)
      });
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
        {signal: undefined, schema: expect.any(Object)}
      );
      expect(result).toEqual(mockArticle);
    });

    it('should forward abort signal to http.get', async () => {
      vi.mocked(http.get).mockResolvedValue({
        article: {slug: 'a', title: 'A'}
      });
      const controller = new AbortController();

      await article.findByTitle('a', controller.signal);

      expect(http.get).toHaveBeenCalledWith('articles/a', undefined, {
        signal: controller.signal, schema: expect.any(Object)
      });
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
        {signal: undefined, schema: expect.any(Object)}
      );
      expect(result).toEqual(mockComments);
    });
  });

  describe('fetchTags', () => {
    it('should fetch tags and return tags array', async () => {
      const mockTags = ['react', 'typescript', 'vitest'];
      vi.mocked(http.get).mockResolvedValue({tags: mockTags});

      const result = await article.fetchTags();

      expect(http.get).toHaveBeenCalledWith('tags', undefined, {
        signal: undefined, schema: expect.any(Object)
      });
      expect(result).toEqual(mockTags);
    });

    it('should forward abort signal to http.get', async () => {
      vi.mocked(http.get).mockResolvedValue({tags: []});
      const controller = new AbortController();

      await article.fetchTags(controller.signal);

      expect(http.get).toHaveBeenCalledWith('tags', undefined, {
        signal: controller.signal, schema: expect.any(Object)
      });
    });
  });

  describe('mutations', () => {
    const mockArticle = {slug: 'a', favorited: false};
    const mockAuthor = {username: 'jake', following: false};

    it('should POST favorite when favoriting', async () => {
      vi.mocked(http.post).mockResolvedValue({article: mockArticle});

      const result = await article.favoriteArticle('a', true);

      expect(http.post).toHaveBeenCalledWith(
        'articles/a/favorite',
        {},
        {signal: undefined, schema: expect.any(Object)}
      );
      expect(result).toEqual(mockArticle);
    });

    it('should DELETE favorite when unfavoriting', async () => {
      vi.mocked(http.del).mockResolvedValue({article: mockArticle});

      const result = await article.favoriteArticle('a', false);

      expect(http.del).toHaveBeenCalledWith('articles/a/favorite', {
        signal: undefined, schema: expect.any(Object)
      });
      expect(result).toEqual(mockArticle);
    });

    it('should POST follow when following', async () => {
      vi.mocked(http.post).mockResolvedValue({profile: mockAuthor});

      const result = await article.followAuthor('jake', true);

      expect(http.post).toHaveBeenCalledWith(
        'profiles/jake/follow',
        {},
        {signal: undefined, schema: expect.any(Object)}
      );
      expect(result).toEqual(mockAuthor);
    });

    it('should DELETE follow when unfollowing', async () => {
      vi.mocked(http.del).mockResolvedValue({profile: mockAuthor});

      const result = await article.followAuthor('jake', false);

      expect(http.del).toHaveBeenCalledWith('profiles/jake/follow', {
        signal: undefined, schema: expect.any(Object)
      });
      expect(result).toEqual(mockAuthor);
    });

    it('should POST comment with body', async () => {
      const mockComment = {id: '1', body: 'Nice'};
      vi.mocked(http.post).mockResolvedValue({comment: mockComment});

      const result = await article.addComment('a', 'Nice');

      expect(http.post).toHaveBeenCalledWith(
        'articles/a/comments',
        {comment: {body: 'Nice'}},
        {signal: undefined, schema: expect.any(Object)}
      );
      expect(result).toEqual(mockComment);
    });

    it('should forward abort signal on mutations', async () => {
      vi.mocked(http.post).mockResolvedValue({comment: {id: '1'}});
      const controller = new AbortController();

      await article.addComment('a', 'Nice', controller.signal);

      expect(http.post).toHaveBeenCalledWith(
        'articles/a/comments',
        {comment: {body: 'Nice'}},
        {signal: controller.signal, schema: expect.any(Object)}
      );
    });
  });
});
