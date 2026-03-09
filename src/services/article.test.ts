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
      vi.mocked(http.get).mockResolvedValue(mockData as any);

      const result = await article.query();

      expect(http.get).toHaveBeenCalledWith('articles', undefined);
      expect(result).toEqual(mockData);
    });

    it('should pass query params to http.get', async () => {
      const mockData = {articles: [], articlesCount: 0};
      vi.mocked(http.get).mockResolvedValue(mockData as any);

      const params = {limit: 10, offset: 0, tag: 'react'};
      await article.query(params);

      expect(http.get).toHaveBeenCalledWith('articles', params);
    });
  });

  describe('findByTitle', () => {
    it('should fetch article by title and return article property', async () => {
      const mockArticle = {title: 'Test Article', slug: 'test-article'};
      vi.mocked(http.get).mockResolvedValue({article: mockArticle} as any);

      const result = await article.findByTitle('test-article');

      expect(http.get).toHaveBeenCalledWith('articles/test-article');
      expect(result).toEqual(mockArticle);
    });
  });

  describe('fetchCommentsByTitle', () => {
    it('should fetch comments for an article', async () => {
      const mockComments = [
        {id: '1', body: 'Comment 1'},
        {id: '2', body: 'Comment 2'}
      ];
      vi.mocked(http.get).mockResolvedValue({comments: mockComments} as any);

      const result = await article.fetchCommentsByTitle('test-article');

      expect(http.get).toHaveBeenCalledWith('articles/test-article/comments');
      expect(result).toEqual(mockComments);
    });
  });

  describe('fetchTags', () => {
    it('should fetch tags and return tags array', async () => {
      const mockTags = ['react', 'typescript', 'vitest'];
      vi.mocked(http.get).mockResolvedValue({tags: mockTags} as any);

      const result = await article.fetchTags();

      expect(http.get).toHaveBeenCalledWith('tags');
      expect(result).toEqual(mockTags);
    });
  });
});
