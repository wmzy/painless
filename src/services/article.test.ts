import {describe, it, expect, vi, beforeEach} from 'vitest';

import * as article from '@/services/article';

vi.mock('@/util/http', () => ({
  get: vi.fn()
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

      expect(http.get).toHaveBeenCalledWith('articles', undefined, undefined);
      expect(result).toEqual(mockData);
    });

    it('should pass query params to http.get', async () => {
      const mockData = {articles: [], articlesCount: 0};
      vi.mocked(http.get).mockResolvedValue(mockData);

      const params = {limit: 10, offset: 0, tag: 'react'};
      await article.query(params);

      expect(http.get).toHaveBeenCalledWith('articles', params, undefined);
    });

    it('should forward abort signal to http.get', async () => {
      vi.mocked(http.get).mockResolvedValue({articles: [], articlesCount: 0});
      const controller = new AbortController();

      await article.query({limit: 10}, controller.signal);

      expect(http.get).toHaveBeenCalledWith(
        'articles',
        {limit: 10},
        controller.signal
      );
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
        undefined
      );
      expect(result).toEqual(mockArticle);
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
        undefined
      );
      expect(result).toEqual(mockComments);
    });
  });

  describe('fetchTags', () => {
    it('should fetch tags and return tags array', async () => {
      const mockTags = ['react', 'typescript', 'vitest'];
      vi.mocked(http.get).mockResolvedValue({tags: mockTags});

      const result = await article.fetchTags();

      expect(http.get).toHaveBeenCalledWith('tags', undefined, undefined);
      expect(result).toEqual(mockTags);
    });
  });
});
